import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Método de precio de una lista (enum PricingMethod del backend). */
export type PricingMethod = 'FIXED_PRICE' | 'PERCENT_OFF_BASE';

/**
 * Lista de precios (record PriceListView del backend). Las fechas llegan como yyyy-MM-dd y son null
 * cuando no tienen límite. El descuento solo tiene valor con PERCENT_OFF_BASE.
 */
export interface PriceListView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly countryId: number;
  readonly pricingMethod: PricingMethod;
  readonly percent: number | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly priority: number;
  readonly active: boolean;
}

/**
 * Body de POST y PUT /api/v1/price-lists (record PriceListRequest). El descuento va como texto
 * para llegar exacto al BigDecimal del backend; es null salvo con PERCENT_OFF_BASE.
 */
export interface PriceListRequest {
  readonly code: string;
  readonly name: string;
  readonly countryId: number;
  readonly pricingMethod: PricingMethod;
  readonly percent: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly priority: number;
  readonly active: boolean;
}

/** Filtros del listado de listas. Un valor null no filtra. */
export interface PriceListFilters {
  readonly countryId: number | null;
  readonly active: boolean | null;
}

const NO_FILTERS: PriceListFilters = { countryId: null, active: null };

/**
 * Llamadas a /api/v1/price-lists. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend. Los precios por producto están en PriceListItemsApi.
 */
@Injectable({ providedIn: 'root' })
export class PriceListsApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest, filters: PriceListFilters = NO_FILTERS): Observable<Page<PriceListView>> {
    let params = pageParams(request);
    if (filters.countryId !== null) {
      params = params.set('countryId', filters.countryId);
    }
    if (filters.active !== null) {
      params = params.set('active', filters.active);
    }
    return this.http.get<Page<PriceListView>>('/api/v1/price-lists', { params });
  }

  get(id: number): Observable<PriceListView> {
    return this.http.get<PriceListView>(`/api/v1/price-lists/${id}`);
  }

  create(body: PriceListRequest): Observable<PriceListView> {
    return this.http.post<PriceListView>('/api/v1/price-lists', body);
  }

  update(id: number, body: PriceListRequest): Observable<PriceListView> {
    return this.http.put<PriceListView>(`/api/v1/price-lists/${id}`, body);
  }
}
