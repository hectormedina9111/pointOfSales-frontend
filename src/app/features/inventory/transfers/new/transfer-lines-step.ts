import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ProductView } from '../../../../core/api/products-api';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { ProductPickerComponent } from '../../../../shared/components/product-picker/product-picker';
import { FieldLabelComponent } from '../../../../shared/components/field-label/field-label';
import { SerialChipsComponent } from '../../../../shared/components/serial-chips/serial-chips';
import { quantityToThousandths, thousandthsToQuantity } from '../../../../shared/forms/amounts';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TransferDraftStore, TransferLine } from './transfer-draft.store';

/**
 * Paso 2 de la transferencia: productos. Se busca cada producto y se agrega; la cantidad se escribe a
 * mano, salvo en productos con seriales, donde cada serial disponible en la sucursal de origen suma
 * una unidad. A la derecha de la cantidad se ve la existencia en el origen.
 */
@Component({
  selector: 'app-transfer-lines-step',
  imports: [ProblemAlertComponent, FieldLabelComponent, ProductPickerComponent, SerialChipsComponent, TranslatePipe],
  templateUrl: './transfer-lines-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferLinesStepComponent {
  protected readonly draft = inject(TransferDraftStore);

  /** Clave de traducción del aviso de la última acción, o null. */
  protected readonly lineMessage = signal<string | null>(null);

  protected valueText(line: TransferLine): string {
    return line.value === null ? '' : thousandthsToQuantity(line.value);
  }

  /** Un producto que no controla inventario no se puede transferir: se avisa y no se agrega. */
  protected addProduct(product: ProductView): void {
    if (!product.tracksInventory) {
      this.lineMessage.set('error.PRODUCT_NOT_INVENTORIED');
      return;
    }
    this.lineMessage.set(this.draft.addProduct(product) ? null : 'inventory.transfers.lines.duplicate');
  }

  /** Cantidad escrita a mano. Si no es válida, se restaura el texto anterior y se avisa. */
  protected onValueChange(line: TransferLine, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || line.tracksSerials) {
      return;
    }
    const thousandths = quantityToThousandths(input.value);
    if (thousandths === null) {
      this.lineMessage.set('inventory.lines.invalidQuantity');
      input.value = this.valueText(line);
      return;
    }
    this.lineMessage.set(null);
    this.draft.setValue(line.key, thousandths);
  }

  protected removeLine(line: TransferLine): void {
    this.draft.removeLine(line.key);
  }

  protected addSerial(line: TransferLine, serial: string): void {
    this.draft.addSerial(line.key, serial);
  }

  protected removeSerial(line: TransferLine, serial: string): void {
    this.draft.removeSerial(line.key, serial);
  }
}
