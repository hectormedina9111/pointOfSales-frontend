import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { InventoryDocumentType } from '../../../../core/api/inventory-api';
import { FieldErrorComponent, isInvalidControl } from '../../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../../shared/components/field-label/field-label';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DocumentDraftStore } from './document-draft.store';

/**
 * Paso 1 del documento: tipo, sucursal (solo en la central, obligatoria allí) y motivo (obligatorio
 * en salidas y ajustes). Los campos viven en el formulario del almacén del documento.
 */
@Component({
  selector: 'app-document-type-step',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './document-type-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTypeStepComponent {
  protected readonly draft = inject(DocumentDraftStore);
  protected readonly form = this.draft.form;
  protected readonly isCentral = this.draft.isCentral;
  protected readonly isInvalid = isInvalidControl;
  protected readonly types: readonly InventoryDocumentType[] = ['ENTRY', 'EXIT', 'ADJUSTMENT'];
  /** Solo las sucursales activas se ofrecen para documentar. */
  protected readonly branchOptions = computed(() => this.draft.branches().filter((branch) => branch.active));
  /** El motivo es obligatorio en salidas y ajustes; en entradas es opcional. */
  protected readonly reasonRequired = computed(() => this.draft.type() !== 'ENTRY');
}
