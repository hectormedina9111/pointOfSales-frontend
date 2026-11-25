import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CompanyApi } from '../../../core/api/company-api';
import { CustomerView, CustomersApi } from '../../../core/api/customers-api';
import { listAllPages } from '../../../core/api/page';
import {
  FINAL_CONSUMER_ID,
  OrderType,
  SaleFilters,
  SaleStatus,
  SaleSummaryView,
  SaleType,
  SalesApi,
} from '../../../core/api/sales-api';
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
import { saleStatusClass } from '../shared/sale-status';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;
/** Clientes que muestra la lista del filtro de cliente. */
const CUSTOMER_RESULTS_SIZE = 10;

const STATUSES: readonly SaleStatus[] = ['ON_HOLD', 'PAID', 'PARTIALLY_RETURNED', 'RETURNED'];
const ORDER_TYPES: readonly OrderType[] = ['CASH', 'CREDIT'];
const TYPES: readonly SaleType[] = ['SALE', 'RETURN'];
const SORTS: readonly string[] = ['createdAt,desc', 'createdAt,asc', 'total,desc', 'total,asc'];
const DEFAULT_SORT = 'createdAt,desc';

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^\d+$/;

/**
 * Filtros y orden del listado, tal como están en la URL. Todo es texto y "" significa sin filtro;
 * así la URL, el formulario y la consulta se comparan con la misma forma.
 */
interface OrderQuery {
  readonly search: string;
  readonly status: SaleStatus | '';
  readonly orderType: OrderType | '';
  readonly type: SaleType | '';
  readonly customerId: string;
  readonly cashierId: string;
  readonly branchId: string;
  readonly from: string;
  readonly to: string;
  readonly minTotal: string;
  readonly maxTotal: string;
  readonly sort: string;
}

/** Valores sin validar, de la URL o del formulario. */
type RawQuery = Partial<Record<keyof OrderQuery, string | number | null | undefined>>;

const QUERY_KEYS: readonly (keyof OrderQuery)[] = [
  'search',
  'status',
  'orderType',
  'type',
  'customerId',
  'cashierId',
  'branchId',
  'from',
  'to',
  'minTotal',
  'maxTotal',
  'sort',
];

const EMPTY_QUERY: OrderQuery = {
  search: '',
  status: '',
  orderType: '',
  type: '',
  customerId: '',
  cashierId: '',
  branchId: '',
  from: '',
  to: '',
  minTotal: '',
  maxTotal: '',
  sort: DEFAULT_SORT,
};

/** Devuelve el valor si está en la lista de opciones; si no, "". */
function pick<T extends string>(value: string | number | null | undefined, options: readonly T[]): T | '' {
  return options.find((option) => option === value) ?? '';
}

/** Devuelve el texto si cumple el formato; si no, "". */
function matching(value: string | number | null | undefined, pattern: RegExp): string {
  const text = String(value ?? '').trim();
  return pattern.test(text) ? text : '';
}

/** Un id positivo sin ceros de más; si no es un id válido, "". */
function idOf(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  return ID_PATTERN.test(text) && Number(text) > 0 ? String(Number(text)) : '';
}

/** Valida y normaliza los filtros. Lo que no es válido se descarta, así la URL siempre es correcta. */
function normalizeQuery(raw: RawQuery): OrderQuery {
  return {
    search: String(raw.search ?? '').trim(),
    status: pick(raw.status, STATUSES),
    orderType: pick(raw.orderType, ORDER_TYPES),
    type: pick(raw.type, TYPES),
    customerId: idOf(raw.customerId),
    cashierId: idOf(raw.cashierId),
    branchId: idOf(raw.branchId),
    from: matching(raw.from, DAY_PATTERN),
    to: matching(raw.to, DAY_PATTERN),
    minTotal: matching(raw.minTotal, AMOUNT_PATTERN),
    maxTotal: matching(raw.maxTotal, AMOUNT_PATTERN),
    sort: pick(raw.sort, SORTS) || DEFAULT_SORT,
  };
}

