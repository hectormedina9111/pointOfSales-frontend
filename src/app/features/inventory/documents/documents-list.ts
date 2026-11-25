import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import {
  InventoryApi,
  InventoryDocumentFilters,
  InventoryDocumentType,
  InventoryDocumentView,
} from '../../../core/api/inventory-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { endOfDay, startOfDay } from '../../../shared/time/day-range';
import { DAY_PATTERN, RawValue, idOf, matching, pick } from '../shared/inventory-query';

/** Pausa tras teclear o cambiar un filtro antes de consultar, en milisegundos. */
const FILTER_DEBOUNCE_MS = 300;
/** Orden fijo: el documento más reciente primero. */
const DOCUMENT_SORT = 'postedAt,desc';
const DOCUMENT_TYPES: readonly InventoryDocumentType[] = ['ENTRY', 'EXIT', 'ADJUSTMENT'];

/** Filtros del listado tal como están en la URL. "" significa sin filtro. */
interface DocumentQuery {
  readonly search: string;
  readonly type: InventoryDocumentType | '';
  readonly branchId: string;
  readonly from: string;
  readonly to: string;
}

interface RawQuery {
  readonly search?: RawValue;
  readonly type?: RawValue;
  readonly branchId?: RawValue;
  readonly from?: RawValue;
  readonly to?: RawValue;
}

const EMPTY_QUERY: DocumentQuery = { search: '', type: '', branchId: '', from: '', to: '' };

function normalizeQuery(raw: RawQuery): DocumentQuery {
  return {
    search: String(raw.search ?? '').trim(),
    type: pick(raw.type, DOCUMENT_TYPES),
    branchId: idOf(raw.branchId),
    from: matching(raw.from, DAY_PATTERN),
    to: matching(raw.to, DAY_PATTERN),
  };
}

function toParams(query: DocumentQuery): Params {
  return {
    search: query.search || null,
    type: query.type || null,
    branchId: query.branchId || null,
    from: query.from || null,
    to: query.to || null,
  };
}

function rawFromParams(params: ParamMap): RawQuery {
  return {
    search: params.get('search'),
    type: params.get('type'),
    branchId: params.get('branchId'),
    from: params.get('from'),
    to: params.get('to'),
  };
}

/**
 * Listado de documentos de inventario (entradas, salidas y ajustes). Los filtros viven en la URL y
 * el servidor filtra y pagina. Cada número abre el detalle. El botón de nuevo documento solo aparece
 * con POST_INVENTORY_DOCUMENTS.
 */
@Component({
  selector: 'app-documents-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProblemAlertComponent,
    PaginationComponent,
    LocalDateTimePipe,
    TranslatePipe,
    IfPrivilegeDirective,
  ],
  templateUrl: './documents-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsListComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central ve todas las sucursales: el filtro y la columna Sucursal aparecen allí. */
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly types = DOCUMENT_TYPES;

  protected readonly filterForm = this.fb.group({
    search: '',
    type: '' as InventoryDocumentType | '',
    branchId: '',
    from: '',
    to: '',
  });

  protected readonly query = signal<DocumentQuery>(EMPTY_QUERY);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly lookupError = signal<unknown>(null);

  protected readonly documents = new PagedList<InventoryDocumentView>((request) =>
    this.api.documents({ ...request, sort: DOCUMENT_SORT }, this.filters()),
  );

  protected readonly rangeInvalid = signal(false);

  constructor() {
    this.filterForm.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.applyForm());

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.onParams(params));
  }

  ngOnInit(): void {
    if (this.isCentral()) {
      // Sin el privilegio de sucursales, el filtro queda en "Todas" y la columna muestra el id.
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

  private applyForm(): void {
    const raw = this.filterForm.getRawValue();
    this.navigateTo(normalizeQuery({ ...raw }));
  }

  private navigateTo(query: DocumentQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toParams(query) });
  }

  /** La URL cambió: se actualiza el formulario y se consulta la primera página. */
  private onParams(params: ParamMap): void {
    const next = normalizeQuery(rawFromParams(params));
    this.query.set(next);
    this.rangeInvalid.set(next.from !== '' && next.to !== '' && next.from > next.to);
    this.filterForm.patchValue(
      { search: next.search, type: next.type, branchId: next.branchId, from: next.from, to: next.to },
      { emitEvent: false },
    );
    if (!this.rangeInvalid()) {
      this.documents.restart();
    }
  }

  private filters(): InventoryDocumentFilters {
    const q = this.query();
    return {
      search: q.search || null,
      type: q.type === '' ? null : q.type,
      branchId: this.isCentral() && q.branchId !== '' ? Number(q.branchId) : null,
      from: q.from === '' ? null : startOfDay(q.from),
      to: q.to === '' ? null : endOfDay(q.to),
    };
  }
}
