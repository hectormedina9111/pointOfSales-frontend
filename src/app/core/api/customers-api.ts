import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Tipo de cliente (enum CustomerType del backend). */
export type CustomerType = 'PERSON' | 'COMPANY';

/** Tipo de documento de identidad (enum CustomerDocumentType del backend). NONE no lleva número. */
export type CustomerDocumentType = 'RTN' | 'DNI' | 'PASSPORT' | 'NONE';

/**
 * Cliente (record CustomerView del backend). finalConsumer marca al "consumidor final", que es
 * único, no se edita ni se desactiva. displayName lo arma el backend según el tipo de cliente.
 */
export interface CustomerView {
  readonly id: number;
  readonly externalCode: string | null;
  readonly customerType: CustomerType;
  readonly documentType: CustomerDocumentType;
  readonly documentNumber: string | null;
  readonly firstName: string | null;
  readonly middleName: string | null;
  readonly lastName: string | null;
  readonly secondLastName: string | null;
  readonly businessName: string | null;
  readonly displayName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly priceListId: number | null;
  readonly active: boolean;
  readonly finalConsumer: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

/** Body de POST y PUT /api/v1/customers (record CustomerRequest). Los textos vacíos viajan como null. */
export interface CustomerRequest {
  readonly externalCode: string | null;
  readonly customerType: CustomerType;
  readonly documentType: CustomerDocumentType;
  readonly documentNumber: string | null;
  readonly firstName: string | null;
  readonly middleName: string | null;
  readonly lastName: string | null;
  readonly secondLastName: string | null;
  readonly businessName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly priceListId: number | null;
}

/** Filtros del listado de clientes. Un valor null no filtra. */
export interface CustomerFilters {
  readonly search: string | null;
  readonly active: boolean | null;
}

const NO_FILTERS: CustomerFilters = { search: null, active: null };

/**
 * Llamadas a /api/v1/customers. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend. Crear está permitido en la tienda; editar y desactivar, solo
 * en la central.
 */
@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest, filters: CustomerFilters = NO_FILTERS): Observable<Page<CustomerView>> {
    let params: HttpParams = pageParams(request);
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    if (filters.active !== null) {
      params = params.set('active', filters.active);
    }
    return this.http.get<Page<CustomerView>>('/api/v1/customers', { params });
  }

  get(id: number): Observable<CustomerView> {
    return this.http.get<CustomerView>(`/api/v1/customers/${id}`);
  }

  create(body: CustomerRequest): Observable<CustomerView> {
    return this.http.post<CustomerView>('/api/v1/customers', body);
  }

  update(id: number, body: CustomerRequest): Observable<CustomerView> {
    return this.http.put<CustomerView>(`/api/v1/customers/${id}`, body);
  }

  deactivate(id: number): Observable<CustomerView> {
    return this.http.delete<CustomerView>(`/api/v1/customers/${id}`);
  }
}
