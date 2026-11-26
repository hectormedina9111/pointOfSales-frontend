import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { EquipmentApi, EquipmentFilters, EquipmentView } from '../../../core/api/equipment-api';
import { listAllPages } from '../../../core/api/page';
import { ProductView, ProductsApi } from '../../../core/api/products-api';
import { SerialSearchView, SerialStatus, SerialsApi } from '../../../core/api/serials-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { branchLabel } from '../../../shared/stores/branch-label';
import { RawValue, idOf, pick } from '../shared/inventory-query';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;

/** Orden fijo del listado: por número de serie. */
const SORT = 'serialNumber,asc';

const STATUSES: readonly SerialStatus[] = ['AVAILABLE', 'SOLD', 'IN_TRANSIT', 'REMOVED'];

/** Clase del badge de cada estado del equipo. */
const STATUS_CLASS: Readonly<Record<SerialStatus, string>> = {
  AVAILABLE: 'text-bg-success',
  SOLD: 'text-bg-secondary',
  IN_TRANSIT: 'text-bg-info',
  REMOVED: 'text-bg-dark',
};

/**
 * Filtros del listado tal como están en la URL. Todo es texto y "" significa sin filtro. La búsqueda sirve
 * para número de serie o código externo.
 */
interface EquipmentQuery {
  readonly search: string;
  readonly productId: string;
  readonly categoryId: string;
  readonly status: SerialStatus | '';
  readonly branchId: string;
}

interface RawQuery {
  readonly search?: RawValue;
  readonly productId?: RawValue;
  readonly categoryId?: RawValue;
  readonly status?: RawValue;
  readonly branchId?: RawValue;
}

const EMPTY_QUERY: EquipmentQuery = { search: '', productId: '', categoryId: '', status: '', branchId: '' };

function normalizeQuery(raw: RawQuery): EquipmentQuery {
  return {
    search: String(raw.search ?? '').trim(),
    productId: idOf(raw.productId),
    categoryId: idOf(raw.categoryId),
    status: pick(raw.status, STATUSES),
    branchId: idOf(raw.branchId),
  };
}

/** Parámetros de la URL: los filtros vacíos no se escriben. */
function toParams(query: EquipmentQuery): Params {
  return {
    search: query.search || null,
    productId: query.productId || null,
    categoryId: query.categoryId || null,
    status: query.status || null,
    branchId: query.branchId || null,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return {
    search: params.get('search'),
    productId: params.get('productId'),
    categoryId: params.get('categoryId'),
    status: params.get('status'),
    branchId: params.get('branchId'),
  };
}

/**
 * Listado de equipos: unidades con número de serie, con su código externo, producto, estado, sucursal y fecha
 * de recepción. Los filtros viven en la URL y el servidor filtra y pagina. Cada equipo abre su detalle. Solo
 * la central ve todas las sucursales: el filtro de sucursal aparece allí.
 */
@Component({
  selector: 'app-equipment-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FieldLabelComponent,
    PaginationComponent,
    ProblemAlertComponent,
    ProductPickerComponent,
    IfPrivilegeDirective,
    LocalDateTimePipe,
    TranslatePipe,
  ],
  templateUrl: './equipment-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentListComponent implements OnInit {
  private readonly api = inject(EquipmentApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly products = inject(ProductsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly systemInfo = inject(SystemInfoService);
  private readonly serials = inject(SerialsApi);

  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly statuses = STATUSES;

  /** Controles de los filtros de texto y de lista. El producto se elige aparte, con su selector. */
  protected readonly filterForm = this.fb.group({
    search: '',
    categoryId: '',
    status: '' as SerialStatus | '',
    branchId: '',
  });

  /** Consulta vigente, la que pidió la URL. La tabla sale de aquí. */
  protected readonly query = signal<EquipmentQuery>(EMPTY_QUERY);
  protected readonly selectedProduct = signal<ProductView | null>(null);

  protected readonly equipment = new PagedList<EquipmentView>((request) =>
    this.api.list({ ...request, sort: SORT }, this.filters()),
  );

  protected readonly categories = signal<readonly CategoryView[]>([]);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly lookupError = signal<unknown>(null);
  /** Series manuales vendidas que coinciden con la búsqueda (las de equipo ya están en la tabla). */
  protected readonly manualSales = signal<readonly SerialSearchView[]>([]);
  protected readonly manualSalesError = signal<unknown>(null);
  private readonly manualSearch = new Subject<string>();

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.navigateTo(this.formQuery()));

    // Antes que la ruta: los parámetros iniciales emiten de inmediato y disparan la búsqueda de series.
    this.manualSearch
      .pipe(
        switchMap((text) => this.findManualSales(text)),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => this.manualSales.set(rows));

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
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected statusClass(status: SerialStatus): string {
    return STATUS_CLASS[status];
  }

  /** Ruta actual, para que el detalle sepa a qué listado volver con sus filtros. */
  protected currentUrl(): string {
    return this.router.url;
  }

  protected selectProduct(product: ProductView): void {
    this.navigateTo({ ...this.query(), productId: String(product.id) });
  }

  protected clearProduct(): void {
    this.navigateTo({ ...this.query(), productId: '' });
  }

  /** Quita todos los filtros. */
  protected clearFilters(): void {
    this.navigateTo(EMPTY_QUERY);
  }

  /** Consulta armada con lo que hay en el formulario y el producto que ya estaba en la URL. */
  private formQuery(): EquipmentQuery {
    const raw = this.filterForm.getRawValue();
    return normalizeQuery({
      search: raw.search,
      productId: this.query().productId,
      categoryId: raw.categoryId,
      status: raw.status,
      branchId: raw.branchId,
    });
  }

  private navigateTo(query: EquipmentQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió (filtro, atrás o adelante): se actualizan los controles y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    if (JSON.stringify(next) !== JSON.stringify(this.formQuery())) {
      this.filterForm.patchValue(
        { search: next.search, categoryId: next.categoryId, status: next.status, branchId: next.branchId },
        { emitEvent: false },
      );
    }
    this.loadSelectedProduct(next.productId);
    this.manualSearch.next(next.search);
    this.equipment.restart();
  }

  /**
   * Busca el número en la búsqueda de seriales y deja solo las series manuales (SALE): se muestran con
   * su venta. Un error se muestra aparte y la tabla de equipos sigue igual.
   */
  private findManualSales(text: string): Observable<readonly SerialSearchView[]> {
    this.manualSalesError.set(null);
    if (text === '') {
      return of([]);
    }
    return this.serials.searchBySerial(text).pipe(
      map((rows) => rows.filter((row) => row.source === 'SALE')),
      catchError((error: unknown) => {
        this.manualSalesError.set(error);
        return of([]);
      }),
    );
  }

  /** Nombra el producto del filtro. Un id que no existe deja el filtro sin nombre y avisa. */
  private loadSelectedProduct(productId: string): void {
    if (productId === '') {
      this.selectedProduct.set(null);
      return;
    }
    if (this.selectedProduct()?.id === Number(productId)) {
      return;
    }
    this.products.get(Number(productId)).subscribe({
      next: (product) => this.selectedProduct.set(product),
      error: (error: unknown) => this.lookupError.set(error),
    });
  }

  private filters(): EquipmentFilters {
    const q = this.query();
    return {
      search: q.search || null,
      productId: q.productId !== '' ? Number(q.productId) : null,
      categoryId: q.categoryId !== '' ? Number(q.categoryId) : null,
      status: q.status === '' ? null : q.status,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
    };
  }
}
