import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Tipo de producto (enum ProductType del backend). Un SERVICE nunca controla inventario. */
export type ProductType = 'GOOD' | 'SERVICE';

/** Producto (record ProductView del backend). Los montos llegan como número con dos decimales. */
export interface ProductView {
  readonly id: number;
  readonly sku: string;
  readonly barcode: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: number | null;
  readonly taxId: number;
  readonly unitOfMeasureId: number;
  readonly salePrice: number;
  readonly priceIncludesTax: boolean;
  readonly cost: number | null;
  readonly productType: ProductType;
  readonly tracksInventory: boolean;
  readonly tracksSerials: boolean;
  readonly requiresExclusiveInvoice: boolean;
  readonly minStock: number | null;
  readonly imageUrl: string | null;
  readonly active: boolean;
}

/**
 * Body de POST y PUT /api/v1/products (record ProductRequest). Los montos van como texto
 * ("12.50") para llegar exactos al BigDecimal del backend.
 */
export interface ProductRequest {
  readonly sku: string;
  readonly barcode: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: number | null;
  readonly taxId: number;
  readonly unitOfMeasureId: number;
  readonly salePrice: string;
  readonly cost: string | null;
  readonly productType: ProductType;
  readonly tracksInventory: boolean;
  readonly tracksSerials: boolean;
  readonly requiresExclusiveInvoice: boolean;
  readonly minStock: string | null;
  readonly imageUrl: string | null;
  readonly active: boolean;
}

/** Impuesto de un producto en un país (record ProductTaxView del backend). */
export interface ProductTaxView {
  readonly countryId: number;
  readonly taxId: number;
}

/** Filtros del listado de productos. Un valor null no filtra. */
export interface ProductFilters {
  readonly q: string | null;
  readonly categoryId: number | null;
  readonly type: ProductType | null;
  readonly active: boolean | null;
}

/**
 * Llamadas a /api/v1/products. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);

  search(request: PageRequest, filters: ProductFilters): Observable<Page<ProductView>> {
    let params: HttpParams = pageParams(request);
    if (filters.q !== null && filters.q !== '') {
      params = params.set('q', filters.q);
    }
    if (filters.categoryId !== null) {
      params = params.set('categoryId', filters.categoryId);
    }
    if (filters.type !== null) {
      params = params.set('type', filters.type);
    }
    if (filters.active !== null) {
      params = params.set('active', filters.active);
    }
    return this.http.get<Page<ProductView>>('/api/v1/products', { params });
  }

  /** Producto por código de barras exacto. Responde 404 si no existe. */
  byBarcode(code: string): Observable<ProductView> {
    return this.http.get<ProductView>(`/api/v1/products/barcode/${encodeURIComponent(code)}`);
  }

  /** Producto por id, por ejemplo para mostrar el nombre de un precio. */
  get(id: number): Observable<ProductView> {
    return this.http.get<ProductView>(`/api/v1/products/${id}`);
  }

  create(body: ProductRequest): Observable<ProductView> {
    return this.http.post<ProductView>('/api/v1/products', body);
  }

  update(id: number, body: ProductRequest): Observable<ProductView> {
    return this.http.put<ProductView>(`/api/v1/products/${id}`, body);
  }

  /** Desactiva el producto (DELETE no borra). */
  deactivate(id: number): Observable<ProductView> {
    return this.http.delete<ProductView>(`/api/v1/products/${id}`);
  }

  taxes(id: number): Observable<readonly ProductTaxView[]> {
    return this.http.get<readonly ProductTaxView[]>(`/api/v1/products/${id}/taxes`);
  }

  /** Reemplaza todos los impuestos por país del producto. Una lista vacía quita todos. */
  replaceTaxes(id: number, rows: readonly ProductTaxView[]): Observable<readonly ProductTaxView[]> {
    return this.http.put<readonly ProductTaxView[]>(`/api/v1/products/${id}/taxes`, rows);
  }
}
