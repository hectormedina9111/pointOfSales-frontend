import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Tipos de privilegio (enum PrivilegeType del backend). */
export type PrivilegeType = 'ENDPOINT' | 'MENU' | 'ACTION';

/** Privilegio (record PrivilegeView del backend). */
export interface PrivilegeView {
  readonly id: number;
  readonly code: string;
  readonly type: PrivilegeType;
  readonly name: string;
  readonly description: string | null;
  readonly module: string;
  readonly httpMethod: string | null;
  readonly pathPattern: string | null;
  readonly parentCode: string | null;
  readonly frontendRoute: string | null;
  readonly icon: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/privileges. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class PrivilegesApi {
  private readonly http = inject(HttpClient);

  /** Lista completa (no paginada). Con type, solo los de ese tipo. */
  list(type?: PrivilegeType): Observable<readonly PrivilegeView[]> {
    const params = type === undefined ? undefined : new HttpParams().set('type', type);
    return this.http.get<readonly PrivilegeView[]>('/api/v1/privileges', { params });
  }
}
