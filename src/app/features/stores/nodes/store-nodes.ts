import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SystemInfoService } from '../../../core/system/system-info.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { StoreNodeListComponent } from './store-node-list';

/**
 * Pantalla de tiendas (ruta stores/nodes). El registro de tiendas vive en la central: en una tienda
 * solo se muestra un aviso, y el panel no pide datos al backend.
 */
@Component({
  selector: 'app-store-nodes',
  imports: [RouterLink, TranslatePipe, ProblemAlertComponent, StoreNodeListComponent],
  templateUrl: './store-nodes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreNodesComponent {
  protected readonly systemInfo = inject(SystemInfoService);
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly isStore = this.systemInfo.isStore;
  protected readonly failed = computed(() => this.systemInfo.state().status === 'error');
}
