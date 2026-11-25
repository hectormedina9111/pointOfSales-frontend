import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';

import { InventoryApi } from '../../../../core/api/inventory-api';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../../shared/components/stepper/stepper';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DocumentDraftStore } from './document-draft.store';
import { DocumentLinesStepComponent } from './document-lines-step';
import { DocumentSummaryStepComponent } from './document-summary-step';
import { DocumentTypeStepComponent } from './document-type-step';

/**
 * Nuevo documento de inventario, en tres pasos: tipo y motivo, líneas y resumen. Guardar envía el
 * documento con la clave de idempotencia de la pantalla, así un reintento tras un fallo de red no
 * lo aplica dos veces. Al guardarse, abre el detalle del documento.
 */
@Component({
  selector: 'app-document-page',
  imports: [
    ProblemAlertComponent,
    StepperComponent,
    StepComponent,
    DocumentTypeStepComponent,
    DocumentLinesStepComponent,
    DocumentSummaryStepComponent,
    TranslatePipe,
  ],
  templateUrl: './document-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DocumentDraftStore],
})
export class DocumentPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  protected readonly draft = inject(DocumentDraftStore);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<unknown>(null);

  /** Controles de cada paso: el asistente no avanza mientras alguno tenga error. */
  protected readonly typeControls: readonly AbstractControl[] = [
    this.draft.form.controls.type,
    this.draft.form.controls.branchId,
    this.draft.form.controls.reason,
  ];
  protected readonly lineControls: readonly AbstractControl[] = [this.draft.linesControl];
  /** El resumen no tiene campos propios. */
  protected readonly noControls: readonly AbstractControl[] = [];

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.createDocument(this.draft.buildRequest()).subscribe({
      next: (document) => void this.router.navigate(['/inventory/documents', document.id]),
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(error);
      },
    });
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/inventory/documents');
  }
}
