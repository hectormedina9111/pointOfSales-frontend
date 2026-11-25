import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { OrderType } from '../../../core/api/sales-api';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { OrderDraftStore } from './order-draft.store';

/** Tipos de venta que se ofrecen. CREDIT aparece deshabilitado hasta que exista el módulo de crédito. */
const ORDER_TYPES: readonly OrderType[] = ['CASH', 'CREDIT'];

/**
 * Paso 2 de la orden: al contado o a crédito. El crédito todavía no está disponible, así que se
 * muestra deshabilitado con un aviso. El tipo siempre tiene valor, así que el paso siempre avanza.
 */
@Component({
  selector: 'app-order-type-step',
  imports: [FieldLabelComponent, TranslatePipe],
  templateUrl: './order-type-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderTypeStepComponent {
  protected readonly store = inject(OrderDraftStore);
  protected readonly types = ORDER_TYPES;

  protected isAvailable(type: OrderType): boolean {
    return type === 'CASH';
  }
}
