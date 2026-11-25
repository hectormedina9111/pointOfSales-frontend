import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import {
  CashMovementRequest,
  CashMovementType,
  CashSessionsApi,
} from '../../../core/api/cash-sessions-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Privilegio para retirar sin autorización de un jefe de tienda. */
const WITHDRAWAL_PRIVILEGE = 'ACTION_CASH_WITHDRAWAL';

/**
 * Depósito o retiro de la caja abierta. Un retiro pide la autorización de un jefe de tienda,
 * salvo que el cajero tenga el privilegio ACTION_CASH_WITHDRAWAL. Las credenciales viajan solo
 * en esta petición: no se guardan ni se muestran.
 */
@Component({
  selector: 'app-cash-movement-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './cash-movement-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashMovementFormComponent implements OnInit {
  private readonly api = inject(CashSessionsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly privileges = inject(PrivilegesService);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Sesión abierta a la que se registra el movimiento. Lo asigna quien abre el diálogo. */
  sessionId = 0;
  /** Tipo del movimiento: DEPOSIT o WITHDRAWAL. */
  type: CashMovementType = 'DEPOSIT';

  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  /** Un retiro sin el privilegio exige a un jefe de tienda que lo autorice. */
  protected readonly needsAuthorization = (): boolean =>
    this.type === 'WITHDRAWAL' && !this.privileges.has(WITHDRAWAL_PRIVILEGE);

  protected readonly form = this.fb.group({
    amount: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    reason: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    username: this.fb.control('', [Validators.maxLength(50)]),
    password: this.fb.control('', [Validators.maxLength(200)]),
  });

  ngOnInit(): void {
    if (this.needsAuthorization()) {
      this.form.controls.username.setValidators([Validators.required, Validators.maxLength(50)]);
      this.form.controls.password.setValidators([Validators.required, Validators.maxLength(200)]);
      this.form.controls.username.updateValueAndValidity();
      this.form.controls.password.updateValueAndValidity();
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const authorization = this.needsAuthorization()
      ? { username: value.username.trim(), password: value.password }
      : null;
    const body: CashMovementRequest = {
      type: this.type,
      amount: value.amount.trim(),
      reason: value.reason.trim(),
      authorization,
    };

    this.submitting.set(true);
    this.error.set(null);
    this.api.addMovement(this.sessionId, body).subscribe({
      next: () => this.activeModal.close(),
      error: (error: unknown) => {
        this.error.set(error);
        this.submitting.set(false);
      },
    });
  }
}
