import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { FINAL_CONSUMER_ID, SaleView } from '../../../core/api/sales-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { SaleTotalsComponent } from '../shared/sale-totals';

/**
 * Resumen de solo lectura de una venta en espera: cliente, tipo, líneas con precios y descuentos, y
 * totales. Aquí no se cambia nada; para modificar la orden se vuelve a la pantalla de la orden.
 */
@Component({
  selector: 'app-order-review',
  imports: [SaleTotalsComponent, TranslatePipe],
  templateUrl: './order-review.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderReviewComponent {
  private readonly language = inject(LanguageService);

  readonly sale = input.required<SaleView>();
  /** Moneda de la empresa; null si no está configurada. */
  readonly currency = input<string | null>(null);

  protected readonly finalConsumerId = FINAL_CONSUMER_ID;

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected numeric(value: string | number | null): number {
    return Number(value ?? 0);
  }
}
