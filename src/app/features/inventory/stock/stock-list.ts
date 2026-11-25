import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { CompanyApi } from '../../../core/api/company-api';
import { listAllPages } from '../../../core/api/page';
import { InventoryApi, InventoryItemView, StockFilters } from '../../../core/api/inventory-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { branchLabel } from '../../../shared/stores/branch-label';
import { formatQuantity } from '../shared/inventory-math';
import { RawValue, idOf, pick } from '../shared/inventory-query';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;

const SORT_FIELDS = ['productName', 'productSku', 'quantity', 'lastMovementAt'] as const;
type StockSortField = (typeof SORT_FIELDS)[number];
const SORTS: readonly string[] = SORT_FIELDS.flatMap((field) => [`${field},asc`, `${field},desc`]);
const DEFAULT_SORT = 'productName,asc';

/**
 * Filtros y orden del listado, tal como están en la URL. Todo es texto y "" significa sin filtro.
 */
interface StockQuery {
  readonly search: string;
  readonly categoryId: string;
  readonly branchId: string;
  readonly belowMin: boolean;
  readonly sort: string;
}

/** Valores sin validar: los de la URL o los del formulario. */
interface RawQuery {
  readonly search?: RawValue;
  readonly categoryId?: RawValue;
  readonly branchId?: RawValue;
  readonly belowMin?: RawValue;
  readonly sort?: RawValue;
}

const EMPTY_QUERY: StockQuery = {
  search: '',
  categoryId: '',
  branchId: '',
  belowMin: false,
  sort: DEFAULT_SORT,
};

/** Valida y normaliza los filtros. Lo que no es válido se descarta, así la URL siempre es correcta. */
function normalizeQuery(raw: RawQuery): StockQuery {
  return {
    search: String(raw.search ?? '').trim(),
    categoryId: idOf(raw.categoryId),
    branchId: idOf(raw.branchId),
    belowMin: raw.belowMin === 'true',
    sort: pick(raw.sort, SORTS) || DEFAULT_SORT,
  };
}

/** Parámetros de la URL: los vacíos, el falso y el orden por defecto no se escriben. */
function toParams(query: StockQuery): Params {
  return {
    search: query.search || null,
    categoryId: query.categoryId || null,
    branchId: query.branchId || null,
    belowMin: query.belowMin ? 'true' : null,
    sort: query.sort === DEFAULT_SORT ? null : query.sort,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return {
    search: params.get('search'),
    categoryId: params.get('categoryId'),
    branchId: params.get('branchId'),
    belowMin: params.get('belowMin'),
    sort: params.get('sort'),
  };
}

/**
 * Existencias por sucursal. Los filtros y el orden viven en la URL, así que el enlace se puede
 * guardar y los botones atrás y adelante los conservan. El servidor filtra, ordena y pagina; aquí
 * solo se arma la consulta. Cada producto abre su detalle con la bitácora.
 */
@Component({
  selector: 'app-stock-list',
  imports: [ReactiveFormsModule, RouterLink, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './stock-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockListComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central ve todas las sucursales: el filtro y la columna Sucursal aparecen allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly columnCount = computed(() => (this.isCentral() ? 7 : 6));

  /** Controles de los filtros. */
  protected readonly filterForm = this.fb.group({
    search: '',
    categoryId: '',
    branchId: '',
    belowMin: false,
  });

  /** Consulta vigente, la que pidió la URL. La tabla sale de aquí. */
  protected readonly query = signal<StockQuery>(EMPTY_QUERY);

  protected readonly stock = new PagedList<InventoryItemView>((request) =>
    this.api.stock({ ...request, sort: this.query().sort }, this.filters()),
  );

  protected readonly categories = signal<readonly CategoryView[]>([]);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly lookupError = signal<unknown>(null);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.navigateTo(this.formQuery()));

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.onParams(params));
  }

  ngOnInit(): void {
    listAllPages((request) => this.categoriesApi.list(request), 'name').subscribe({
      next: (categories) => this.categories.set(categories),
      error: (error: unknown) => this.lookupError.set(error),
    });
    if (this.isCentral()) {
      // Sin el privilegio de sucursales, el filtro queda en "Todas" y la columna muestra el id.
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: () => undefined,
      });
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected quantity(value: number): string {
    return formatQuantity(value);
  }

  /** Ruta actual, para que el detalle sepa a qué listado volver con sus filtros. */
  protected currentUrl(): string {
    return this.router.url;
  }

  /** Cambia el orden: una columna nueva empieza en ascendente; la misma alterna. */
  protected sortBy(field: StockSortField): void {
    const [current, direction] = this.query().sort.split(',');
    const next = current === field && direction === 'asc' ? 'desc' : 'asc';
    this.navigateTo({ ...this.query(), sort: `${field},${next}` });
  }

  protected sortAria(field: StockSortField): 'ascending' | 'descending' | 'none' {
    const [current, direction] = this.query().sort.split(',');
    if (current !== field) {
      return 'none';
    }
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortMark(field: StockSortField): string {
    const direction = this.sortAria(field);
    return direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '';
  }

  /** Quita todos los filtros; el orden se conserva. */
  protected clearFilters(): void {
    this.navigateTo({ ...EMPTY_QUERY, sort: this.query().sort });
  }

  /** Consulta armada con lo que hay en el formulario. */
  private formQuery(): StockQuery {
    const raw = this.filterForm.getRawValue();
    return normalizeQuery({
      search: raw.search,
      categoryId: raw.categoryId,
      branchId: raw.branchId,
      belowMin: raw.belowMin ? 'true' : null,
      sort: this.query().sort,
    });
  }

  private navigateTo(query: StockQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió (filtro, orden, atrás o adelante): se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    if (JSON.stringify(next) !== JSON.stringify(this.formQuery())) {
      this.filterForm.patchValue(
        { search: next.search, categoryId: next.categoryId, branchId: next.branchId, belowMin: next.belowMin },
        { emitEvent: false },
      );
    }
    this.stock.restart();
  }

  /** Filtros de la consulta a partir de la URL. Sin la central, la sucursal no aplica: el servidor ya la limita. */
  private filters(): StockFilters {
    const q = this.query();
    return {
      search: q.search || null,
      categoryId: q.categoryId !== '' ? Number(q.categoryId) : null,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
      belowMin: q.belowMin ? true : null,
    };
  }
}

