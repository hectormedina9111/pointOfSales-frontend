import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/**
 * Impuesto (record TaxView del backend). La tasa llega como número, con dos decimales como máximo.
 * Es un impuesto de un solo país.
 */
export interface TaxView {
  readonly id: number;
  readonly countryId: number;
  readonly code: string;
  readonly name: string;
  readonly rate: number;
  readonly active: boolean;
}

/**
 * Body de POST y PUT /api/v1/taxes (record TaxRequest). La tasa va como texto para que el monto
 * llegue exacto al BigDecimal del backend. El país no cambia después de crear el impuesto.
 */
export interface TaxRequest {
  readonly countryId: number;
  readonly code: string;
  readonly name: string;
  readonly rate: string;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/taxes. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class TaxesApi {
  private readonly http = inject(HttpClient);

  /** Con countryId, solo los impuestos de ese país. */
  list(request: PageRequest, countryId: number | null = null): Observable<Page<TaxView>> {
    let params = pageParams(request);
    if (countryId !== null) {
      params = params.set('countryId', countryId);
    }
    return this.http.get<Page<TaxView>>('/api/v1/taxes', { params });
  }

  create(body: TaxRequest): Observable<TaxView> {
    return this.http.post<TaxView>('/api/v1/taxes', body);
  }

  update(id: number, body: TaxRequest): Observable<TaxView> {
    return this.http.put<TaxView>(`/api/v1/taxes/${id}`, body);
  }
}
