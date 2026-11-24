import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Unidad de medida (record UnitOfMeasureView del backend). */
export interface UnitOfMeasureView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly allowsDecimals: boolean;
  readonly active: boolean;
}

/** Body de POST y PUT /api/v1/units-of-measure (record UnitOfMeasureRequest). */
export interface UnitOfMeasureRequest {
  readonly code: string;
  readonly name: string;
  readonly allowsDecimals: boolean;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/units-of-measure. Escrito a mano hasta que `npm run api:update` genere
 * src/app/api a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class UnitsApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<UnitOfMeasureView>> {
    return this.http.get<Page<UnitOfMeasureView>>('/api/v1/units-of-measure', { params: pageParams(request) });
  }

  create(body: UnitOfMeasureRequest): Observable<UnitOfMeasureView> {
    return this.http.post<UnitOfMeasureView>('/api/v1/units-of-measure', body);
  }

  update(id: number, body: UnitOfMeasureRequest): Observable<UnitOfMeasureView> {
    return this.http.put<UnitOfMeasureView>(`/api/v1/units-of-measure/${id}`, body);
  }
}
