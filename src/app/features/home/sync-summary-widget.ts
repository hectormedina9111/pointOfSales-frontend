import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SyncApi, SyncStatusView } from '../../core/api/sync-api';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { autoRefresh } from '../../shared/polling/auto-refresh';

/**
 * Resumen de sincronización del inicio de una tienda: versión aplicada, última sincronización y
 * último error. Solo aparece con el privilegio GET_SYNC_STATUS.
 */
@Component({
  selector: 'app-sync-summary-widget',
  imports: [RouterLink, TranslatePipe, ProblemAlertComponent, RelativeTimePipe],
  templateUrl: './sync-summary-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncSummaryWidgetComponent {
  private readonly api = inject(SyncApi);

  protected readonly status = signal<SyncStatusView | null>(null);
  protected readonly error = signal<unknown>(null);

  constructor() {
    autoRefresh(signal(true), () => this.load());
  }

  private load(): void {
    this.api.status().subscribe({
      next: (view) => {
        this.status.set(view);
        this.error.set(null);
      },
      error: (error: unknown) => this.error.set(error),
    });
  }
}