/** Parámetros de la URL: los vacíos y el orden por defecto no se escriben. */
function toParams(query: OrderQuery): Params {
  return {
    search: query.search || null,
    status: query.status || null,
    orderType: query.orderType || null,
    type: query.type || null,
    customerId: query.customerId || null,
    cashierId: query.cashierId || null,
    branchId: query.branchId || null,
    from: query.from || null,
    to: query.to || null,
    minTotal: query.minTotal || null,
    maxTotal: query.maxTotal || null,
    sort: query.sort === DEFAULT_SORT ? null : query.sort,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return Object.fromEntries(QUERY_KEYS.map((key) => [key, params.get(key)])) as RawQuery;
}

/** Un monto escrito a mano: vacío o con hasta dos decimales. */
function isAmountText(value: string): boolean {
  const text = value.trim();
  return text === '' || AMOUNT_PATTERN.test(text);
}

/**
 * Listado de órdenes (ventas en espera y cobradas). Los filtros y el orden viven en la URL, así
 * que el enlace se puede guardar y los botones atrás y adelante los conservan. El servidor filtra,
 * ordena y pagina; aquí solo se arma la consulta. Cada número abre la pantalla de detalle.
 */
@Component({
  selector: 'app-sales-list',
  imports: [ReactiveFormsModule, RouterLink, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './sales-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesListComponent implements OnInit {
  private readonly api = inject(SalesApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly usersApi = inject(UsersApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly privileges = inject(PrivilegesService);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central ve todas las sucursales: el filtro y la columna Sucursal aparecen allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  /** Sin ACTION_SALES_VIEW_ALL el servidor muestra solo las ventas del usuario: el filtro de cajero no aparece. */
  protected readonly canViewAll = computed(() => this.privileges.has('ACTION_SALES_VIEW_ALL'));
  protected readonly columnCount = computed(() => (this.isCentral() ? 8 : 7));
  protected readonly finalConsumerId = FINAL_CONSUMER_ID;
  protected readonly statuses = STATUSES;
  protected readonly orderTypes = ORDER_TYPES;
  protected readonly types = TYPES;
  protected readonly statusClass = saleStatusClass;

  /** Controles de los filtros de texto y de lista. El cliente va aparte, en customerSearch y customer. */
  protected readonly filterForm = this.fb.group({
    search: '',
    status: this.fb.control<SaleStatus | ''>(''),
    orderType: this.fb.control<OrderType | ''>(''),
    type: this.fb.control<SaleType | ''>(''),
    cashierId: '',
    branchId: '',
    from: '',
    to: '',
    minTotal: '',
    maxTotal: '',
  });

  /** Consulta vigente, la que pidió la URL. La tabla y los avisos salen de aquí. */
  protected readonly query = signal<OrderQuery>(EMPTY_QUERY);
  /** Cliente elegido para el filtro; null si no hay filtro de cliente. */
  protected readonly customer = signal<{ readonly id: number; readonly name: string } | null>(null);
  /** Un monto escrito que no es válido: no se consulta hasta corregirlo. */
  protected readonly amountTextInvalid = signal(false);

  protected readonly customerSearch = new FormControl('', { nonNullable: true });
  protected readonly customerResults = signal<readonly CustomerView[]>([]);
  protected readonly customerQuery = signal('');
  protected readonly customerSearching = signal(false);
  protected readonly customerError = signal<unknown>(null);

  protected readonly rangeInvalid = computed(() => {
    const q = this.query();
    return q.from !== '' && q.to !== '' && q.from > q.to;
  });
  protected readonly amountRangeInvalid = computed(() => {
    const q = this.query();
    return q.minTotal !== '' && q.maxTotal !== '' && Number(q.minTotal) > Number(q.maxTotal);
  });

  protected readonly sales = new PagedList<SaleSummaryView>((request) =>
    this.api.list({ ...request, sort: this.query().sort }, this.filters()),
  );

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly users = signal<readonly UserView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly lookupError = signal<unknown>(null);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );
  private readonly userMap = computed(() => new Map(this.users().map((user) => [user.id, user] as const)));

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.applyForm());

    this.customerSearch.valueChanges
      .pipe(
        debounceTime(FILTER_DEBOUNCE_MS),
        map((text) => text.trim()),
        distinctUntilChanged(),
        switchMap((text) => this.searchCustomers(text)),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.onParams(params));
  }

  ngOnInit(): void {
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

  protected cashierLabel(userId: number): string {
    return this.userMap().get(userId)?.username ?? `#${userId}`;
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  /** Ruta actual, para que el detalle sepa a qué listado volver con sus filtros. */
  protected currentUrl(): string {
    return this.router.url;
  }

  protected chooseCustomer(customer: CustomerView): void {
    this.customer.set({ id: customer.id, name: customer.displayName });
    this.customerResults.set([]);
    this.customerQuery.set('');
    this.customerSearch.setValue('');
    this.navigateTo(this.formQuery());
  }

  protected clearCustomer(): void {
    this.customer.set(null);
    this.navigateTo(this.formQuery());
  }

  /** Cambia el orden: una columna nueva empieza en descendente; la misma alterna. */
  protected sortBy(field: 'createdAt' | 'total'): void {
    const [current, direction] = this.query().sort.split(',');
    const next = current === field && direction === 'desc' ? 'asc' : 'desc';
    this.navigateTo(this.formQuery(`${field},${next}`));
  }

  protected sortAria(field: 'createdAt' | 'total'): 'ascending' | 'descending' | 'none' {
    const [current, direction] = this.query().sort.split(',');
    if (current !== field) {
      return 'none';
    }
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortMark(field: 'createdAt' | 'total'): string {
    const direction = this.sortAria(field);
    return direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '';
  }

  /** Quita todos los filtros; el orden se conserva. */
  protected clearFilters(): void {
    this.customer.set(null);
    this.customerSearch.setValue('');
    this.navigateTo({ ...EMPTY_QUERY, sort: this.query().sort });
  }

  /** Los filtros del formulario cambiaron: se escriben en la URL, salvo que haya un monto inválido. */
  private applyForm(): void {
    const raw = this.filterForm.getRawValue();
    const amountsValid = isAmountText(raw.minTotal) && isAmountText(raw.maxTotal);
    this.amountTextInvalid.set(!amountsValid);
    if (amountsValid) {
      this.navigateTo(this.formQuery());
    }
  }

  /** Consulta armada con lo que hay en el formulario y el cliente elegido. */
  private formQuery(sort: string = this.query().sort): OrderQuery {
    return normalizeQuery({
      ...this.filterForm.getRawValue(),
      customerId: this.customer()?.id ?? null,
      sort,
    });
  }

  private navigateTo(query: OrderQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió (filtro, orden, atrás o adelante): se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    this.syncCustomer(next.customerId);
    if (JSON.stringify(next) !== JSON.stringify(this.formQuery())) {
      this.patchForm(next);
    }
    if (!this.rangeInvalid() && !this.amountRangeInvalid()) {
      this.sales.restart();
    }
  }

  private patchForm(query: OrderQuery): void {
    this.filterForm.patchValue(
      {
        search: query.search,
        status: query.status,
        orderType: query.orderType,
        type: query.type,
        cashierId: query.cashierId,
        branchId: query.branchId,
        from: query.from,
        to: query.to,
        minTotal: query.minTotal,
        maxTotal: query.maxTotal,
      },
      { emitEvent: false },
    );
    this.amountTextInvalid.set(false);
  }

  /** Muestra el nombre del cliente de la URL; si llega por un enlace, lo pide al servidor. */
  private syncCustomer(customerId: string): void {
    const current = this.customer();
    if (customerId === '') {
      if (current !== null) {
        this.customer.set(null);
      }
      return;
    }
    const id = Number(customerId);
    if (current?.id === id) {
      return;
    }
    this.customersApi.get(id).subscribe({
      next: (customer) => this.customer.set({ id, name: customer.displayName }),
      error: () => this.customer.set({ id, name: `#${id}` }),
    });
  }

  private searchCustomers(text: string): Observable<unknown> {
    if (text === '') {
      this.customerResults.set([]);
      this.customerQuery.set('');
      this.customerError.set(null);
      return EMPTY;
    }
    this.customerSearching.set(true);
    this.customerError.set(null);
    // Incluye clientes inactivos: sus ventas antiguas también deben poder filtrarse.
    return this.customersApi.list({ page: 0, size: CUSTOMER_RESULTS_SIZE }, { search: text, active: null }).pipe(
      tap((page) => {
        this.customerSearching.set(false);
        this.customerQuery.set(text);
        this.customerResults.set(page.content);
      }),
      catchError((error: unknown) => {
        this.customerSearching.set(false);
        this.customerError.set(error);
        return EMPTY;
      }),
    );
  }

  /** Filtros de la consulta a partir de la URL. Sin ACTION_SALES_VIEW_ALL o sin la central, algunos no aplican. */
  private filters(): SaleFilters {
    const q = this.query();
    return {
      status: q.status || null,
      cashSessionId: null,
      cashierId: this.canViewAll() && q.cashierId !== '' ? Number(q.cashierId) : null,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
      customerId: q.customerId !== '' ? Number(q.customerId) : null,
      orderType: q.orderType || null,
      type: q.type || null,
      search: q.search || null,
      from: q.from === '' ? null : startOfDay(q.from),
      to: q.to === '' ? null : endOfDay(q.to),
      minTotal: q.minTotal || null,
      maxTotal: q.maxTotal || null,
    };
  }
}
