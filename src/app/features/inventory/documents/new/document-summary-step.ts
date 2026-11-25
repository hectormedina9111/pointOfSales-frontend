import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DocumentDraftStore, DocumentLine } from './document-draft.store';
import { currentText, differenceText, valueText } from './document-line-text';

/**
 * Paso 3 del documento: resumen de solo lectura. Muestra el tipo, la sucursal, el motivo y cada línea
 * como se va a aplicar. Guardar lo hace el asistente desde la página.
 */
@Component({
  selector: 'app-document-summary-step',
  imports: [TranslatePipe],
  templateUrl: './document-summary-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentSummaryStepComponent {
  protected readonly draft = inject(DocumentDraftStore);
  protected readonly isEntry = computed(() => this.draft.type() === 'ENTRY');
  protected readonly isAdjustment = this.draft.isAdjustment;

  protected valueText(line: DocumentLine): string {
    return valueText(line);
  }

  protected currentText(line: DocumentLine): string {
    return currentText(line);
  }

  protected differenceText(line: DocumentLine): string {
    return differenceText(line);
  }
}
