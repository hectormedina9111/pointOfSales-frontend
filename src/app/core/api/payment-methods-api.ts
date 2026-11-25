import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/**
 * Método de pago (record PaymentMethodView del backend). El código lo fija el sistema y no se
 * puede cambiar; no hay alta ni baja, solo edición.
 */
export interface PaymentMethodView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly requiresReference: boolean;
  readonly allowsChange: boolean;
  readonly active: boolean;
}

/** Body de PUT /api/v1/payment-methods/{id} (record PaymentMethodRequest). Todos los campos son obligatorios. */
export interface PaymentMethodRequest {
  readonly name: string;
  readonly requiresReference: boolean;
  readonly allowsChange: boolean;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/payment-methods. Escrito a mano hasta que `npm run api:update` genere
 * src/app/api a partir del OpenAPI del backend. Solo la central escribe.
 */
@Injectable({ providedIn: 'root' })
export class PaymentMethodsApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<PaymentMethodView>> {
    return this.http.get<Page<PaymentMethodView>>('/api/v1/payment-methods', { params: pageParams(request) });
  }

  update(id: number, body: PaymentMethodRequest): Observable<PaymentMethodView> {
    return this.http.put<PaymentMethodView>(`/api/v1/payment-methods/${id}`, body);
  }
}
