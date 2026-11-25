import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { listAllPages } from '../../../core/api/page';
import { randomUuid } from '../../../shared/ids/random-uuid';
import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import {
  AuthorizationRequest,
  CheckoutRequest,
  PaymentRequest,
  SaleDraftRequest,
  SaleQuoteView,
  SaleView,
  SalesApi,
} from '../../../core/api/sales-api';
import { readProblem } from '../../../core/http/problem-details';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import {
  AMOUNT_PATTERN,
  amountToCents,
  centsToAmount,
  centsToNumber,
  formatMoney,
  numberToCents,
} from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ManagerAuthorizationComponent } from './manager-authorization';
import { SaleTotalsComponent } from './sale-totals';

/** Una fila de pago del formulario. amountReceived, reference y cardLast4 aparecen según el método. */
type PaymentRow = FormGroup<{
  paymentMethodCode: FormControl<string>;
  amount: FormControl<string>;
  amountReceived: FormControl<string>;
  reference: FormControl<string>;
  cardLast4: FormControl<string>;
}>;

/** Código del método de pago con tarjeta; solo para él se pide cardLast4. */
const CARD_METHOD = 'CARD';

/**
 * Cobro de la venta en tres pasos: revisar, pagos y confirmar. La clave de idempotencia se crea
 * al abrir el asistente y se reusa en cada reintento. Si el servidor pide autorización de un
 * jefe de tienda, se pregunta con un diálogo y el cobro se reintenta con esas credenciales, que
 * no se guardan.
 */
