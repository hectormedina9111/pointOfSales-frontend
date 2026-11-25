import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { AuthorizationRequest } from '../../../core/api/sales-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Credenciales de un jefe de tienda para autorizar un descuento. Cierra con usuario y contraseña
 * solo para el reintento del cobro: la contraseña no se guarda ni se muestra.
 */
@Component({
  selector: 'app-manager-authorization',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './manager-authorization.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerAuthorizationComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly isInvalid = isInvalidControl;
  protected readonly form = this.fb.group({
    username: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
    password: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const authorization: AuthorizationRequest = { username: value.username.trim(), password: value.password };
    this.activeModal.close(authorization);
  }
}
