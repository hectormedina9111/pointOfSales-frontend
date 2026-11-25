import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { SaleLineView } from '../../../core/api/sales-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoney, thousandthsToQuantity } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { DiscountChoice, DiscountFormComponent } from '../shared/discount-form';
import { SaleTotalsComponent } from '../shared/sale-totals';
import { OrderDraftStore } from './order-draft.store';

/**
 * Paso 4 de la orden: el resumen. Muestra cliente, tipo, líneas con sus precios y descuentos, y los
 * totales de la última cotización. Solo el descuento de la venta se cambia aquí; las líneas se
 * cambian en el paso de productos. Guardar lo hace la pantalla con el botón del asistente.
 */
@Component({
  selector: 'app-order-summary-step',
  imports: [SaleTotalsComponent, TranslatePipe],
  templateUrl: './order-summary-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderSummaryStepComponent {
  private readonly modal = inject(NgbModal);
  private readonly language = inject(LanguageService);
  protected readonly store = inject(OrderDraftStore);

  protected money(value: number): string {
    return formatMoney(value, this.store.currency(), this.language.current());
  }

  protected quantityLabel(thousandths: number): string {
    return thousandthsToQuantity(thousandths);
  }

  protected numeric(value: string | null): number {
    return Number(value ?? 0);
  }

  /** Línea de la última cotización con el mismo número que la línea de la orden (mismo orden). */
  protected quotedLine(index: number): SaleLineView | undefined {
    return this.store.quote()?.lines.find((line) => line.lineNumber === index + 1);
  }

  protected editSaleDiscount(): void {
    const ref = this.modal.open(DiscountFormComponent, { centered: true });
    ref.componentInstance.titleKey = 'sales.pos.saleDiscount.title';
    ref.componentInstance.current = this.store.saleDiscount();
    ref.result.then((choice: DiscountChoice) => this.store.setSaleDiscount(choice), () => undefined);
  }
}
