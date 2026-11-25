import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Sucursal (record BranchView del backend). */
export interface BranchView {
  readonly id: number;
  readonly companyId: number;
  readonly countryId: number;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly allowNegativeStock: boolean;
  readonly active: boolean;
  readonly defaultPriceListId: number | null;
}

/** Body de POST y PUT /api/v1/branches (record BranchRequest). */
export interface BranchRequest {
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly countryId: number;
  readonly allowNegativeStock: boolean;
  readonly active: boolean;
  readonly defaultPriceListId: number | null;
}

/**
 * Llamadas a /api/v1/branches. El listado solo devuelve las sucursales asignadas al usuario que
 * ha iniciado sesión: una sucursal nueva no aparece hasta asignarla a ese usuario.
 */
@Injectable({ providedIn: 'root' })
export class BranchesApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<BranchView>> {
    return this.http.get<Page<BranchView>>('/api/v1/branches', { params: pageParams(request) });
  }

  create(body: BranchRequest): Observable<BranchView> {
    return this.http.post<BranchView>('/api/v1/branches', body);
  }

  update(id: number, body: BranchRequest): Observable<BranchView> {
    return this.http.put<BranchView>(`/api/v1/branches/${id}`, body);
  }
}
