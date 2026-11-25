import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';

import { InventoryApi } from '../../../../core/api/inventory-api';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../../shared/components/stepper/stepper';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TransferDestinationStepComponent } from './transfer-destination-step';
import { TransferDraftStore } from './transfer-draft.store';
import { TransferLinesStepComponent } from './transfer-lines-step';
import { TransferSummaryStepComponent } from './transfer-summary-step';

/**
 * Nueva transferencia, en tres pasos: destino y notas, productos y resumen. Enviar usa la clave de
 * idempotencia de la pantalla, así un reintento tras un fallo de red no envía dos veces. Al enviarse,
 * abre el detalle de la transferencia.
 */
@Component({
  selector: 'app-transfer-page',
  imports: [
    ProblemAlertComponent,
    StepperComponent,
    StepComponent,
    TransferDestinationStepComponent,
    TransferLinesStepComponent,
    TransferSummaryStepComponent,
    TranslatePipe,
  ],
  templateUrl: './transfer-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TransferDraftStore],
})
export class TransferPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  protected readonly draft = inject(TransferDraftStore);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<unknown>(null);

  /** Controles de cada paso: el asistente no avanza mientras alguno tenga error. */
  protected readonly destinationControls: readonly AbstractControl[] = [
    this.draft.form.controls.originBranchId,
    this.draft.form.controls.destinationBranchId,
  ];
  protected readonly lineControls: readonly AbstractControl[] = [this.draft.linesControl];
  /** El resumen no tiene campos propios. */
  protected readonly noControls: readonly AbstractControl[] = [];

  protected send(): void {
    const body = this.draft.buildRequest();
    if (this.saving() || body === null) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.createTransfer(body).subscribe({
      next: (transfer) => void this.router.navigate(['/inventory/transfers', transfer.id]),
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(error);
      },
    });
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/inventory/transfers');
  }
}
