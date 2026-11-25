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

/**
 * Llamadas a /api/v1/branches. Solo listado: el backend devuelve únicamente las sucursales
 * asignadas al usuario que ha iniciado sesión.
 */
@Injectable({ providedIn: 'root' })
export class BranchesApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<BranchView>> {
    return this.http.get<Page<BranchView>>('/api/v1/branches', { params: pageParams(request) });
  }
}
