import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PrivilegeView } from './privileges-api';

/** Rol (record RoleView del backend). */
export interface RoleView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

/** Body de POST /api/v1/roles (record CreateRoleRequest). */
export interface CreateRoleRequest {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

/** Body de PUT /api/v1/roles/{id} (record UpdateRoleRequest). El código no cambia. */
export interface UpdateRoleRequest {
  readonly name: string;
  readonly description: string | null;
}

/**
 * Llamadas a /api/v1/roles. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class RolesApi {
  private readonly http = inject(HttpClient);

  /** Lista completa (no paginada). */
  list(): Observable<readonly RoleView[]> {
    return this.http.get<readonly RoleView[]>('/api/v1/roles');
  }

  create(body: CreateRoleRequest): Observable<RoleView> {
    return this.http.post<RoleView>('/api/v1/roles', body);
  }

  update(id: number, body: UpdateRoleRequest): Observable<RoleView> {
    return this.http.put<RoleView>(`/api/v1/roles/${id}`, body);
  }

  privileges(id: number): Observable<readonly PrivilegeView[]> {
    return this.http.get<readonly PrivilegeView[]>(`/api/v1/roles/${id}/privileges`);
  }

  /** Reemplaza todos los privilegios del rol por los códigos indicados. Devuelve los nuevos. */
  replacePrivileges(id: number, privilegeCodes: readonly string[]): Observable<readonly PrivilegeView[]> {
    return this.http.put<readonly PrivilegeView[]>(`/api/v1/roles/${id}/privileges`, { privilegeCodes });
  }
}
