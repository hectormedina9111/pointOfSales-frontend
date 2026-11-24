import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';

import { StoreNodesApi, StoreNodeView } from '../../core/api/store-nodes-api';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { SyncStateBadgeComponent } from '../../shared/components/sync-state-badge/sync-state-badge';
import { PagedList } from '../../shared/paging/paged-list';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { autoRefresh } from '../../shared/polling/auto-refresh';
import { CaughtUpTracker } from '../../shared/stores/caught-up-tracker';
import { downloadProgress } from '../../shared/stores/store-node-progress';

/**
 * Widget "Tiendas" del inicio de la central: los mismos datos que el panel, en compacto, con
 * refresco automático y enlace al panel. Solo aparece con el privilegio GET_STORE_NODES.
 */
@Component({
  selector: 'app-stores-widget',
  imports: [RouterLink, TranslatePipe, ProblemAlertComponent, SyncStateBadgeComponent],
  templateUrl: './stores-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoresWidgetComponent {
  private readonly api = inject(StoreNodesApi);
  protected readonly caughtUp = new CaughtUpTracker();
  protected readonly lastUpdated = signal<Date | null>(null);

  protected readonly nodes = new PagedList<StoreNodeView>(
    (request) =>
      this.api.list(request).pipe(
        tap((page) => {
          this.caughtUp.observe(page.content);
        }),
      ),
    'nodeNumber,asc',
    50,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.caughtUp.dispose());
    autoRefresh(signal(true), () => this.nodes.load());
  }

  protected progress(node: StoreNodeView): number {
    return downloadProgress(node);
  }
}
