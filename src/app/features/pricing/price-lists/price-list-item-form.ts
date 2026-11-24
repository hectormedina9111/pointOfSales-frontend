import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ProductView } from '../../../core/api/products-api';
import {
  PriceListItemRequest,
  PriceListItemView,
  PriceListItemsApi,
} from '../../../core/api/price-list-items-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN, QUANTITY_PATTERN, formatAmount } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta y edición de un precio de producto en una lista de precio fijo. La cantidad mínima va como
 * texto y se valida con patrón; la regla de la cantidad y la de duplicados las decide el backend.
 * Cierra el diálogo con el precio guardado.
 */
@Component({
  selector: 'app-price-list-item-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, ProductPickerComponent, TranslatePipe],
  templateUrl: './price-list-item-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListItemFormComponent implements OnInit {
  private readonly api = inject(PriceListItemsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Lista a la que pertenece el precio; la asigna quien abre el diálogo. */
  listId!: number;
  /** Precio a editar, o null para dar de alta. */
  item: PriceListItemView | null = null;
  /** Producto del precio a editar, si se conoce. */
  product: ProductView | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    product: this.fb.control<ProductView | null>(null, [Validators.required]),
    minQuantity: this.fb.control('1', [Validators.required, Validators.pattern(QUANTITY_PATTERN)]),
    price: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
  });

  ngOnInit(): void {
    const item = this.item;
    if (item !== null) {
      this.form.patchValue({
        product: this.product,
        minQuantity: String(item.minQuantity),
        // El precio llega como número con dos decimales; se muestra como texto.
        price: formatAmount(item.price),
      });
    }
  }

  protected chooseProduct(product: ProductView): void {
    this.form.controls.product.setValue(product);
    this.form.controls.product.markAsTouched();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.product === null) {
      return;
    }
    const body: PriceListItemRequest = {
      productId: value.product.id,
      minQuantity: value.minQuantity.trim(),
      price: value.price.trim(),
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.item === null
      ? this.api.add(this.listId, body)
      : this.api.update(this.listId, this.item.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
