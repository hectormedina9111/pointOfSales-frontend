import { ChangeDetectionStrategy, Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { DiscountType } from '../../../core/api/sales-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { AMOUNT_PATTERN, RATE_PATTERN, amountToCents } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Descuento elegido en el diálogo. type y value son null cuando se quita el descuento.
 * value va como texto, para llegar exacto al backend.
 */
export interface DiscountChoice {
  readonly type: DiscountType | null;
  readonly value: string | null;
}

/**
 * Valida el valor según el tipo: un porcentaje entre 0 (sin incluir) y 100, o un monto mayor que
 * cero. Lee el tipo del hermano del control, así que se vuelve a validar al cambiar el tipo.
 */
function discountValueValidator(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? '').trim();
  if (text === '') {
    return { required: true };
  }
  const type = control.parent?.get('type')?.value;
  if (type === 'PERCENTAGE') {
    return RATE_PATTERN.test(text) && Number(text) > 0 && Number(text) <= 100 ? null : { invalid: true };
  }
  return AMOUNT_PATTERN.test(text) && (amountToCents(text) ?? 0) > 0 ? null : { invalid: true };
}

/**
 * Descuento de una línea o de la venta (un solo diálogo para los dos). Quien lo abre asigna
 * titleKey y el descuento actual. Cerrar con "Quitar descuento" devuelve type y value null.
 */
@Component({
  selector: 'app-discount-form',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './discount-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscountFormComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Clave de traducción del título del diálogo. Lo asigna quien lo abre. */
  titleKey = 'sales.pos.discount.title';
  /** Descuento actual; si hay uno, el diálogo ofrece quitarlo. */
  current: DiscountChoice = { type: null, value: null };

  protected readonly isInvalid = isInvalidControl;
  protected readonly form = this.fb.group({
    type: this.fb.control<DiscountType>('PERCENTAGE', [Validators.required]),
    value: this.fb.control('', [discountValueValidator]),
  });

  ngOnInit(): void {
    if (this.current.type !== null && this.current.value !== null) {
      this.form.setValue({ type: this.current.type, value: this.current.value });
    }
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.value.updateValueAndValidity();
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.activeModal.close({ type: value.type, value: value.value.trim() });
  }

  protected clear(): void {
    this.activeModal.close({ type: null, value: null });
  }
}
