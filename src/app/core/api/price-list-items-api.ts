import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/**
 * Precio de un producto en una lista desde una cantidad mínima (record PriceListItemView del
 * backend). Los montos llegan como número con dos decimales.
 */
export interface PriceListItemView {
  readonly id: number;
  readonly priceListId: number;
  readonly productId: number;
  readonly minQuantity: number;
  readonly price: number;
}

/**
 * Body de POST y PUT de un precio (record PriceListItemRequest). Cantidad y precio van como texto.
 * La cantidad mínima es 1 si se omite; la web siempre la envía.
 */
export interface PriceListItemRequest {
  readonly productId: number;
  readonly minQuantity: string;
  readonly price: string;
}

/**
 * Llamadas a /api/v1/price-lists/{id}/items. Escrito a mano hasta que `npm run api:update` genere
 * src/app/api. El borrado es real: un precio no es un catálogo.
 */
@Injectable({ providedIn: 'root' })
export class PriceListItemsApi {
  private readonly http = inject(HttpClient);

  /** Con productId, solo los precios de ese producto. */
  list(listId: number, request: PageRequest, productId: number | null = null): Observable<Page<PriceListItemView>> {
    let params: HttpParams = pageParams(request);
    if (productId !== null) {
      params = params.set('productId', productId);
    }
    return this.http.get<Page<PriceListItemView>>(`/api/v1/price-lists/${listId}/items`, { params });
  }

  add(listId: number, body: PriceListItemRequest): Observable<PriceListItemView> {
    return this.http.post<PriceListItemView>(`/api/v1/price-lists/${listId}/items`, body);
  }

  update(listId: number, itemId: number, body: PriceListItemRequest): Observable<PriceListItemView> {
    return this.http.put<PriceListItemView>(`/api/v1/price-lists/${listId}/items/${itemId}`, body);
  }

  delete(listId: number, itemId: number): Observable<void> {
    return this.http.delete<void>(`/api/v1/price-lists/${listId}/items/${itemId}`);
  }
}
