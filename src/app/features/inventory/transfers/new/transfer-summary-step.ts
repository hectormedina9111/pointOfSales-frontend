import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { formatQuantity } from '../../shared/inventory-math';
import { TransferDraftStore, TransferLine } from './transfer-draft.store';

/**
 * Paso 3 de la transferencia: resumen de solo lectura con origen, destino, notas y cada línea con
 * sus seriales. Enviar lo hace el asistente desde la página.
 */
@Component({
  selector: 'app-transfer-summary-step',
  imports: [TranslatePipe],
  templateUrl: './transfer-summary-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferSummaryStepComponent {
  protected readonly draft = inject(TransferDraftStore);

  protected quantity(line: TransferLine): string {
    return line.value === null ? '—' : formatQuantity(line.value / 1000);
  }
}
