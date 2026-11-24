import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { RoleView, RolesApi } from '../../../core/api/roles-api';
import { UserView, UsersApi } from '../../../core/api/users-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { blankToNull, checkedValue } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Mismo mínimo y máximo que el backend (CreateUserRequest). */
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 72;

/**
 * Alta y edición de usuario. Con user null es un alta (pide la contraseña inicial); con un
 * usuario, edita sus datos (el nombre de usuario y la contraseña no cambian aquí).
 * Cierra el diálogo con el usuario guardado.
 */
@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './user-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormComponent implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly rolesApi = inject(RolesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Usuario a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  user: UserView | null = null;

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly passwordMaxLength = PASSWORD_MAX_LENGTH;
  protected readonly roles = signal<readonly RoleView[]>([]);
  protected readonly rolesLoading = signal(true);
  protected readonly rolesError = signal<unknown>(null);
  protected readonly selectedRoles = signal<readonly string[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);

  protected readonly form = this.fb.group({
    username: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
    fullName: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
    email: this.fb.control('', [Validators.email, Validators.maxLength(150)]),
    externalCode: this.fb.control('', [Validators.maxLength(50)]),
    initialPassword: this.fb.control('', [
      Validators.required,
      Validators.minLength(PASSWORD_MIN_LENGTH),
      Validators.maxLength(PASSWORD_MAX_LENGTH),
    ]),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const user = this.user;
    if (user !== null) {
      this.form.patchValue({
        username: user.username,
        fullName: user.fullName,
        email: user.email ?? '',
        externalCode: user.externalCode ?? '',
        active: user.active,
      });
      this.form.controls.username.disable();
      this.form.controls.initialPassword.disable();
    }
    this.selectedRoles.set(user?.roles ?? []);
    this.loadRoles();
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected isSelected(code: string): boolean {
    return this.selectedRoles().includes(code);
  }

  protected toggleRole(code: string, checked: boolean): void {
    this.selectedRoles.update((codes) => {
      const others = codes.filter((current) => current !== code);
      return checked ? [...others, code] : others;
    });
  }

  protected readonly checkedValue = checkedValue;

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const email = blankToNull(value.email);
    const externalCode = blankToNull(value.externalCode);
    const fullName = value.fullName.trim();
    const roleCodes = this.selectedRoles();

    this.submitting.set(true);
    this.error.set(null);

    const request = this.user === null
      ? this.api.create({
          username: value.username.trim(),
          fullName,
          email,
          externalCode,
          roleCodes,
          initialPassword: value.initialPassword,
        })
      : this.api.update(this.user.id, { fullName, email, externalCode, active: value.active, roleCodes });

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  private loadRoles(): void {
    this.rolesLoading.set(true);
    this.rolesApi.list().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.rolesLoading.set(false);
      },
      error: (error: unknown) => {
        this.rolesError.set(error);
        this.rolesLoading.set(false);
      },
    });
  }
}
