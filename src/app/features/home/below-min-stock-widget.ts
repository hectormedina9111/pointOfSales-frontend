import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { InventoryApi } from '../../core/api/inventory-api';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/**
 * Widget "Existencias bajo el mínimo" del inicio: cuántos productos están bajo su mínimo en las
 * sucursales que ve este nodo, con enlace al listado filtrado. Solo aparece con GET_INVENTORY.
 */
@Component({
  selector: 'app-below-min-stock-widget',
  imports: [RouterLink, ProblemAlertComponent, TranslatePipe],
  templateUrl: './below-min-stock-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BelowMinStockWidgetComponent implements OnInit {
  private readonly api = inject(InventoryApi);

  protected readonly count = signal<number | null>(null);
  protected readonly error = signal<unknown>(null);

  ngOnInit(): void {
    // Una página de tamaño 1 basta: solo interesa el total.
    this.api
      .stock({ page: 0, size: 1 }, { search: null, categoryId: null, branchId: null, belowMin: true })
      .subscribe({
        next: (page) => this.count.set(page.totalElements),
        error: (error: unknown) => this.error.set(error),
      });
  }
}
