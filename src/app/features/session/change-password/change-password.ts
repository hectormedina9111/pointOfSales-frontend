import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { MeApi } from '../../../core/api/me-api';
import { AuthService } from '../../../core/auth/auth.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Mismo mínimo y máximo que el backend (AuthService y MeController). */
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 72;

/** Compara la contraseña nueva con su confirmación. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  return newPassword === confirmation ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './change-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private readonly meApi = inject(MeApi);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly auth = inject(AuthService);
  protected readonly minLength = PASSWORD_MIN_LENGTH;
  protected readonly maxLength = PASSWORD_MAX_LENGTH;

  protected readonly form = this.fb.group(
    {
      currentPassword: this.fb.control('', [Validators.required]),
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
  protected readonly errorCode = signal<string | null>(null);

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.errorCode.set(null);

    this.meApi.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        // El backend revoca las sesiones al cambiar la contraseña: se sale y se vuelve a entrar.
        this.auth.logout({ passwordChanged: '1' });
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
        // Un 401 aquí significa que la contraseña actual no es correcta.
        this.errorCode.set(error instanceof HttpErrorResponse && error.status === 401 ? 'INVALID_CURRENT_PASSWORD' : null);
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
