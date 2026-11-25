import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { FieldErrorComponent, isInvalidControl } from '../../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../../shared/components/field-label/field-label';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TransferDraftStore } from './transfer-draft.store';

/**
 * Paso 1 de la transferencia: sucursal de destino y notas. La central elige también la sucursal de
 * origen; una tienda envía desde la suya. El destino nunca es el origen.
 */
@Component({
  selector: 'app-transfer-destination-step',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './transfer-destination-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferDestinationStepComponent {
  protected readonly draft = inject(TransferDraftStore);
  protected readonly form = this.draft.form;
  protected readonly isCentral = this.draft.isCentral;
  protected readonly isInvalid = isInvalidControl;
  /** Solo las sucursales activas se ofrecen como origen en la central. */
  protected readonly originOptions = computed(() => this.draft.branches().filter((branch) => branch.active));
  /** Sin sucursales de destino el envío no es posible: se avisa en lugar de mostrar una lista vacía. */
  protected readonly noDestinations = computed(
    () => this.draft.branches().length > 0 && this.draft.destinationOptions().length === 0,
  );
}
