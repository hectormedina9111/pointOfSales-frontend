import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { AuditApi, AuditLogFilter, AuditLogView } from '../../core/api/audit-api';
import { TranslationService } from '../../core/i18n/translation.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { PagedList } from '../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ChangeView, changeView } from './audit-changes';

/** Entidades que registra la auditoría; cada una tiene su texto en "audit.entity.<nombre>". */
export const AUDIT_ENTITIES: readonly string[] = [
  'product',
  'price_list',
  'price_list_item',
  'branch',
  'country',
  'company',
  'app_user',
  'role',
  'tax',
  'category',
  'unit_of_measure',
  'store_node',
];

const NO_FILTER: AuditLogFilter = { entity: null, entityId: null, from: null, to: null };

/**
 * Auditoría (ruta audit): listado paginado, del más reciente al más antiguo, con filtros por
 * entidad, id y fechas. Cada fila se puede abrir para ver los valores antes y después.
 * Las fechas del formulario son hora local; se envían en UTC.
 */
@Component({
  selector: 'app-audit-log',
  imports: [ReactiveFormsModule, TranslatePipe, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe],
  templateUrl: './audit-log.html',
  styles: `
    .audit-json {
      white-space: pre;
      overflow-x: auto;
      font-size: 0.8rem;
      max-height: 24rem;
    }

    .audit-changed {
      background-color: var(--bs-warning-bg-subtle);
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit {
  private readonly api = inject(AuditApi);
  private readonly translation = inject(TranslationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly entities = AUDIT_ENTITIES;
  protected readonly form = this.fb.group({
    entity: this.fb.control(''),
    entityId: this.fb.control(''),
    from: this.fb.control(''),
    to: this.fb.control(''),
  });

  /** Filtros aplicados: solo cambian al pulsar Buscar, así el formulario puede editarse sin recargar. */
  private readonly applied = signal<AuditLogFilter>(NO_FILTER);
  protected readonly filterError = signal<string | null>(null);
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly entries = new PagedList<AuditLogView>(
    (request) => this.api.list(this.applied(), request),
    'occurredAt,desc',
  );

  ngOnInit(): void {
    this.entries.load();
  }

  protected search(): void {
    const value = this.form.getRawValue();
    const entityId = value.entityId.trim();
    if (entityId !== '' && !/^[1-9]\d*$/.test(entityId)) {
      this.filterError.set('audit.error.entityId');
      return;
    }
    const from = parseLocalDate(value.from);
    const to = parseLocalDate(value.to);
    if (from !== null && to !== null && from.getTime() > to.getTime()) {
      this.filterError.set('audit.error.range');
      return;
    }

    this.filterError.set(null);
    this.expanded.set(new Set());
    this.applied.set({
      entity: value.entity === '' ? null : value.entity,
      entityId: entityId === '' ? null : Number(entityId),
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    });
    this.entries.restart();
  }

  protected clearFilters(): void {
    this.form.reset();
    this.search();
  }

  protected toggle(id: number): void {
    this.expanded.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  protected changes(entry: AuditLogView): ChangeView {
    return changeView(entry);
  }

  /** Texto de la acción; si no hay traducción, la propia acción. */
  protected actionLabel(action: string): string {
    return this.label(`audit.action.${action}`, action);
  }

  protected entityLabel(entity: string): string {
    return this.label(`audit.entity.${entity}`, entity);
  }

  private label(key: string, fallback: string): string {
    return this.translation.has(key) ? this.translation.translate(key) : fallback;
  }
}

/** Fecha de un campo datetime-local (hora local). Vacío o no válido da null. */
function parseLocalDate(value: string): Date | null {
  if (value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
