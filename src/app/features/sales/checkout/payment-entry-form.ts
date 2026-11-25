import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { listAllPages } from '../../../core/api/page';
import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN, amountToCents } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import {
  NewPayment,
  PaymentInput,
  applyToPending,
  paymentError,
  suggestedAmount,
  toPaymentRequest,
} from './payment-math';

/** Solo el número de los cuatro últimos dígitos de la tarjeta. */
const LAST4_PATTERN = /^\d{4}$/;

/**
 * Formulario para agregar un pago. El monto propuesto es lo que falta por cobrar. Campos extra según
 * el método: monto recibido (efectivo), referencia (si el método la pide) y cuatro dígitos (tarjeta).
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
  private readonly fb = inject(NonNullableFormBuilder);

  /** Lo que falta por cobrar, en centavos: el monto que se propone para el pago nuevo. */
  readonly pendingCents = input.required<number>();
  /** Se emite con cada pago agregado. */
  readonly added = output<NewPayment>();

  protected readonly methods = signal<readonly PaymentMethodView[]>([]);
  protected readonly methodsError = signal<unknown>(null);
  protected readonly ruleError = signal<string | null>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    paymentMethodCode: this.fb.control('', [Validators.required]),
    amount: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    amountReceived: this.fb.control('', [Validators.pattern(AMOUNT_PATTERN)]),
    reference: this.fb.control('', [Validators.maxLength(60)]),
    cardLast4: this.fb.control('', [Validators.pattern(LAST4_PATTERN)]),
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
    }, method, this.pendingCents());
    const error = paymentError(input, method, this.pendingCents());
    if (error !== null) {
      this.ruleError.set(error);
      return;
    }
    this.added.emit({ methodName: method.name, request: toPaymentRequest(input, method) });
    const remaining = this.pendingCents() - (amountToCents(input.amount) ?? 0);
    this.form.reset({
      paymentMethodCode: '',
      amount: suggestedAmount(remaining),
      amountReceived: '',
      reference: '',
      cardLast4: '',
    });
  }
}
