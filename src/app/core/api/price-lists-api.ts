import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Lista de precios (record PriceListView del backend). Solo los campos que usa la web. */
export interface PriceListView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
}

/** Llamadas a /api/v1/price-lists. Escrito a mano hasta que `npm run api:update` genere src/app/api. */
@Injectable({ providedIn: 'root' })
export class PriceListsApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<PriceListView>> {
    return this.http.get<Page<PriceListView>>('/api/v1/price-lists', { params: pageParams(request) });
  }
}
