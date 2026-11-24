import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';

import { BranchView, BranchesApi } from '../../core/api/branches-api';
import { listAllPages } from '../../core/api/page';
import { StoreNodesApi, StoreNodeView } from '../../core/api/store-nodes-api';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { SyncStateBadgeComponent } from '../../shared/components/sync-state-badge/sync-state-badge';
import { PagedList } from '../../shared/paging/paged-list';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { autoRefresh } from '../../shared/polling/auto-refresh';
import { branchLabel } from '../../shared/stores/branch-label';
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
  private readonly branchesApi = inject(BranchesApi);
  protected readonly branches = signal<ReadonlyMap<number, BranchView>>(new Map());
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
    // Sin el privilegio de sucursales, o si falla, el widget muestra el id de la sucursal.
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => this.branches.set(new Map(list.map((branch) => [branch.id, branch] as const))),
      error: () => undefined,
    });
  }

  /** Código y nombre de la sucursal, o null si la tienda no tiene. */
  protected branchName(node: StoreNodeView): string | null {
    return node.branchId === null ? null : branchLabel(this.branches(), node.branchId);
  }

  protected progress(node: StoreNodeView): number {
    return downloadProgress(node);
  }
}
