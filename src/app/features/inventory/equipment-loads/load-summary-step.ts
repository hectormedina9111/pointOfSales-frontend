import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { EquipmentLoadStore, EquipmentRow } from './equipment-load.store';

/**
 * Paso 3 de la carga: resumen de solo lectura con el producto, la sucursal, el costo, las notas, el número
 * de equipos y cada uno con su serie, código externo y características. Registrar lo hace el asistente.
 */
@Component({
  selector: 'app-load-summary-step',
  imports: [TranslatePipe],
  templateUrl: './load-summary-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadSummaryStepComponent {
  protected readonly store = inject(EquipmentLoadStore);

  protected unitCost(): string {
    return this.store.form.controls.unitCost.value.trim() || '—';
  }

  protected notes(): string {
    return blankToNull(this.store.form.controls.notes.value) ?? '—';
  }

  protected summaryOf(row: EquipmentRow): string {
    return this.store.summaryOf(row);
  }
}
