import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { ProductView, ProductsApi } from '../../../core/api/products-api';
import { SaleLineView } from '../../../core/api/sales-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import {
  formatMoney,
  quantityToThousandths,
  thousandthsToQuantity,
} from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { DiscountChoice, DiscountFormComponent } from '../shared/discount-form';
import { PriceChangeFormComponent } from './price-change-form';
import { CartLine, OrderDraftStore } from './order-draft.store';

/** Productos que muestra la lista de resultados de la búsqueda. */
const SEARCH_SIZE = 10;

/** Una unidad en milésimas: sumar o restar una unidad a la cantidad. */
const ONE_UNIT = 1000;

/**
 * Paso 3 de la orden: productos. Busca por código de barras (Enter lo agrega de inmediato), por
 * SKU o por nombre; F2 enfoca la búsqueda. Cada línea tiene cantidad, descuento y cambio de precio.
 * La validez del paso (líneas y totales al día) la lleva el control de productos del almacén.
 * Como el contenido del paso existe aunque el paso no se muestre, F2 solo actúa si está visible.
 */
@Component({
  selector: 'app-order-products-step',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './order-products-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProductsStepComponent {
  private readonly products = inject(ProductsApi);
  private readonly modal = inject(NgbModal);
  private readonly language = inject(LanguageService);
  protected readonly store = inject(OrderDraftStore);
  protected readonly privileges = inject(PrivilegesService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly searching = signal(false);
  protected readonly searchError = signal<unknown>(null);
  protected readonly searchResults = signal<readonly ProductView[]>([]);
  protected readonly searchedText = signal('');
  protected readonly lineMessage = signal<string | null>(null);

  /** F2 enfoca la búsqueda. Solo si el paso está en pantalla y no hay un diálogo abierto. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const input = this.searchInput()?.nativeElement;
    if (event.key !== 'F2' || !input?.isConnected || this.modal.hasOpenModals()) {
      return;
    }
    event.preventDefault();
    input.focus();
  }

  protected money(value: number): string {
    return formatMoney(value, this.store.currency(), this.language.current());
  }

  protected quantityText(line: CartLine): string {
    return thousandthsToQuantity(line.quantity);
  }

  /** Línea de la última cotización con el mismo número (la de la tabla está en el mismo orden). */
  protected quotedLine(index: number): SaleLineView | undefined {
    return this.store.quote()?.lines.find((line) => line.lineNumber === index + 1);
  }

  /** Monto de un descuento guardado como texto, para mostrarlo con formatMoney. */
  protected numeric(value: string | null): number {
    return Number(value ?? 0);
  }

  /** Enter: primero el código de barras exacto; si no existe, la búsqueda por texto. */
  protected onSearchEnter(): void {
    const text = this.search.value.trim();
    if (text === '') {
      return;
    }
    this.lineMessage.set(null);
    this.searchError.set(null);
    this.searchResults.set([]);
    this.searchedText.set('');
    this.searching.set(true);
    this.products.byBarcode(text).subscribe({
      next: (product) => {
        this.searching.set(false);
        this.addProduct(product);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.runSearch(text);
          return;
        }
        this.searching.set(false);
        this.searchError.set(error);
      },
    });
  }

  /** Agrega el producto elegido, o suma uno si ya está en la orden. Un producto inactivo no se vende. */
  protected addProduct(product: ProductView): void {
    this.search.setValue('');
    this.searchResults.set([]);
    this.searchedText.set('');
    if (!product.active) {
      this.lineMessage.set('sales.pos.productInactive');
    } else {
      this.lineMessage.set(null);
      this.store.addProduct(product);
    }
    this.focusSearch();
  }

  protected increase(line: CartLine): void {
    this.store.setQuantity(line.key, line.quantity + ONE_UNIT);
  }

  protected decrease(line: CartLine): void {
    this.store.setQuantity(line.key, line.quantity - ONE_UNIT);
  }

  /** Cantidad escrita a mano (hasta 3 decimales). Si no es válida, se restaura la anterior. */
  protected onQuantityChange(line: CartLine, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const thousandths = quantityToThousandths(input.value);
    if (thousandths === null) {
      this.lineMessage.set('sales.pos.lines.invalidQuantity');
      input.value = thousandthsToQuantity(line.quantity);
      return;
    }
    this.lineMessage.set(null);
    this.store.setQuantity(line.key, thousandths);
  }

  protected removeLine(key: number): void {
    this.store.removeLine(key);
  }

  protected editLineDiscount(line: CartLine): void {
    const ref = this.modal.open(DiscountFormComponent, { centered: true });
    ref.componentInstance.titleKey = 'sales.pos.lineDiscount.title';
    ref.componentInstance.current = { type: line.discountType, value: line.discountValue };
    ref.result.then(
      (choice: DiscountChoice) => this.store.setLineDiscount(line.key, choice),
      () => undefined,
    );
  }

  protected changePrice(line: CartLine, index: number): void {
    const ref = this.modal.open(PriceChangeFormComponent, { centered: true });
    ref.componentInstance.listPrice = this.quotedLine(index)?.listPrice ?? null;
    ref.componentInstance.current = line.unitPrice;
    ref.componentInstance.canOverride = this.privileges.has('ACTION_SALE_PRICE_OVERRIDE');
    ref.result.then(
      (choice: { unitPrice: number | null }) => this.store.setLinePrice(line.key, choice.unitPrice),
      () => undefined,
    );
  }

  private runSearch(text: string): void {
    this.products
      .search(
        { page: 0, size: SEARCH_SIZE, sort: 'name' },
        { q: text, categoryId: null, type: null, active: true },
      )
      .subscribe({
        next: (page) => {
          this.searching.set(false);
          this.searchedText.set(text);
          this.searchResults.set(page.content);
        },
        error: (error: unknown) => {
          this.searching.set(false);
          this.searchError.set(error);
        },
      });
  }

  private focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }
}
