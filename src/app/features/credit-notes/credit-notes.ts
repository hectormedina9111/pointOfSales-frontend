import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs';

import { BranchView, BranchesApi } from '../../core/api/branches-api';
import { CompanyApi } from '../../core/api/company-api';
import { CreditNoteFilters, CreditNoteStatus, CreditNoteView, CreditNotesApi } from '../../core/api/credit-notes-api';
import { CustomerView, CustomersApi } from '../../core/api/customers-api';
import { listAllPages } from '../../core/api/page';
import { LanguageService } from '../../core/i18n/language.service';
import { SystemInfoService } from '../../core/system/system-info.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../shared/forms/amounts';
import { PagedList } from '../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { endOfDay, startOfDay } from '../../shared/time/day-range';
import { branchLabel } from '../../shared/stores/branch-label';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;
/** Clientes que muestra la lista del filtro de cliente. */
const CUSTOMER_RESULTS_SIZE = 10;
/** Las notas más recientes primero; el orden no es configurable en esta pantalla. */
const SORT = 'issuedAt,desc';

const STATUSES: readonly CreditNoteStatus[] = ['ACTIVE', 'USED'];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^\d+$/;

/**
 * Filtros de la lista tal como están en la URL. Todo es texto y "" significa sin filtro; así la URL,
 * el formulario y la consulta se comparan con la misma forma.
 */
interface CreditNoteQuery {
  readonly search: string;
  readonly status: CreditNoteStatus | '';
  readonly customerId: string;
  readonly branchId: string;
  readonly from: string;
  readonly to: string;
}

type RawQuery = Partial<Record<keyof CreditNoteQuery, string | number | null | undefined>>;

const QUERY_KEYS: readonly (keyof CreditNoteQuery)[] = ['search', 'status', 'customerId', 'branchId', 'from', 'to'];

const EMPTY_QUERY: CreditNoteQuery = {
  search: '',
  status: '',
  customerId: '',
  branchId: '',
  from: '',
  to: '',
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

/** Valida y normaliza los filtros; lo que no es válido se descarta. */
function normalizeQuery(raw: RawQuery): CreditNoteQuery {
  return {
    search: String(raw.search ?? '').trim(),
    status: pick(raw.status, STATUSES),
    customerId: idOf(raw.customerId),
    branchId: idOf(raw.branchId),
    from: matching(raw.from, DAY_PATTERN),
    to: matching(raw.to, DAY_PATTERN),
  };
}

/** Parámetros de la URL: los filtros vacíos no se escriben. */
function toParams(query: CreditNoteQuery): Params {
  return {
    search: query.search || null,
    status: query.status || null,
    customerId: query.customerId || null,
    branchId: query.branchId || null,
    from: query.from || null,
    to: query.to || null,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return Object.fromEntries(QUERY_KEYS.map((key) => [key, params.get(key)])) as RawQuery;
}

/**
 * Listado de notas de crédito. Los filtros viven en la URL y el servidor filtra y pagina; aquí solo
 * se arma la consulta. Cada número abre el detalle. En la central aparece el filtro de sucursal.
 */
@Component({
  selector: 'app-credit-notes',
  imports: [ReactiveFormsModule, RouterLink, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './credit-notes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditNotesComponent implements OnInit {
  private readonly api = inject(CreditNotesApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central ve todas las sucursales: el filtro y la columna Sucursal aparecen allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly columnCount = computed(() => (this.isCentral() ? 8 : 7));
  protected readonly statuses = STATUSES;

  /** Controles de los filtros de texto y de lista. El cliente va aparte, en customerSearch y customer. */
  protected readonly filterForm = this.fb.group({
    search: '',
    status: this.fb.control<CreditNoteStatus | ''>(''),
    branchId: '',
    from: '',
    to: '',
  });

  protected readonly query = signal<CreditNoteQuery>(EMPTY_QUERY);
  protected readonly customer = signal<{ readonly id: number; readonly name: string } | null>(null);

  protected readonly customerSearch = new FormControl('', { nonNullable: true });
  protected readonly customerResults = signal<readonly CustomerView[]>([]);
  protected readonly customerQuery = signal('');
  protected readonly customerSearching = signal(false);
  protected readonly customerError = signal<unknown>(null);

  protected readonly rangeInvalid = computed(() => {
    const q = this.query();
    return q.from !== '' && q.to !== '' && q.from > q.to;
  });

  protected readonly notes = new PagedList<CreditNoteView>((request) => this.api.list(request, this.filters()), SORT);

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly lookupError = signal<unknown>(null);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );

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
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
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

  protected statusClass(status: CreditNoteStatus): string {
    return status === 'ACTIVE' ? 'badge text-bg-success' : 'badge text-bg-secondary';
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

  /** Quita todos los filtros. */
  protected clearFilters(): void {
    this.customer.set(null);
    this.customerSearch.setValue('');
    this.navigateTo(EMPTY_QUERY);
  }

  /** Los filtros del formulario cambiaron: se escriben en la URL. */
  private applyForm(): void {
    this.navigateTo(this.formQuery());
  }

  /** Consulta armada con lo que hay en el formulario y el cliente elegido. */
  private formQuery(): CreditNoteQuery {
    return normalizeQuery({
      ...this.filterForm.getRawValue(),
      customerId: this.customer()?.id ?? null,
    });
  }

  private navigateTo(query: CreditNoteQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió (filtro, atrás o adelante): se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    this.syncCustomer(next.customerId);
    if (JSON.stringify(next) !== JSON.stringify(this.formQuery())) {
      this.patchForm(next);
    }
    if (!this.rangeInvalid()) {
      this.notes.restart();
    }
  }

  private patchForm(query: CreditNoteQuery): void {
    this.filterForm.patchValue(
      {
        search: query.search,
        status: query.status,
        branchId: query.branchId,
        from: query.from,
        to: query.to,
      },
      { emitEvent: false },
    );
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
    // Incluye clientes inactivos: sus notas antiguas también deben poder filtrarse.
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

  /** Filtros de la consulta a partir de la URL. El filtro de sucursal solo aplica en la central. */
  private filters(): CreditNoteFilters {
    const q = this.query();
    return {
      customerId: q.customerId !== '' ? Number(q.customerId) : null,
      status: q.status || null,
      search: q.search || null,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
      from: q.from === '' ? null : startOfDay(q.from),
      to: q.to === '' ? null : endOfDay(q.to),
    };
  }
}
