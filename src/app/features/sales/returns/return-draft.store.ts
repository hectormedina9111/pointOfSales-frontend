import { Injectable, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormControl, ValidationErrors, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs';

import { PaymentMethodView } from '../../../core/api/payment-methods-api';
import {
  AuthorizationRequest,
  ReturnLineRequest,
  ReturnQuoteRequest,
  ReturnQuoteView,
  ReturnRequest,
  ReturnableView,
  SalesApi,
} from '../../../core/api/sales-api';
import { numberToCents, numberToThousandths, thousandthsToQuantity } from '../../../shared/forms/amounts';
import { randomUuid } from '../../../shared/ids/random-uuid';
import {
  RefundDraft,
  RefundOption,
  canRefundWithOriginal,
  quantityThousandths,
  returnQuantityError,
  sumRefundsCents,
} from './return-math';

/** Pausa tras cambiar las cantidades antes de cotizar, en milisegundos. */
const QUOTE_DEBOUNCE_MS = 300;
/** Largo máximo del motivo de la devolución. */
export const REASON_MAX = 300;

/** Al menos una línea con cantidad mayor que cero. Las líneas con error ya invalidan el conjunto. */
function atLeastOneQuantity(control: AbstractControl): ValidationErrors | null {
  const values = control.value as readonly string[];
  return values.some((text) => (quantityThousandths(text) ?? 0) > 0) ? null : { required: true };
}

/** El motivo no puede ser solo espacios. */
function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() === '' ? { required: true } : null;
}

/**
 * Estado de la devolución por pasos: cantidades por línea, cotización, motivo y reembolsos. Vive
 * mientras dure la pantalla. Los controles de cada paso son fijos; el asistente lee su validez. La
 * clave de idempotencia se crea una vez, así un reintento del guardado devuelve la misma devolución.
 */
@Injectable()
export class ReturnDraftStore {
  private readonly sales = inject(SalesApi);

  /** Id de la venta que se devuelve; lo fija start(). */
  saleId = 0;
  readonly idempotencyKey = randomUuid();
  private nextKey = 1;
  /** Se incrementa con cada cambio de cantidades: una cotización vieja no se aplica. */
  private generation = 0;
  private readonly quoteTrigger = new Subject<void>();

  readonly returnable = signal<ReturnableView | null>(null);
  readonly currency = signal<string | null>(null);
  readonly paymentMethods = signal<readonly PaymentMethodView[]>([]);
  readonly quote = signal<ReturnQuoteView | null>(null);
  readonly quotePending = signal(false);
  readonly quoteError = signal<unknown>(null);
  readonly refunds = signal<readonly RefundDraft[]>([]);
  readonly saving = signal(false);
  readonly actionError = signal<unknown>(null);

  readonly sameDay = computed(() => this.returnable()?.sameDay ?? false);
  readonly hasReturnable = computed(() => (this.returnable()?.lines ?? []).some((line) => line.returnableQuantity > 0));
  readonly totalCents = computed(() => {
    const current = this.quote();
    return current === null ? 0 : numberToCents(current.total);
  });
  readonly refundedCents = computed(() => sumRefundsCents(this.refunds()));
  readonly pendingCents = computed(() => this.totalCents() - this.refundedCents());
  readonly quoteReady = computed(() => this.quote() !== null && !this.quotePending() && this.quoteError() === null);
  /** Devolución del mismo día: los reembolsos deben sumar exacto el total cotizado. Otra: no hay reembolsos. */
  readonly refundsReady = computed(() => !this.sameDay() || (this.quoteReady() && this.pendingCents() === 0));

  /** Formas de reembolso del mismo día: efectivo y los métodos de la venta con saldo por devolver. */
  readonly refundOptions = computed<readonly RefundOption[]>(() => {
    const current = this.returnable();
    if (current === null || !current.sameDay) {
      return [];
    }
    const methods = this.paymentMethods();
    const methodOf = (code: string) => methods.find((method) => method.code === code);
    const options: RefundOption[] = [];
    if (current.allowedRefundMethods.includes('CASH')) {
      options.push({
        code: 'CASH',
        name: methodOf('CASH')?.name ?? 'CASH',
        requiresReference: methodOf('CASH')?.requiresReference ?? false,
        refundable: null,
      });
    }
    if (current.allowedRefundMethods.includes('ORIGINAL_METHOD')) {
      for (const payment of current.payments) {
        if (payment.refundable > 0 && canRefundWithOriginal(payment.paymentMethodCode)) {
          options.push({
            code: payment.paymentMethodCode,
            name: payment.paymentMethodName,
            requiresReference: methodOf(payment.paymentMethodCode)?.requiresReference ?? false,
            refundable: payment.refundable,
          });
        }
      }
    }
    return options;
  });

