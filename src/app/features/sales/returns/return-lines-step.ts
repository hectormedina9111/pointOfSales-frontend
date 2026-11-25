import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney, numberToThousandths } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ReturnDraftStore } from './return-draft.store';
import { returnQuantityError } from './return-math';

/**
 * Primer paso de la devolución: una fila por línea de la venta con la cantidad a devolver. Muestra
 * lo vendido, lo ya devuelto y lo que queda; "Devolver todo" pone lo que queda en cada línea. El
 * total sale de la cotización del servidor, que se pide sola al cambiar las cantidades.
 */
@Component({
  selector: 'app-return-lines-step',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './return-lines-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnLinesStepComponent {
  protected readonly store = inject(ReturnDraftStore);
  private readonly language = inject(LanguageService);

  protected money(value: number): string {
    return formatMoney(value, this.store.currency(), this.language.current());
  }

  /** Clave del error de la cantidad de una línea, o null si es válida. */
  protected lineError(index: number, returnable: number): string | null {
    const error = returnQuantityError(this.store.lineControl(index).value, numberToThousandths(returnable));
    if (error === 'format') {
      return 'validation.quantity';
    }
    return error === 'max' ? 'sales.return.lines.exceeds' : null;
  }

  /** Total de la línea según la cotización, o vacío mientras no hay cotización. */
  protected lineTotal(saleLineId: number): string {
    const line = this.store.quote()?.lines.find((item) => item.saleLineId === saleLineId);
    return line === undefined ? '' : this.money(line.total);
  }
}
