import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { BranchView, BranchesApi } from '../../../../core/api/branches-api';
import {
  InventoryApi,
  TransferDirection,
  TransferFilters,
  TransferStatus,
  TransferView,
} from '../../../../core/api/inventory-api';
import { listAllPages } from '../../../../core/api/page';
import { SystemInfoService } from '../../../../core/system/system-info.service';
import { IfPrivilegeDirective } from '../../../../shared/directives/if-privilege.directive';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { PagedList } from '../../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { endOfDay, startOfDay } from '../../../../shared/time/day-range';
import { DAY_PATTERN, RawValue, idOf, matching, pick } from '../shared/inventory-query';
import { NodeBranchService } from '../shared/node-branch.service';
import { TRANSFER_STATUSES, transferStatusClass } from './transfer-labels';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;
/** Orden fijo: la transferencia más reciente primero. */
const TRANSFER_SORT = 'sentAt,desc';
const DIRECTIONS: readonly TransferDirection[] = ['INCOMING', 'OUTGOING'];

/** Filtros del listado tal como están en la URL. "" significa sin filtro. */
interface TransferQuery {
  readonly direction: TransferDirection | '';
  readonly status: TransferStatus | '';
  readonly branchId: string;
  readonly search: string;
  readonly from: string;
  readonly to: string;
}

interface RawQuery {
  readonly direction?: RawValue;
  readonly status?: RawValue;
  readonly branchId?: RawValue;
  readonly search?: RawValue;
  readonly from?: RawValue;
  readonly to?: RawValue;
}

const EMPTY_QUERY: TransferQuery = { direction: '', status: '', branchId: '', search: '', from: '', to: '' };

function normalizeQuery(raw: RawQuery): TransferQuery {
  return {
    direction: pick(raw.direction, DIRECTIONS),
    status: pick(raw.status, TRANSFER_STATUSES),
    branchId: idOf(raw.branchId),
    search: String(raw.search ?? '').trim(),
    from: matching(raw.from, DAY_PATTERN),
    to: matching(raw.to, DAY_PATTERN),
  };
}

function toParams(query: TransferQuery): Params {
  return {
    direction: query.direction || null,
    status: query.status || null,
    branchId: query.branchId || null,
    search: query.search || null,
    from: query.from || null,
    to: query.to || null,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return {
    direction: params.get('direction'),
    status: params.get('status'),
    branchId: params.get('branchId'),
    search: params.get('search'),
    from: params.get('from'),
    to: params.get('to'),
  };
}

/**
 * Listado de transferencias entre sucursales. Los filtros viven en la URL y el servidor filtra y
 * pagina. Las transferencias entrantes en tránsito muestran el enlace para recibirlas. El botón de
 * nueva transferencia solo aparece con POST_INVENTORY_TRANSFERS.
 */
@Component({
  selector: 'app-transfers-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProblemAlertComponent,
    PaginationComponent,
    LocalDateTimePipe,
    TranslatePipe,
    IfPrivilegeDirective,
  ],
  templateUrl: './transfers-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersListComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly systemInfo = inject(SystemInfoService);
  protected readonly nodeBranch = inject(NodeBranchService);

  /** Solo la central ve todas las sucursales: el filtro de sucursal aparece allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly directions = DIRECTIONS;
  protected readonly statuses = TRANSFER_STATUSES;

  protected readonly filterForm = this.fb.group({
    direction: '' as TransferDirection | '',
    status: '' as TransferStatus | '',
    branchId: '',
    search: '',
    from: '',
    to: '',
  });

  protected readonly query = signal<TransferQuery>(EMPTY_QUERY);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly rangeInvalid = signal(false);

  protected readonly transfers = new PagedList<TransferView>((request) =>
    this.api.transfers({ ...request, sort: TRANSFER_SORT }, this.filters()),
  );

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.applyForm());

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.onParams(params));
  }

  ngOnInit(): void {
    if (this.isCentral()) {
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: (error: unknown) => this.lookupError.set(error),
      });
    }
  }

  /** Ruta actual, para que el detalle sepa a qué listado volver con sus filtros. */
  protected currentUrl(): string {
    return this.router.url;
  }

  /** Quita todos los filtros. */
  protected clearFilters(): void {
    this.navigateTo(EMPTY_QUERY);
  }

  /**
   * Una transferencia es entrante para esta tienda si llega a su sucursal. En la central no hay
   * sucursal fija: se usa el filtro de dirección.
   */
  protected isIncoming(transfer: TransferView): boolean {
    if (this.isCentral()) {
      return this.query().direction === 'INCOMING';
    }
    const ownBranchId = this.nodeBranch.ownBranchId();
    return ownBranchId !== null && transfer.destinationBranchId === ownBranchId;
  }

  private applyForm(): void {
    const raw = this.filterForm.getRawValue();
    this.navigateTo(normalizeQuery({ ...raw }));
  }

  private navigateTo(query: TransferQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió: se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    this.rangeInvalid.set(next.from !== '' && next.to !== '' && next.from > next.to);
    this.filterForm.patchValue(
      {
        direction: next.direction,
        status: next.status,
        branchId: next.branchId,
        search: next.search,
        from: next.from,
        to: next.to,
      },
      { emitEvent: false },
    );
    if (!this.rangeInvalid()) {
      this.transfers.restart();
    }
  }

  private filters(): TransferFilters {
    const q = this.query();
    return {
      direction: q.direction === '' ? null : q.direction,
      status: q.status === '' ? null : q.status,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
      search: q.search || null,
      from: q.from === '' ? null : startOfDay(q.from),
      to: q.to === '' ? null : endOfDay(q.to),
    };
  }

  protected statusClass(transfer: TransferView): string {
    return transferStatusClass(transfer.status);
  }
}
