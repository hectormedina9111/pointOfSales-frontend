import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { AMOUNT_PATTERN, amountToCents, formatAmount } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Precio elegido en el diálogo. unitPrice null vuelve al precio de lista. */
export interface PriceChoice {
  readonly unitPrice: number | null;
}

/** El precio tiene que ser un monto mayor que cero, con hasta dos decimales. */
function positivePriceValidator(control: AbstractControl): ValidationErrors | null {
  const cents = amountToCents(String(control.value ?? ''));
  return cents !== null && cents > 0 ? null : { invalid: true };
}

/**
 * Cambio de precio de una línea. Muestra el precio de lista para comparar. Quien lo abre asigna el
 * precio de lista, el precio cambiado actual (si lo hay) y si la persona puede dar el precio sin
 * un jefe de tienda; si no puede, el texto avisa que la venta pedirá la autorización al guardar.
 */
@Component({
  selector: 'app-price-change-form',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './price-change-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceChangeFormComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Precio de lista de la línea, según la última cotización; null si todavía no hay cotización. */
  listPrice: number | null = null;
  /** Precio cambiado actual de la línea, si ya tiene uno. */
  current: number | null = null;
  /** Si la persona puede cambiar precios sin autorización (ACTION_SALE_PRICE_OVERRIDE). */
  canOverride = false;

  protected readonly isInvalid = isInvalidControl;
  protected readonly form = this.fb.group({
    unitPrice: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN), positivePriceValidator]),
  });

  ngOnInit(): void {
    if (this.current !== null) {
      this.form.setValue({ unitPrice: formatAmount(this.current) });
    }
  }

  protected listPriceText(): string {
    return this.listPrice === null ? '—' : formatAmount(this.listPrice);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const choice: PriceChoice = { unitPrice: Number(this.form.getRawValue().unitPrice.trim()) };
    this.activeModal.close(choice);
  }

  /** Vuelve al precio de lista: quita el cambio de precio de la línea. */
  protected useListPrice(): void {
    const choice: PriceChoice = { unitPrice: null };
    this.activeModal.close(choice);
  }
}
