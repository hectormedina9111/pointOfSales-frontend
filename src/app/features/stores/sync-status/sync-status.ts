import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { SyncApi, SyncStatusView } from '../../../core/api/sync-api';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { branchLabel } from '../../../shared/stores/branch-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { checkedValue } from '../../../shared/forms/form-values';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { autoRefresh } from '../../../shared/polling/auto-refresh';

/**
 * Estado de sincronización de esta tienda (ruta stores/sync-status). Se refresca sola mientras la
 * pestaña está visible. En la central solo muestra un aviso con el enlace al panel de tiendas.
 */
@Component({
  selector: 'app-sync-status',
  imports: [RouterLink, TranslatePipe, ProblemAlertComponent, LocalDateTimePipe, RelativeTimePipe],
  templateUrl: './sync-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncStatusComponent {
  private readonly api = inject(SyncApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly translation = inject(TranslationService);
  protected readonly systemInfo = inject(SystemInfoService);

  protected readonly autoRefreshOn = signal(true);
  protected readonly status = signal<SyncStatusView | null>(null);
  protected readonly error = signal<unknown>(null);
  protected readonly lastUpdated = signal<Date | null>(null);
  protected readonly branches = signal<ReadonlyMap<number, BranchView>>(new Map());

  constructor() {
    // Mientras el nodo no se sabe, o es una tienda, se consulta; en la central no hace falta.
    autoRefresh(computed(() => this.autoRefreshOn() && !this.systemInfo.isCentral()), () => this.load());
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => this.branches.set(new Map(list.map((branch) => [branch.id, branch] as const))),
    });
  }

  protected toggleAutoRefresh(event: Event): void {
    this.autoRefreshOn.set(checkedValue(event));
  }

  /** Código y nombre de la sucursal, o un aviso si la lista aún no la tiene. */
  protected branchLabel(branchId: number | null): string | null {
    if (branchId === null) {
      return null;
    }
    return branchLabel(this.branches(), branchId) ?? this.translation.translate('stores.nodes.branch.unavailable');
  }

  private load(): void {
    this.api.status().subscribe({
      next: (view) => {
        this.status.set(view);
        this.error.set(null);
        this.lastUpdated.set(new Date());
      },
      error: (error: unknown) => this.error.set(error),
    });
  }
}
