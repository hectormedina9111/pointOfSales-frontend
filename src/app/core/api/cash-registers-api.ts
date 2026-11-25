import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Caja de cobro (record CashRegisterView del backend). El código es único dentro de la sucursal. */
export interface CashRegisterView {
  readonly id: number;
  readonly branchId: number;
  readonly code: string;
  readonly name: string;
  readonly receiptPrefix: string;
  readonly active: boolean;
}

/** Body de POST y PUT /api/v1/cash-registers (record CashRegisterRequest). */
export interface CashRegisterRequest {
  readonly branchId: number;
  readonly code: string;
  readonly name: string;
  readonly receiptPrefix: string;
  readonly active: boolean;
}

/** Filtros del listado de cajas. Un valor null no filtra. */
export interface CashRegisterFilters {
  readonly branchId: number | null;
  readonly active: boolean | null;
}

/**
 * Llamadas a /api/v1/cash-registers. Escrito a mano hasta que `npm run api:update` genere
 * src/app/api a partir del OpenAPI del backend. Solo la central escribe.
 */
@Injectable({ providedIn: 'root' })
export class CashRegistersApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest, filters: CashRegisterFilters): Observable<Page<CashRegisterView>> {
    let params: HttpParams = pageParams(request);
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.active !== null) {
      params = params.set('active', filters.active);
    }
    return this.http.get<Page<CashRegisterView>>('/api/v1/cash-registers', { params });
  }

  create(body: CashRegisterRequest): Observable<CashRegisterView> {
    return this.http.post<CashRegisterView>('/api/v1/cash-registers', body);
  }

  update(id: number, body: CashRegisterRequest): Observable<CashRegisterView> {
    return this.http.put<CashRegisterView>(`/api/v1/cash-registers/${id}`, body);
  }
}
