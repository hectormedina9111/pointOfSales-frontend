import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { UnitOfMeasureRequest, UnitOfMeasureView, UnitsApi } from '../../../core/api/units-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta y edición de unidad de medida. Con unit null es un alta; con una unidad, la edita.
 * Cierra el diálogo con la unidad guardada.
 */
@Component({
  selector: 'app-unit-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './unit-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitFormComponent implements OnInit {
  private readonly api = inject(UnitsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Unidad a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  unit: UnitOfMeasureView | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.maxLength(10)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
    allowsDecimals: this.fb.control(false),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const unit = this.unit;
    if (unit !== null) {
      this.form.patchValue({
        code: unit.code,
        name: unit.name,
        allowsDecimals: unit.allowsDecimals,
        active: unit.active,
      });
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: UnitOfMeasureRequest = {
      code: value.code.trim(),
      name: value.name.trim(),
      allowsDecimals: value.allowsDecimals,
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.unit === null
      ? this.api.create(body)
      : this.api.update(this.unit.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
