import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { InventoryApi } from '../../core/api/inventory-api';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/**
 * Widget "Transferencias entrantes en tránsito" del inicio: cuántas transferencias llegan al nodo y
 * esperan recepción, con enlace al listado filtrado. Solo aparece con GET_INVENTORY_TRANSFERS.
 */
@Component({
  selector: 'app-incoming-transfers-widget',
  imports: [RouterLink, ProblemAlertComponent, TranslatePipe],
  templateUrl: './incoming-transfers-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomingTransfersWidgetComponent implements OnInit {
  private readonly api = inject(InventoryApi);

  protected readonly count = signal<number | null>(null);
  protected readonly error = signal<unknown>(null);

  ngOnInit(): void {
    // Una página de tamaño 1 basta: solo interesa el total.
    this.api
      .transfers(
        { page: 0, size: 1 },
        { direction: 'INCOMING', status: 'IN_TRANSIT', branchId: null, search: null, from: null, to: null },
      )
      .subscribe({
        next: (page) => this.count.set(page.totalElements),
        error: (error: unknown) => this.error.set(error),
      });
  }
}
