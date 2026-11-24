import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Proveedor de facturación fiscal por país (enum FiscalProviderCode del backend). */
export type FiscalProviderCode = 'HN_SAR' | 'NONE';

/** País (record CountryView del backend). */
export interface CountryView {
  readonly id: number;
  readonly isoCode: string;
  readonly name: string;
  readonly currency: string;
  readonly timeZone: string;
  readonly taxIdLabel: string;
  readonly fiscalProvider: FiscalProviderCode;
  readonly active: boolean;
}

/** Body de POST y PUT /api/v1/countries (record CountryRequest). */
export interface CountryRequest {
  readonly isoCode: string;
  readonly name: string;
  readonly currency: string;
  readonly timeZone: string;
  readonly taxIdLabel: string;
  readonly fiscalProvider: FiscalProviderCode;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/countries. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class CountriesApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<CountryView>> {
    return this.http.get<Page<CountryView>>('/api/v1/countries', { params: pageParams(request) });
  }

  create(body: CountryRequest): Observable<CountryView> {
    return this.http.post<CountryView>('/api/v1/countries', body);
  }

  update(id: number, body: CountryRequest): Observable<CountryView> {
    return this.http.put<CountryView>(`/api/v1/countries/${id}`, body);
  }
}
