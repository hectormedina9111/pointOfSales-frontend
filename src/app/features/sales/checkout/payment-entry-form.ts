import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreditNotesApi } from '../../../core/api/credit-notes-api';
import { listAllPages } from '../../../core/api/page';
import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN, amountToCents, formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import {
  CreditNoteCheck,
  NewPayment,
  PaymentInput,
  applyToPending,
  creditNotePaymentError,
  creditNoteSuggestedAmount,
  isCreditNoteMethod,
  paymentError,
  suggestedAmount,
  toPaymentRequest,
} from './payment-math';

/** Solo el número de los cuatro últimos dígitos de la tarjeta. */
const LAST4_PATTERN = /^\d{4}$/;
/** Largo máximo del número de una nota de crédito. */
const CREDIT_NOTE_NUMBER_MAX = 40;

/**
 * Formulario para agregar un pago. El monto propuesto es lo que falta por cobrar. Campos extra según
 * el método: monto recibido (efectivo), referencia (si el método la pide), cuatro dígitos (tarjeta) y
 * número de nota de crédito, que se verifica en la central antes de poder agregar el pago.
 * Al agregar, emite el pago y limpia el formulario para el siguiente; nunca cambia pagos ya agregados.
 */
@Component({
  selector: 'app-payment-entry-form',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, ProblemAlertComponent, TranslatePipe],
  templateUrl: './payment-entry-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentEntryFormComponent implements OnInit {
  private readonly paymentMethods = inject(PaymentMethodsApi);
  private readonly creditNotes = inject(CreditNotesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly language = inject(LanguageService);

  /** Lo que falta por cobrar, en centavos: el monto que se propone para el pago nuevo. */
  readonly pendingCents = input.required<number>();
  /** Moneda de la empresa para mostrar saldos; null si no está configurada. */
  readonly currency = input<string | null>(null);
  /** Números de las notas de crédito que ya tiene la venta: una nota no se usa dos veces. */
  readonly usedCreditNoteNumbers = input<readonly string[]>([]);
  /** Se emite con cada pago agregado. */
  readonly added = output<NewPayment>();

  protected readonly methods = signal<readonly PaymentMethodView[]>([]);
  protected readonly methodsError = signal<unknown>(null);
  protected readonly ruleError = signal<string | null>(null);
  protected readonly isInvalid = isInvalidControl;
  protected readonly maxCreditNoteNumber = CREDIT_NOTE_NUMBER_MAX;

  /** Última búsqueda de nota de crédito que salió bien; solo vale si el número no cambió. */
  protected readonly creditNoteCheck = signal<CreditNoteCheck | null>(null);
  protected readonly checking = signal(false);
  protected readonly checkError = signal<unknown>(null);

  protected readonly form = this.fb.group({
    paymentMethodCode: this.fb.control('', [Validators.required]),
    amount: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    amountReceived: this.fb.control('', [Validators.pattern(AMOUNT_PATTERN)]),
    reference: this.fb.control('', [Validators.maxLength(60)]),
    cardLast4: this.fb.control('', [Validators.pattern(LAST4_PATTERN)]),
    creditNoteNumber: this.fb.control('', [Validators.maxLength(CREDIT_NOTE_NUMBER_MAX)]),
  });

  ngOnInit(): void {
    this.form.controls.amount.setValue(suggestedAmount(this.pendingCents()));
    listAllPages((request) => this.paymentMethods.list(request, true), 'name').subscribe({
      next: (rows) => this.methods.set(rows),
      error: (error: unknown) => this.methodsError.set(error),
    });
  }

  /** Método elegido, o undefined si todavía no hay uno. */
  protected selectedMethod(): PaymentMethodView | undefined {
    const code = this.form.controls.paymentMethodCode.value;
    return this.methods().find((method) => method.code === code);
  }

  protected isCreditNote(): boolean {
    return isCreditNoteMethod(this.form.controls.paymentMethodCode.value);
  }

  /** Verdadero si hay un número escrito y no hay una búsqueda en curso. */
  protected canCheckCreditNote(): boolean {
    return !this.checking() && this.form.controls.creditNoteNumber.value.trim() !== '';
  }

  /**
   * Búsqueda de la nota en la central. Si sale bien, propone el monto (lo menor entre el saldo y lo
   * pendiente). Si el número cambia después, la búsqueda deja de valer.
   */
  protected checkCreditNote(): void {
    const number = this.form.controls.creditNoteNumber.value.trim();
    if (number === '' || this.checking()) {
      return;
    }
    this.checking.set(true);
    this.checkError.set(null);
    this.creditNoteCheck.set(null);
    this.creditNotes.lookup(number).subscribe({
      next: (note) => {
        this.checking.set(false);
        this.creditNoteCheck.set({ requestedNumber: number, note });
        this.form.controls.amount.setValue(creditNoteSuggestedAmount(note.balance, this.pendingCents()));
      },
      error: (error: unknown) => {
        this.checking.set(false);
        this.checkError.set(error);
      },
    });
  }

  /** La búsqueda vigente para el número escrito, o null si no hay una o el número cambió. */
  protected matchingCheck(): CreditNoteCheck | null {
    const check = this.creditNoteCheck();
    return check !== null && check.requestedNumber === this.form.controls.creditNoteNumber.value.trim() ? check : null;
  }

  /** Saldo en texto con la moneda de la empresa. */
  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected add(): void {
    this.ruleError.set(null);
    const method = this.selectedMethod();
    if (this.form.invalid || method === undefined) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: PaymentInput = applyToPending({
      amount: value.amount,
      amountReceived: value.amountReceived,
      reference: value.reference,
      cardLast4: value.cardLast4,
      creditNoteNumber: value.creditNoteNumber,
    }, method, this.pendingCents());
    const error = isCreditNoteMethod(method.code)
      ? creditNotePaymentError(input, this.creditNoteCheck(), this.usedCreditNoteNumbers(), this.pendingCents())
      : paymentError(input, method, this.pendingCents());
    if (error !== null) {
      this.ruleError.set(error);
      return;
    }
    this.added.emit({ methodName: method.name, request: toPaymentRequest(input, method) });
    const remaining = this.pendingCents() - (amountToCents(input.amount) ?? 0);
    this.creditNoteCheck.set(null);
    this.checkError.set(null);
    this.form.reset({
      paymentMethodCode: '',
      amount: suggestedAmount(remaining),
      amountReceived: '',
      reference: '',
      cardLast4: '',
      creditNoteNumber: '',
    });
  }
}
