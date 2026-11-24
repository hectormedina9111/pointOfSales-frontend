import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Entrada de la auditoría (record AuditLogView). Los valores son los mapas guardados por el backend. */
export interface AuditLogView {
  readonly id: number;
  readonly occurredAt: string;
  readonly userId: number | null;
  readonly username: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: number | null;
  readonly oldValues: Readonly<Record<string, unknown>> | null;
  readonly newValues: Readonly<Record<string, unknown>> | null;
  readonly ipAddress: string | null;
}

/** Filtros de la auditoría. Los nulos no se envían. Las fechas son instantes ISO-8601 (UTC). */
export interface AuditLogFilter {
  readonly entity: string | null;
  readonly entityId: number | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** Llamadas a /api/v1/audit-log. Solo lectura. */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  list(filter: AuditLogFilter, request: PageRequest): Observable<Page<AuditLogView>> {
    let params = pageParams(request);
    if (filter.entity !== null) {
      params = params.set('entity', filter.entity);
    }
    if (filter.entityId !== null) {
      params = params.set('entityId', filter.entityId);
    }
    if (filter.from !== null) {
      params = params.set('from', filter.from);
    }
    if (filter.to !== null) {
      params = params.set('to', filter.to);
    }
    return this.http.get<Page<AuditLogView>>('/api/v1/audit-log', { params });
  }
}
