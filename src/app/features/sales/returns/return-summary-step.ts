import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ReturnDraftStore } from './return-draft.store';

/** Una línea de la devolución para el resumen: producto, cantidad y total según la cotización. */
export interface ReturnSummaryRow {
  readonly saleLineId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly total: number;
}

/**
 * Último paso: resumen de solo lectura de lo que se va a devolver, con el total, el motivo y cómo se
 * reembolsa (o la nota de crédito que se emitirá). El botón de confirmar lo pone el asistente.
 */
@Component({
  selector: 'app-return-summary-step',
  imports: [TranslatePipe],
  templateUrl: './return-summary-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnSummaryStepComponent {
  protected readonly store = inject(ReturnDraftStore);
  private readonly language = inject(LanguageService);

  protected money(value: number): string {
    return formatMoney(value, this.store.currency(), this.language.current());
  }

  /** Monto de un reembolso escrito (texto con dos decimales) como número, solo para mostrarlo. */
  protected amountOf(text: string): number {
    return Number(text);
  }

  /** Líneas cotizadas, con el nombre del producto de la venta original. */
  protected rows(): readonly ReturnSummaryRow[] {
    const returnable = this.store.returnable();
    const quote = this.store.quote();
    if (returnable === null || quote === null) {
      return [];
    }
    return quote.lines.map((line) => ({
      saleLineId: line.saleLineId,
      productName: returnable.lines.find((source) => source.saleLineId === line.saleLineId)?.productName ?? `#${line.saleLineId}`,
      quantity: line.quantity,
      total: line.total,
    }));
  }
}
