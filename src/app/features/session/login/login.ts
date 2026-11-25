import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../../core/auth/auth.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    username: this.fb.control('', [Validators.required]),
    password: this.fb.control('', [Validators.required]),
  });

  /** Verdadero al volver de cambiar la contraseña: ?passwordChanged=1. */
  protected readonly passwordChanged = inject(ActivatedRoute).snapshot.queryParamMap.get('passwordChanged') === '1';
  /** En una tienda, el cambio llega a la central por sincronización: se avisa tras cambiarlo. */
  protected readonly isStore = inject(SystemInfoService).isStore;
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly errorCode = signal<string | null>(null);

  constructor() {
    // Con sesión ya iniciada, no se muestra el formulario.
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.homeUrl());
    }
  }

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

    const { username, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.errorCode.set(null);

    this.auth.login(username, password).subscribe({
      next: () => {
        void this.router.navigateByUrl(this.homeUrl());
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
        // El backend no pone código en las credenciales incorrectas: un 401 aquí solo puede ser eso.
        this.errorCode.set(error instanceof HttpErrorResponse && error.status === 401 ? 'INVALID_CREDENTIALS' : null);
      },
    });
  }

  private homeUrl(): string {
    return this.auth.mustChangePassword() ? '/change-password' : '/';
  }
}
