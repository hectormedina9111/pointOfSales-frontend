import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { UserView, UsersApi } from '../../../core/api/users-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Mismo mínimo y máximo que el backend (PasswordResetRequest). */
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 72;

/** Compara la contraseña nueva con su confirmación. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirmPassword')?.value
    ? null
    : { passwordsMismatch: true };
}

/**
 * Restablece la contraseña de un usuario. El backend no devuelve ninguna contraseña temporal:
 * la nueva la escribe quien administra y el usuario debe cambiarla en su próximo ingreso.
 */
@Component({
  selector: 'app-user-password-reset',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './user-password-reset.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPasswordResetComponent {
  private readonly api = inject(UsersApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Usuario al que se restablece; lo asigna quien abre el diálogo antes de mostrarlo. */
  user!: UserView;

  protected readonly minLength = PASSWORD_MIN_LENGTH;
  protected readonly maxLength = PASSWORD_MAX_LENGTH;

  protected readonly form = this.fb.group(
    {
      newPassword: this.fb.control('', [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
      ]),
      confirmPassword: this.fb.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.api.resetPassword(this.user.id, { newPassword: this.form.getRawValue().newPassword }).subscribe({
      next: () => this.activeModal.close(true),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