@Component({
  selector: 'app-checkout-modal',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldLabelComponent, StepperComponent, StepComponent, SaleTotalsComponent, TranslatePipe],
  templateUrl: './checkout-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutModalComponent implements OnInit {
  private readonly sales = inject(SalesApi);
  private readonly paymentMethods = inject(PaymentMethodsApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = inject(LanguageService);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Líneas y descuento del borrador, tal como los cotizó la caja. Lo asigna quien abre el diálogo. */
  draft!: SaleDraftRequest;
  /** Cotización del borrador: líneas y totales que se revisan en el primer paso. */
  quote!: SaleQuoteView;
  /** Venta en espera que se cobra, si la hay. */
  holdId: number | null = null;
  /** Moneda de la empresa; null si no está configurada. */
  currency: string | null = null;

  /** Clave de idempotencia: se crea una vez por asistente y se reusa en los reintentos. */
  private readonly idempotencyKey = randomUuid();

  protected readonly saving = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly methods = signal<readonly PaymentMethodView[]>([]);
  protected readonly methodsByCode = computed(
    () => new Map(this.methods().map((method) => [method.code, method] as const)),
  );
  /** Lo que falta por cobrar, en centavos. Negativo si los pagos superan el total. */
  protected readonly pendingCents = signal(0);
  /** Vuelto total de los pagos en efectivo, en centavos. */
  protected readonly changeCents = signal(0);

  protected readonly noControls: readonly AbstractControl[] = [];
  /** Controles que el paso de pagos debe tener válidos; el asistente no avanza sin ellos. */
  protected stepControls: readonly AbstractControl[] = [];
  protected payments!: FormArray<PaymentRow>;

  /** Total en centavos, leído de la cotización. */
  private get totalCents(): number {
    return numberToCents(this.quote.totals.total);
  }

  /** La suma de los montos debe ser exactamente el total. Sin pagos no se puede avanzar. */
  private readonly paymentsValidator = (array: AbstractControl): ValidationErrors | null => {
    const rows = (array as FormArray<PaymentRow>).controls;
    if (rows.length === 0) {
      return { noPayments: true };
    }
    const paid = rows.reduce((sum, row) => sum + (amountToCents(row.controls.amount.value) ?? 0), 0);
    return paid === this.totalCents ? null : { mismatch: true };
  };

  /** Reglas que dependen del método: referencia obligatoria y monto recibido que alcance el pago. */
  private readonly rowValidator = (group: AbstractControl): ValidationErrors | null => {
    const row = group as PaymentRow;
    const method = this.methodsByCode().get(row.controls.paymentMethodCode.value);
    const amount = amountToCents(row.controls.amount.value);
    const errors: Record<string, boolean> = {};
    if (amount === 0) {
      errors['zeroAmount'] = true;
    }
    if (method?.requiresReference && row.controls.reference.value.trim() === '') {
      errors['referenceRequired'] = true;
    }
    if (method?.allowsChange && amount !== null && row.controls.amountReceived.value.trim() !== '') {
      const received = amountToCents(row.controls.amountReceived.value);
      if (received !== null && received < amount) {
        errors['amountReceivedTooLow'] = true;
      }
    }
    return Object.keys(errors).length > 0 ? errors : null;
  };

  ngOnInit(): void {
    this.payments = new FormArray<PaymentRow>([], { validators: this.paymentsValidator });
    this.stepControls = [this.payments];
    this.payments.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.recalcTotals());
    this.recalcTotals();

    listAllPages((request) => this.paymentMethods.list(request, true), 'name').subscribe({
      next: (rows) => this.methods.set(rows),
      error: (error: unknown) => this.error.set(error),
    });
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency, this.language.current());
  }

  protected centsMoney(cents: number): string {
    return this.money(centsToNumber(cents));
  }

  protected methodOf(row: PaymentRow): PaymentMethodView | undefined {
    return this.methodsByCode().get(row.controls.paymentMethodCode.value);
  }

  protected methodName(row: PaymentRow): string {
    return this.methodOf(row)?.name ?? '';
  }

  protected rowAmount(row: PaymentRow): number {
    return centsToNumber(amountToCents(row.controls.amount.value) ?? 0);
  }

  protected addRow(code = ''): void {
    this.payments.push(this.createRow(code, ''));
  }

  protected removeRow(index: number): void {
    this.payments.removeAt(index);
  }

  /**
   * Exacto: deja el pendiente en un pago en efectivo. Si ya hay una fila de un método que da
   * vuelto, le suma el pendiente y recibe el monto exacto; si no, agrega una.
   */
  protected exact(): void {
    const pending = this.pendingCents();
    if (pending <= 0) {
      return;
    }
    const cashRow = this.payments.controls.find((row) => this.methodOf(row)?.allowsChange === true);
    if (cashRow) {
      const current = amountToCents(cashRow.controls.amount.value) ?? 0;
      const next = centsToAmount(current + pending);
      cashRow.patchValue({ amount: next, amountReceived: next });
      return;
    }
    const cash = this.methods().find((method) => method.allowsChange);
    this.payments.push(this.createRow(cash?.code ?? '', centsToAmount(pending)));
  }

  /** Error de un campo, o null. Solo se muestra después de tocar la fila o intentar avanzar. */
  protected controlError(control: AbstractControl, invalidKey = 'validation.invalid'): string | null {
    if (!control.invalid || !(control.touched || this.payments.touched)) {
      return null;
    }
    return 'required' in (control.errors ?? {}) ? 'form.required' : invalidKey;
  }

  /** Error de la fila (método, referencia, monto recibido), o null. */
  protected rowError(row: PaymentRow): string | null {
    if (!row.invalid || !(row.touched || row.dirty || this.payments.touched)) {
      return null;
    }
    const errors = row.errors ?? {};
    if ('referenceRequired' in errors) {
      return 'sales.pos.checkout.referenceRequired';
    }
    if ('amountReceivedTooLow' in errors) {
      return 'error.AMOUNT_RECEIVED_TOO_LOW';
    }
    if ('zeroAmount' in errors) {
      return 'error.INVALID_PAYMENT_AMOUNT';
    }
    return null;
  }

  /** Error del conjunto de pagos (suma distinta del total o sin pagos), o null. */
  protected paymentsError(): string | null {
    if (!(this.payments.touched || this.payments.dirty)) {
      return null;
    }
    if (this.payments.hasError('noPayments')) {
      return 'error.PAYMENTS_REQUIRED';
    }
    return this.payments.hasError('mismatch') ? 'error.PAYMENTS_DO_NOT_MATCH_TOTAL' : null;
  }

  /**
   * Envía el cobro. Con authorization, es el reintento tras pedir la autorización de un jefe de
   * tienda; sin ella, el cobro normal.
   */
  protected submit(authorization: AuthorizationRequest | null = null): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.sales.checkout(this.buildRequest(authorization)).subscribe({
      next: (sale: SaleView) => this.activeModal.close(sale),
      error: (error: unknown) => {
        this.saving.set(false);
        if (readProblem(error)?.code === 'DISCOUNT_AUTHORIZATION_REQUIRED') {
          this.askManager();
          return;
        }
        this.error.set(error);
      },
    });
  }

  private askManager(): void {
    const ref = this.modal.open(ManagerAuthorizationComponent, { centered: true });
    ref.result.then(
      (authorization: AuthorizationRequest) => this.submit(authorization),
      () => undefined,
    );
  }

  private createRow(code: string, amount: string): PaymentRow {
    return this.fb.group(
      {
        paymentMethodCode: this.fb.control(code, [Validators.required]),
        amount: this.fb.control(amount, [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
        amountReceived: this.fb.control('', [Validators.pattern(AMOUNT_PATTERN)]),
        reference: this.fb.control('', [Validators.maxLength(60)]),
        cardLast4: this.fb.control('', [Validators.pattern(/^\d{4}$/)]),
      },
      { validators: this.rowValidator },
    );
  }

  private recalcTotals(): void {
    let paid = 0;
    let change = 0;
    for (const row of this.payments.controls) {
      const amount = amountToCents(row.controls.amount.value) ?? 0;
      paid += amount;
      const allowsChange = this.methodOf(row)?.allowsChange === true;
      const received = amountToCents(row.controls.amountReceived.value);
      if (allowsChange && received !== null && received > amount) {
        change += received - amount;
      }
    }
    this.pendingCents.set(this.totalCents - paid);
    this.changeCents.set(change);
  }

  private buildRequest(authorization: AuthorizationRequest | null): CheckoutRequest {
    return {
      holdId: this.holdId,
      lines: this.draft.lines,
      discountType: this.draft.discountType,
      discountValue: this.draft.discountValue,
      payments: this.payments.controls.map((row) => this.paymentRequest(row)),
      idempotencyKey: this.idempotencyKey,
      authorization,
      notes: null,
    };
  }

  /** Cuerpo de un pago. amountReceived es el monto dado (o el mismo pago si no se escribió); solo para métodos que dan vuelto. */
  private paymentRequest(row: PaymentRow): PaymentRequest {
    const value = row.getRawValue();
    const method = this.methodsByCode().get(value.paymentMethodCode);
    const amount = value.amount.trim();
    return {
      paymentMethodCode: value.paymentMethodCode,
      amount,
      amountReceived: method?.allowsChange ? value.amountReceived.trim() || amount : null,
      reference: method?.requiresReference ? value.reference.trim() : null,
      cardLast4: value.paymentMethodCode === CARD_METHOD && value.cardLast4.trim() !== '' ? value.cardLast4.trim() : null,
    };
  }
}
