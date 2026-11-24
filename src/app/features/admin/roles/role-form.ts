import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { RoleView, RolesApi } from '../../../core/api/roles-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Mismo máximo que el backend (CreateRoleRequest). */
const CODE_MAX_LENGTH = 30;

/**
 * Alta y edición de rol. Con role null es un alta (el código se elige una vez y no cambia);
 * con un rol, edita nombre y descripción. Cierra el diálogo con el rol guardado.
 */
@Component({
  selector: 'app-role-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './role-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleFormComponent implements OnInit {
  private readonly api = inject(RolesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Rol a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  role: RoleView | null = null;

  protected readonly codeMaxLength = CODE_MAX_LENGTH;
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);

  protected readonly form = this.fb.group({
    code: this.fb.control('', [
      Validators.required,
      Validators.maxLength(CODE_MAX_LENGTH),
      Validators.pattern('[A-Z_]+'),
    ]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(80)]),
    description: this.fb.control('', [Validators.maxLength(150)]),
  });

  ngOnInit(): void {
    const role = this.role;
    if (role !== null) {
      this.form.patchValue({ code: role.code, name: role.name, description: role.description ?? '' });
      this.form.controls.code.disable();
    }
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const description = blankToNull(value.description);

    this.submitting.set(true);
    this.error.set(null);

    const request = this.role === null
      ? this.api.create({ code: value.code, name, description })
      : this.api.update(this.role.id, { name, description });

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
