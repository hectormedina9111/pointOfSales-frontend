import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Origen del precio (enum PriceSource del backend): una lista de precios o el precio base. */
export type PriceSource = 'PRICE_LIST' | 'BASE_PRICE';

/**
 * Precio resuelto de un producto (record ProductPriceView del backend). Los montos llegan como
 * número con dos decimales. priceListId es null cuando se usó el precio base.
 */
export interface ProductPriceView {
  readonly productId: number;
  readonly priceListId: number | null;
  readonly source: PriceSource;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxCode: string;
  readonly taxRate: number;
  readonly taxableBase: number;
  readonly taxAmount: number;
  readonly date: string;
}

/** Parámetros de la consulta de precio. Un valor null no se envía. */
export interface ProductPriceQuery {
  readonly priceListId: number | null;
  readonly branchId: number | null;
  /** Cantidad como texto, por ejemplo "2.500". */
  readonly quantity: string;
  /** Día en formato yyyy-MM-dd; null significa hoy en la zona horaria del país. */
  readonly date: string | null;
}

/**
 * Llamadas a GET /api/v1/products/{id}/price. Solo lectura: la central y las tiendas lo usan igual.
 * Escrito a mano hasta que `npm run api:update` genere src/app/api.
 */
@Injectable({ providedIn: 'root' })
export class ProductPricesApi {
  private readonly http = inject(HttpClient);

  resolve(productId: number, query: ProductPriceQuery): Observable<ProductPriceView> {
    let params = new HttpParams().set('quantity', query.quantity);
    if (query.priceListId !== null) {
      params = params.set('priceListId', query.priceListId);
    }
    if (query.branchId !== null) {
      params = params.set('branchId', query.branchId);
    }
    if (query.date !== null) {
      params = params.set('date', query.date);
    }
    return this.http.get<ProductPriceView>(`/api/v1/products/${productId}/price`, { params });
  }
}
