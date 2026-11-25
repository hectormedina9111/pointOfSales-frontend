import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { BranchView, BranchesApi } from '../../core/api/branches-api';
import { CompanyApi } from '../../core/api/company-api';
import { listAllPages } from '../../core/api/page';
import { SaleSummaryView, SalesApi } from '../../core/api/sales-api';
import { LanguageService } from '../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { formatMoney, sumAmounts } from '../../shared/forms/amounts';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { branchLabel } from '../../shared/stores/branch-label';
import { SALES_TODAY_PAGE_SIZE, paidSalesToday } from './sales-today';

/** Una fila de la tabla: ventas cobradas de hoy de una sucursal. */
interface BranchSalesRow {
  readonly branchId: number;
  readonly count: number;
  readonly total: number;
}

/**
 * Tabla "Ventas de hoy por tienda" de la central: las ventas cobradas de hoy agrupadas por
 * sucursal. La agrupación es en la web, sobre la primera página (200 ventas): si hay más, el
 * total de la tabla es parcial y se avisa.
 */
@Component({
  selector: 'app-sales-today-by-branch-widget',
  imports: [ProblemAlertComponent, TranslatePipe],
  templateUrl: './sales-today-by-branch-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesTodayByBranchWidgetComponent {
  private readonly api = inject(SalesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly language = inject(LanguageService);

  protected readonly pageSize = SALES_TODAY_PAGE_SIZE;
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly sales = signal<readonly SaleSummaryView[]>([]);
  protected readonly totalElements = signal(0);
  protected readonly branches = signal<ReadonlyMap<number, BranchView>>(new Map());
  protected readonly currency = signal<string | null>(null);

  /** Verdadero si hay más ventas que las de la primera página: los totales son parciales. */
  protected readonly truncated = computed(() => this.totalElements() > this.sales().length);

  protected readonly rows = computed<readonly BranchSalesRow[]>(() => {
    const groups = new Map<number, SaleSummaryView[]>();
    for (const sale of this.sales()) {
      const group = groups.get(sale.branchId) ?? [];
      group.push(sale);
      groups.set(sale.branchId, group);
    }
    return [...groups.entries()]
      .map(([branchId, group]) => ({
        branchId,
        count: group.length,
        total: sumAmounts(group.map((sale) => sale.total)),
      }))
      .sort((a, b) => this.name(a.branchId).localeCompare(this.name(b.branchId)));
  });

  protected readonly grandTotal = computed(() => sumAmounts(this.sales().map((sale) => sale.total)));

  constructor() {
    this.api.list({ page: 0, size: SALES_TODAY_PAGE_SIZE }, paidSalesToday()).subscribe({
      next: (page) => {
        this.sales.set(page.content);
        this.totalElements.set(page.totalElements);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
    // Sin el privilegio de sucursales, la tabla muestra el id de la sucursal.
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => this.branches.set(new Map(list.map((branch) => [branch.id, branch] as const))),
      error: () => undefined,
    });
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
  }

  protected name(branchId: number): string {
    return branchLabel(this.branches(), branchId) ?? String(branchId);
  }

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }
}
