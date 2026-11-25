import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { PaymentMethodRequest, PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Edición de un método de pago: nombre y banderas. El código no cambia. Cierra con el método guardado. */
@Component({
  selector: 'app-payment-method-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './payment-method-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodFormComponent implements OnInit {
  private readonly api = inject(PaymentMethodsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Método a editar. Lo asigna quien abre el diálogo antes de mostrarlo. */
  method: PaymentMethodView | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(60)]),
    requiresReference: this.fb.control(false),
    allowsChange: this.fb.control(false),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const method = this.method;
    if (method !== null) {
      this.form.patchValue({
        name: method.name,
        requiresReference: method.requiresReference,
        allowsChange: method.allowsChange,
        active: method.active,
      });
    }
  }

  protected submit(): void {
    if (this.method === null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: PaymentMethodRequest = {
      name: value.name.trim(),
      requiresReference: value.requiresReference,
      allowsChange: value.allowsChange,
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    this.api.update(this.method.id, body).subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
