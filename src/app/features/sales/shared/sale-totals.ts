import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { SaleTotalsView } from '../../../core/api/sales-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Totales de una venta: subtotal, descuentos, exento, gravado 15 y 18 %, ISV y total. Los montos
 * los calcula el servidor; aquí solo se muestran. Otros gravados solo aparece si hay alguno.
 */
@Component({
  selector: 'app-sale-totals',
  imports: [TranslatePipe],
  templateUrl: './sale-totals.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleTotalsComponent {
  private readonly language = inject(LanguageService);

  readonly totals = input.required<SaleTotalsView>();
  /** Moneda de la empresa; null si no está configurada (solo dos decimales). */
  readonly currency = input<string | null>(null);

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }
}
