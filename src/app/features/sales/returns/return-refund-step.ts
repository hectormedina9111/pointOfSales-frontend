import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { LanguageService } from '../../../core/i18n/language.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN, centsToAmount, centsToNumber, formatMoney, numberToCents } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { REASON_MAX, ReturnDraftStore } from './return-draft.store';
import { RefundOption, refundError, sumRefundsCents } from './return-math';

/** Largo máximo de la referencia de un reembolso (igual que en el cobro). */
const REFERENCE_MAX = 60;

/**
 * Segundo paso: motivo y reembolso. Con devolución del mismo día, se agregan reembolsos (efectivo o
 * un método de la venta) que deben sumar exacto el total; agregados solo se pueden quitar. Si la
 * venta es de un día anterior, no hay reembolso: se avisa que se emitirá una nota de crédito.
 */
@Component({
  selector: 'app-return-refund-step',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, ProblemAlertComponent, TranslatePipe],
  templateUrl: './return-refund-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnRefundStepComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly store = inject(ReturnDraftStore);
  private readonly language = inject(LanguageService);

  protected readonly isInvalid = isInvalidControl;
  protected readonly reasonMax = REASON_MAX;
  protected readonly referenceMax = REFERENCE_MAX;
  protected readonly ruleError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    paymentMethodCode: this.fb.control('', [Validators.required]),
    amount: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    reference: this.fb.control('', [Validators.maxLength(REFERENCE_MAX)]),
  });

  constructor() {
    // Mientras la persona no escriba el monto, se propone lo pendiente (cambia al cotizar otra vez).
    effect(() => {
      const pending = this.store.pendingCents();
      untracked(() => {
        if (this.form.controls.amount.pristine) {
          this.form.controls.amount.setValue(centsToAmount(Math.max(0, pending)));
        }
      });
    });
  }

  /** Forma de reembolso elegida en el formulario, o undefined si no hay ninguna. */
  protected selectedOption(): RefundOption | undefined {
    const code = this.form.controls.paymentMethodCode.value;
    return this.store.refundOptions().find((option) => option.code === code);
  }

  /** Monto en centavos como texto con la moneda de la empresa. */
  protected money(cents: number): string {
    return formatMoney(centsToNumber(cents), this.store.currency(), this.language.current());
  }

  /** Monto de la forma elegida y lo que todavía se puede reembolsar con ella, en texto. */
  protected availableText(option: RefundOption): string {
    return this.money(numberToCents(option.refundable ?? 0) - this.alreadyRefunded(option.code));
  }

  protected alreadyRefunded(code: string): number {
    return sumRefundsCents(this.store.refunds().filter((refund) => refund.paymentMethodCode === code));
  }

  /** Agrega el reembolso si es válido; luego limpia el formulario para el siguiente. */
  protected add(): void {
    this.ruleError.set(null);
    const option = this.selectedOption();
    if (this.form.invalid || option === undefined) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const error = refundError(
      { amount: value.amount, reference: value.reference },
      option,
      this.alreadyRefunded(option.code),
      this.store.pendingCents(),
    );
    if (error !== null) {
      this.ruleError.set(error);
      return;
    }
    this.store.addRefund({
      paymentMethodCode: option.code,
      methodName: option.name,
      amount: value.amount.trim(),
      reference: option.requiresReference ? value.reference.trim() : null,
    });
    this.form.reset({
      paymentMethodCode: '',
      amount: centsToAmount(Math.max(0, this.store.pendingCents())),
      reference: '',
    });
  }
}
