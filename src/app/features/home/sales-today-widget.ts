import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CompanyApi } from '../../core/api/company-api';
import { SalesApi } from '../../core/api/sales-api';
import { PrivilegesService } from '../../core/auth/privileges.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { formatMoney, sumAmounts } from '../../shared/forms/amounts';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { SALES_TODAY_PAGE_SIZE, paidSalesToday } from './sales-today';

/**
 * Widget "Ventas de hoy" de una tienda: cantidad y total de las ventas cobradas hoy. Con
 * ACTION_SALES_VIEW_ALL cuenta todas las de la tienda; sin él, solo las del usuario (lo decide el servidor).
 */
@Component({
  selector: 'app-sales-today-widget',
  imports: [RouterLink, ProblemAlertComponent, TranslatePipe],
  templateUrl: './sales-today-widget.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesTodayWidgetComponent {
  private readonly api = inject(SalesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly language = inject(LanguageService);
  private readonly privileges = inject(PrivilegesService);

  protected readonly pageSize = SALES_TODAY_PAGE_SIZE;
  protected readonly canViewAll = computed(() => this.privileges.has('ACTION_SALES_VIEW_ALL'));
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly count = signal(0);
  protected readonly total = signal(0);
  /** Verdadero si hay más ventas que las recibidas: el total es parcial. */
  protected readonly truncated = signal(false);
  protected readonly currency = signal<string | null>(null);

  constructor() {
    this.api.list({ page: 0, size: SALES_TODAY_PAGE_SIZE }, paidSalesToday()).subscribe({
      next: (page) => {
        this.count.set(page.totalElements);
        this.total.set(sumAmounts(page.content.map((sale) => sale.total)));
        this.truncated.set(page.totalElements > page.content.length);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
  }

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }
}