  /** Una fila por línea de la venta, en el mismo orden que returnable.lines. */
  readonly linesControl = new FormArray<FormControl<string>>([], { validators: [atLeastOneQuantity] });
  readonly reasonControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(REASON_MAX), notBlank],
  });
  readonly refundsControl = new FormControl<readonly RefundDraft[]>([], {
    nonNullable: true,
    validators: [(): ValidationErrors | null => (this.refundsReady() ? null : { refunds: true })],
  });
  /** Último paso: solo se puede confirmar con una cotización al día. */
  readonly summaryControl = new FormControl<null>(null, {
    validators: [(): ValidationErrors | null => (this.quoteReady() ? null : { quote: true })],
  });

  constructor() {
    this.linesControl.valueChanges.subscribe(() => this.onLinesChanged());
    this.quoteTrigger
      .pipe(
        debounceTime(QUOTE_DEBOUNCE_MS),
        switchMap(() => this.requestQuote()),
      )
      .subscribe();
  }

  /** Carga la devolución de una venta y arma una fila por línea. */
  start(saleId: number, returnable: ReturnableView): void {
    this.saleId = saleId;
    this.returnable.set(returnable);
    this.linesControl.clear();
    for (const line of returnable.lines) {
      const maxThousandths = numberToThousandths(line.returnableQuantity);
      this.linesControl.push(
        new FormControl<string>('', {
          nonNullable: true,
          validators: [
            (control: AbstractControl): ValidationErrors | null => {
              const error = returnQuantityError(control.value, maxThousandths);
              return error === null ? null : { [error]: true };
            },
          ],
        }),
      );
    }
    this.refresh();
  }

  /** Cantidad escrita de una línea, por su posición. */
  lineControl(index: number): FormControl<string> {
    return this.linesControl.at(index);
  }

  /** Pone en cada línea lo que todavía se puede devolver. */
  returnAll(): void {
    this.returnable()?.lines.forEach((line, index) => {
      this.lineControl(index).setValue(thousandthsToQuantity(numberToThousandths(line.returnableQuantity)));
    });
  }

  addRefund(input: Omit<RefundDraft, 'key'>): void {
    this.refunds.update((list) => [...list, { key: this.nextKey++, ...input }]);
    this.refresh();
  }

  removeRefund(key: number): void {
    this.refunds.update((list) => list.filter((refund) => refund.key !== key));
    this.refresh();
  }

  /** Cuerpo de POST /sales/{id}/returns con las líneas que tienen cantidad. authorization solo en el reintento. */
  buildRequest(authorization: AuthorizationRequest | null): ReturnRequest {
    return {
      lines: this.selectedLines(),
      reason: this.reasonControl.value.trim(),
      refunds: this.sameDay()
        ? this.refunds().map((refund) => ({
            paymentMethodCode: refund.paymentMethodCode,
            amount: refund.amount,
            reference: refund.reference,
          }))
        : [],
      authorization,
      idempotencyKey: this.idempotencyKey,
    };
  }

  private onLinesChanged(): void {
    this.generation++;
    this.quote.set(null);
    this.quoteError.set(null);
    this.quotePending.set(this.linesControl.valid && this.selectedLines().length > 0);
    if (this.quotePending()) {
      this.quoteTrigger.next();
    }
    this.refresh();
  }

  /** Cotiza con las líneas vigentes al terminar la pausa. Ignora respuestas de cambios anteriores. */
  private requestQuote(): Observable<ReturnQuoteView> | Observable<never> {
    if (!this.linesControl.valid || this.selectedLines().length === 0) {
      this.quotePending.set(false);
      this.refresh();
      return EMPTY;
    }
    const generation = this.generation;
    const body: ReturnQuoteRequest = { lines: this.selectedLines() };
    return this.sales.returnQuote(this.saleId, body).pipe(
      tap((quote) => {
        if (generation !== this.generation) {
          return;
        }
        this.quote.set(quote);
        this.quoteError.set(null);
        this.quotePending.set(false);
        this.refresh();
      }),
      catchError((error: unknown) => {
        if (generation === this.generation) {
          this.quote.set(null);
          this.quoteError.set(error);
          this.quotePending.set(false);
          this.refresh();
        }
        return EMPTY;
      }),
    );
  }

  /**
   * Líneas con cantidad mayor que cero, en la forma del backend (tres decimales). Recorre los controles
   * que existen: al armar las filas, cada alta avisa del cambio antes de que estén todas.
   */
  private selectedLines(): ReturnLineRequest[] {
    const lines = this.returnable()?.lines ?? [];
    return this.linesControl.controls.flatMap((control, index) => {
      const line = lines[index];
      const thousandths = quantityThousandths(control.value) ?? 0;
      return line !== undefined && thousandths > 0
        ? [{ saleLineId: line.saleLineId, quantity: thousandthsToQuantity(thousandths) }]
        : [];
    });
  }

  /** Vuelve a validar los controles de los pasos que dependen de la cotización y los reembolsos. */
  private refresh(): void {
    this.refundsControl.setValue(this.refunds());
    this.summaryControl.updateValueAndValidity();
  }
}
