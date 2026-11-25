import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { BranchView, BranchesApi } from '../../core/api/branches-api';
import { CompanyApi } from '../../core/api/company-api';
import {
  CreditNoteLookupView,
  CreditNoteRedemptionStatus,
  CreditNoteRedemptionView,
  CreditNoteStatus,
  CreditNoteView,
  CreditNotesApi,
} from '../../core/api/credit-notes-api';
import { listAllPages } from '../../core/api/page';
import { FINAL_CONSUMER_ID } from '../../core/api/sales-api';
import { StoreNodesApi } from '../../core/api/store-nodes-api';
import { LanguageService } from '../../core/i18n/language.service';
import { SystemInfoService } from '../../core/system/system-info.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../shared/forms/amounts';
import { PagedList } from '../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { branchLabel } from '../../shared/stores/branch-label';

/** Destino del botón "Volver": el listado con los filtros con que el usuario llegó, o /credit-notes. */
const LIST_URL = /^\/credit-notes(\?|$)/;

/**
 * Detalle de una nota de crédito: número, cliente, monto, saldo, estado, fecha de emisión y la
 * devolución que la originó. En la central lista sus usos (paginados en el servidor); en una tienda
 * el saldo es el sincronizado y se puede consultar el saldo actual en la central.
 */
@Component({
  selector: 'app-credit-note-detail-page',
  imports: [RouterLink, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './credit-note-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditNoteDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CreditNotesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly storeNodesApi = inject(StoreNodesApi);
  private readonly language = inject(LanguageService);
  private readonly systemInfo = inject(SystemInfoService);

  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly isStore = this.systemInfo.isStore;
  protected readonly finalConsumerId = FINAL_CONSUMER_ID;

  /** Listado al que vuelve el botón. El listado lo pasa en el estado de la navegación. */
  protected readonly backUrl = this.listUrlFromState();

  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly note = signal<CreditNoteView | null>(null);
  protected readonly currency = signal<string | null>(null);
  protected readonly branches = signal<readonly BranchView[]>([]);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );

  /** Saldo actual que devuelve la central al consultarlo desde una tienda. */
  protected readonly currentBalance = signal<CreditNoteLookupView | null>(null);
  protected readonly checking = signal(false);
  protected readonly checkError = signal<unknown>(null);

  /** Número de nota de los usos: id de store_node a número de tienda. Vacío si no se pudo cargar. */
  private readonly storeNumbers = signal<ReadonlyMap<number, number>>(new Map());

  private noteId = 0;
  /** Usos de la nota en la central, paginados en el servidor. El id se fija antes de la primera carga. */
  protected readonly uses = new PagedList<CreditNoteRedemptionView>(
    (request) => this.api.redemptions(this.noteId, request),
    'createdAt,desc',
  );

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.noteId = id;

    if (this.isCentral()) {
      // Sin el privilegio de sucursales, la fila muestra el id.
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: () => undefined,
      });
      // Sin el privilegio de tiendas, la columna Tienda muestra el id del nodo.
      listAllPages((request) => this.storeNodesApi.list(request), 'nodeNumber').subscribe({
        next: (nodes) => this.storeNumbers.set(new Map(nodes.map((node) => [node.id, node.nodeNumber] as const))),
        error: () => undefined,
      });
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });

    this.api.get(id).subscribe({
      next: (note) => {
        this.note.set(note);
        this.loading.set(false);
        if (this.isCentral()) {
          this.uses.load();
        }
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

  /** Consulta el saldo actual en la central (solo en una tienda, con conexión). */
  protected checkBalance(number: string): void {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.checkError.set(null);
    this.currentBalance.set(null);
    this.api.lookup(number).subscribe({
      next: (current) => {
        this.checking.set(false);
        this.currentBalance.set(current);
      },
      error: (error: unknown) => {
        this.checking.set(false);
        this.checkError.set(error);
      },
    });
  }

  /** Número de la tienda de un uso, o undefined si no se conoce. */
  protected storeNumber(storeNodeId: number): number | undefined {
    return this.storeNumbers().get(storeNodeId);
  }

  protected redemptionClass(status: CreditNoteRedemptionStatus): string {
    switch (status) {
      case 'APPLIED':
        return 'badge text-bg-info';
      case 'CONFIRMED':
        return 'badge text-bg-success';
      case 'RELEASED':
        return 'badge text-bg-secondary';
    }
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected statusClass(status: CreditNoteStatus): string {
    return status === 'ACTIVE' ? 'badge text-bg-success' : 'badge text-bg-secondary';
  }

  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/credit-notes';
  }
}
