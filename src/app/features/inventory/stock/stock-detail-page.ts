import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { CompanyApi } from '../../../core/api/company-api';
import {
  InventoryApi,
  InventoryItemView,
  MovementFilters,
  MovementType,
  MovementView,
} from '../../../core/api/inventory-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { endOfDay, startOfDay } from '../../../shared/time/day-range';
import { formatQuantity } from '../shared/inventory-math';
import { movementReferenceLink } from '../shared/movement-link';
import { DAY_PATTERN, RawValue, matching, pick } from '../shared/inventory-query';

/** Pausa tras cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;
/** Orden fijo de la bitácora: lo más reciente primero. */
const MOVEMENT_SORT = 'movedAt,desc';
/** Destino del botón "Volver": el listado de existencias con los filtros con que llegó el usuario. */
const LIST_URL = /^\/inventory\/stock(\?|$)/;

const MOVEMENT_TYPES: readonly MovementType[] = [
  'ENTRY',
  'EXIT',
  'ADJUSTMENT',
  'SALE_OUT',
  'RETURN_IN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
];

/** Filtros de la bitácora tal como están en la URL. "" significa sin filtro. */
interface MovementQuery {
  readonly type: MovementType | '';
  readonly from: string;
  readonly to: string;
}

interface RawQuery {
  readonly type?: RawValue;
  readonly from?: RawValue;
  readonly to?: RawValue;
}

function normalizeQuery(raw: RawQuery): MovementQuery {
  return {
    type: pick(raw.type, MOVEMENT_TYPES),
    from: matching(raw.from, DAY_PATTERN),
    to: matching(raw.to, DAY_PATTERN),
  };
}

function toParams(query: MovementQuery): Params {
  return {
    type: query.type || null,
    from: query.from || null,
    to: query.to || null,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return { type: params.get('type'), from: params.get('from'), to: params.get('to') };
}

/** Número de id de la ruta, o null si no es un id válido. */
function routeId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Detalle de un producto en una sucursal: su existencia, costo promedio y bitácora de movimientos.
 * La bitácora se filtra por tipo y fechas en la URL y se pagina en el servidor. Cada movimiento
 * enlaza a su origen (documento de inventario o venta) cuando lo tiene.
 */
@Component({
  selector: 'app-stock-detail-page',
  imports: [ReactiveFormsModule, RouterLink, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './stock-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly language = inject(LanguageService);

  protected readonly movementTypes = MOVEMENT_TYPES;
  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly item = signal<InventoryItemView | null>(null);
  protected readonly currency = signal<string | null>(null);
  protected readonly query = signal<MovementQuery>({ type: '', from: '', to: '' });
  protected readonly backUrl = this.listUrlFromState();

  protected readonly filterForm = this.fb.group({
    type: '' as MovementType | '',
    from: '',
    to: '',
  });

  private readonly productId: number | null = routeId(this.route.snapshot.paramMap.get('productId'));
  private readonly branchId: number | null = routeId(this.route.snapshot.paramMap.get('branchId'));

  protected readonly movements = new PagedList<MovementView>((request) =>
    this.api.movements({ ...request, sort: MOVEMENT_SORT }, this.filters()),
  );

  protected readonly rangeInvalid = computed(() => {
    const q = this.query();
    return q.from !== '' && q.to !== '' && q.from > q.to;
  });

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.applyForm());

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.onParams(params));
  }

  ngOnInit(): void {
    if (this.productId === null || this.branchId === null) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
    this.api.item(this.productId, this.branchId).subscribe({
      next: (item) => {
        this.item.set(item);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected quantity(value: number): string {
    return formatQuantity(value);
  }

  /** Ruta del origen del movimiento, o null si no tiene pantalla. */
  protected referenceLink(movement: MovementView): readonly string[] | null {
    return movementReferenceLink(movement.referenceType, movement.referenceId);
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  /** Los filtros del formulario cambiaron: se escriben en la URL. */
  private applyForm(): void {
    const raw = this.filterForm.getRawValue();
    this.navigateTo(normalizeQuery({ type: raw.type, from: raw.from, to: raw.to }));
  }

  private navigateTo(query: MovementQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió: se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    this.filterForm.patchValue({ type: next.type, from: next.from, to: next.to }, { emitEvent: false });
    if (this.productId !== null && this.branchId !== null && !this.rangeInvalid()) {
      this.movements.restart();
    }
  }

  private filters(): MovementFilters {
    const q = this.query();
    return {
      productId: this.productId,
      branchId: this.branchId,
      type: q.type === '' ? null : q.type,
      from: q.from === '' ? null : startOfDay(q.from),
      to: q.to === '' ? null : endOfDay(q.to),
    };
  }

  /** Vuelve al listado de existencias con los filtros con que llegó el usuario, o al listado sin ellos. */
  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/inventory/stock';
  }
}
