import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { merge } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CashRegisterView, CashRegistersApi } from '../../../core/api/cash-registers-api';
import { CompanyApi } from '../../../core/api/company-api';
import { listAllPages } from '../../../core/api/page';
import { SaleFilters, SaleStatus, SaleSummaryView, SalesApi } from '../../../core/api/sales-api';
import { UserView, UsersApi } from '../../../core/api/users-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { endOfDay, startOfDay } from '../../../shared/time/day-range';
import { branchLabel } from '../../../shared/stores/branch-label';
import { SaleDetailComponent } from './sale-detail';

/**
 * Ventas realizadas: listado paginado, más reciente primero, con filtros de fecha, estado, cajero
 * (con ACTION_SALES_VIEW_ALL) y sucursal (solo en la central). Cada fila abre el detalle.
 * Es de solo lectura.
 */
@Component({
  selector: 'app-sales-list',
  imports: [ReactiveFormsModule, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './sales-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesListComponent implements OnInit {
  private readonly api = inject(SalesApi);
  private readonly registersApi = inject(CashRegistersApi);
  private readonly usersApi = inject(UsersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly language = inject(LanguageService);
  private readonly privileges = inject(PrivilegesService);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central ve todas las sucursales: el filtro y la columna Sucursal aparecen allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  /** Sin ACTION_SALES_VIEW_ALL el servidor muestra solo las ventas del usuario: el filtro de cajero no aparece. */
  protected readonly canViewAll = computed(() => this.privileges.has('ACTION_SALES_VIEW_ALL'));
  /** Columnas de la tabla: la de Sucursal solo en la central. */
  protected readonly columnCount = computed(() => (this.isCentral() ? 8 : 7));

  protected readonly filterForm = this.fb.group({
    status: this.fb.control<SaleStatus | null>(null),
    cashierId: this.fb.control<number | null>(null),
    branchId: this.fb.control<number | null>(null),
    from: this.fb.control(''),
    to: this.fb.control(''),
  });

  protected readonly sales = new PagedList<SaleSummaryView>(
    (request) => this.api.list(request, this.filters()),
    'createdAt,desc',
  );

  protected readonly registers = signal<readonly CashRegisterView[]>([]);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly users = signal<readonly UserView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly rangeInvalid = signal(false);

  private readonly registerMap = computed(
    () => new Map(this.registers().map((register) => [register.id, register] as const)),
  );
  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );
  private readonly userMap = computed(() => new Map(this.users().map((user) => [user.id, user] as const)));

  constructor() {
    merge(
      this.filterForm.controls.status.valueChanges,
      this.filterForm.controls.cashierId.valueChanges,
      this.filterForm.controls.branchId.valueChanges,
      this.filterForm.controls.from.valueChanges,
      this.filterForm.controls.to.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
  }

  ngOnInit(): void {
    this.sales.load();
    listAllPages((request) => this.registersApi.list(request, { branchId: null, active: null }), 'code').subscribe({
      next: (registers) => this.registers.set(registers),
      error: (error: unknown) => this.lookupError.set(error),
    });
    if (this.isCentral()) {
      // Sin el privilegio de sucursales, el filtro queda en "Todas" y la columna muestra el id.
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: () => undefined,
      });
    }
    if (this.canViewAll()) {
      // Sin el privilegio de usuarios, el filtro de cajero queda vacío y las filas muestran el id.
      listAllPages((request) => this.usersApi.list(request), 'username').subscribe({
        next: (users) => this.users.set(users),
        error: () => undefined,
      });
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
  }

  protected registerLabel(sale: SaleSummaryView): string {
    if (sale.cashRegisterId === null) {
      return '—';
    }
    const register = this.registerMap().get(sale.cashRegisterId);
    return register ? `${register.code} · ${register.name}` : String(sale.cashRegisterId);
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected cashierLabel(userId: number): string {
    return this.userMap().get(userId)?.username ?? `#${userId}`;
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected open(sale: SaleSummaryView): void {
    const ref = this.modal.open(SaleDetailComponent, { size: 'lg' });
    ref.componentInstance.saleId = sale.id;
    ref.componentInstance.registerLabel = this.registerLabel(sale);
    ref.componentInstance.branchLabel = this.isCentral() ? this.branchName(sale.branchId) : null;
    ref.componentInstance.cashierLabel = this.cashierLabel(sale.cashierId);
    ref.componentInstance.currency = this.currency();
    ref.componentInstance.userNames = new Map(this.users().map((user) => [user.id, user.username] as const));
  }

  /** Aplica los filtros: si el rango de fechas es inválido, no consulta y avisa. */
  private applyFilters(): void {
    const { from, to } = this.filterForm.getRawValue();
    this.rangeInvalid.set(from !== '' && to !== '' && from > to);
    if (!this.rangeInvalid()) {
      this.sales.restart();
    }
  }

  private filters(): SaleFilters {
    const value = this.filterForm.getRawValue();
    return {
      status: value.status,
      cashSessionId: null,
      cashierId: this.canViewAll() ? value.cashierId : null,
      branchId: this.isCentral() ? value.branchId : null,
      from: value.from === '' ? null : startOfDay(value.from),
      to: value.to === '' ? null : endOfDay(value.to),
    };
  }
}
