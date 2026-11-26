import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { ProductView } from '../../../core/api/products-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { EquipmentLoadStore } from './equipment-load.store';

/**
 * Paso 1 de la carga: sucursal (solo en la central, obligatoria allí), producto con serie, costo unitario
 * y notas. Al elegir el producto se carga la plantilla de características de su categoría; un producto
 * sin serie no se acepta, porque sus unidades no son equipos.
 */
@Component({
  selector: 'app-load-header-step',
  imports: [ReactiveFormsModule, FieldErrorComponent, FieldLabelComponent, ProblemAlertComponent, ProductPickerComponent, TranslatePipe],
  templateUrl: './load-header-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadHeaderStepComponent {
  protected readonly store = inject(EquipmentLoadStore);
  protected readonly form = this.store.form;
  protected readonly isCentral = this.store.isCentral;
  protected readonly isInvalid = isInvalidControl;
  /** Solo las sucursales activas se ofrecen para cargar. */
  protected readonly branchOptions = computed(() => this.store.branches().filter((branch) => branch.active));
  /** Aviso de la última elección de producto (clave de traducción), o null. */
  protected readonly productMessage = signal<string | null>(null);

  protected pickProduct(product: ProductView): void {
    this.productMessage.set(this.store.chooseProduct(product));
  }
}
