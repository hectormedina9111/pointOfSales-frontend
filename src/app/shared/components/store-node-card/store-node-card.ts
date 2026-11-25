import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StoreNodeView } from '../../../core/api/store-nodes-api';
import { downloadProgress } from '../../stores/store-node-progress';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { SyncStateBadgeComponent } from '../sync-state-badge/sync-state-badge';

/**
 * Tarjeta de una tienda: estado, conexión, último latido, versiones y cambios pendientes con una
 * barra de progreso (versión descargada frente a la última de la central). El contenido proyectado
 * (botones) va en el pie.
 */
@Component({
  selector: 'app-store-node-card',
  imports: [TranslatePipe, RelativeTimePipe, SyncStateBadgeComponent],
  templateUrl: './store-node-card.html',
  styles: `
    :host {
      display: block;
    }

    .min-w-0 {
      min-width: 0;
    }

    .store-card {
      transition: box-shadow 0.3s ease;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreNodeCardComponent {
  readonly node = input.required<StoreNodeView>();
  /** Nombre de la sucursal, o null si la tienda no tiene. Lo calcula quien muestra la tarjeta. */
  readonly branchName = input<string | null>(null);
  readonly highlighted = input(false);

  /** Versión descargada por la tienda; 0 si nunca ha descargado nada. */
  protected readonly downloaded = computed(() => this.node().lastDownloadVersion ?? 0);

  protected readonly progress = computed(() => downloadProgress(this.node()));
}
