import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CompanyApi } from '../../../core/api/company-api';
import { listAllPages } from '../../../core/api/page';
import { FINAL_CONSUMER_ID, SaleView, SalesApi } from '../../../core/api/sales-api';
import { UserView, UsersApi } from '../../../core/api/users-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { branchLabel } from '../../../shared/stores/branch-label';
import { SaleTotalsComponent } from '../shared/sale-totals';
import { saleStatusClass } from '../shared/sale-status';

/** Destino del botón "Volver": el listado con los filtros con que el usuario llegó, o /sales. */
const LIST_URL = /^\/sales(\?|$)/;

/**
 * Detalle de una orden (venta en espera o cobrada): encabezado, líneas con precio de lista y precio
 * cambiado, descuentos, totales y pagos. Las acciones dependen del estado: una orden en espera se
 * edita, se cobra o se elimina; una cobrada se reimprime. Eliminar pide confirmación y vuelve al
 * listado. Es de solo lectura salvo esas acciones.
 */
@Component({
  selector: 'app-order-detail-page',
  imports: [RouterLink, ProblemAlertComponent, SaleTotalsComponent, IfPrivilegeDirective, LocalDateTimePipe, TranslatePipe],
  templateUrl: './order-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(SalesApi);
  private readonly usersApi = inject(UsersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly modal = inject(NgbModal);
  private readonly language = inject(LanguageService);
  private readonly privileges = inject(PrivilegesService);
  protected readonly systemInfo = inject(SystemInfoService);

  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly finalConsumerId = FINAL_CONSUMER_ID;
  /** Sin ACTION_SALES_VIEW_ALL no se piden usuarios: las filas muestran el id, como en el listado. */
  private readonly canViewAll = this.privileges.has('ACTION_SALES_VIEW_ALL');

  /** Listado al que vuelve el botón. El listado lo pasa en el estado de la navegación. */
  protected readonly backUrl = this.listUrlFromState();

  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly actionError = signal<unknown>(null);
  protected readonly busy = signal(false);
  protected readonly sale = signal<SaleView | null>(null);
  protected readonly currency = signal<string | null>(null);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly users = signal<readonly UserView[]>([]);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );
  private readonly userMap = computed(() => new Map(this.users().map((user) => [user.id, user] as const)));

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }

    if (this.isCentral()) {
      // Sin el privilegio de sucursales, la columna muestra el id.
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: () => undefined,
      });
    }
    if (this.canViewAll) {
      listAllPages((request) => this.usersApi.list(request), 'username').subscribe({
        next: (users) => this.users.set(users),
        error: () => undefined,
      });
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });

    this.api.get(id).subscribe({
      next: (sale) => {
        this.sale.set(sale);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  /** Elimina la orden en espera tras confirmar; luego vuelve al listado. */
  protected async remove(): Promise<void> {
    const current = this.sale();
    if (current === null) {
      return;
    }
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'sales.pos.holds.deleteTitle',
      messageKey: 'sales.pos.holds.deleteMessage',
      confirmKey: 'sales.pos.holds.deleteConfirm',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.api.deleteHold(current.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.back();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(error);
      },
    });
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  /** Clase del distintivo de estado. */
  protected statusClass(sale: SaleView): string {
    return saleStatusClass(sale.status);
  }

  /** Una venta cobrada (total o parcialmente devuelta) se devuelve desde una tienda. */
  protected canReturn(sale: SaleView): boolean {
    return !this.isCentral() && sale.type === 'SALE' && (sale.status === 'PAID' || sale.status === 'PARTIALLY_RETURNED');
  }

  /** Toda orden cobrada, venta o devolución, tiene ticket para reimprimir. */
  protected canReprint(sale: SaleView): boolean {
    return sale.status !== 'ON_HOLD';
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected userLabel(userId: number): string {
    return this.userMap().get(userId)?.username ?? `#${userId}`;
  }

  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/sales';
  }
}
