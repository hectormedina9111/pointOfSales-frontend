import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MovementReferenceType } from './inventory-api';
import { Page, PageRequest, pageParams } from './page';

/**
 * Estado de un serial (enum SerialStatus del backend). El plan también nombra DEFECTIVE, que el
 * backend aún no devuelve en estos contratos.
 */
export type SerialStatus = 'AVAILABLE' | 'SOLD' | 'IN_TRANSIT' | 'REMOVED';

/** Tipo de movimiento de un serial: el mismo del inventario (MovementType). */
export type SerialMovementType =
  | 'ENTRY'
  | 'EXIT'
  | 'ADJUSTMENT'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

/** Serial de un producto en una sucursal (record ProductSerialView). */
export interface ProductSerialView {
  readonly id: number;
  readonly productId: number;
  readonly serialNumber: string;
  readonly status: SerialStatus;
  readonly branchId: number;
  readonly branchName: string;
  readonly receivedAt: string | null;
  readonly soldAt: string | null;
}

/** Movimiento de un serial en su rastreo (record SerialMovementView). */
export interface SerialMovementView {
  readonly id: number;
  readonly type: SerialMovementType;
  readonly movedAt: string;
  readonly branchName: string;
  readonly referenceType: MovementReferenceType;
  readonly referenceId: number;
  readonly referenceNumber: string | null;
}

/**
 * Rastreo de un serial (record SerialTraceView). Varios productos pueden compartir el mismo número,
 * así que la búsqueda por número devuelve una fila por producto.
 */
export interface SerialTraceView {
  readonly id: number;
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly serialNumber: string;
  readonly status: SerialStatus;
  readonly branchId: number;
  readonly branchName: string;
  readonly receivedAt: string | null;
  readonly soldAt: string | null;
  readonly saleId: number | null;
  readonly saleReceiptNumber: string | null;
  readonly movements: readonly SerialMovementView[];
}

/** Filtros de los seriales de un producto. Un valor null no filtra. */
export interface ProductSerialFilters {
  readonly status: SerialStatus | null;
  readonly branchId: number | null;
  readonly search: string | null;
}

/**
 * Llamadas a los seriales: /api/v1/products/{id}/serials y /api/v1/serials. Escrito a mano hasta que
 * `npm run api:update` genere src/app/api a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class SerialsApi {
  private readonly http = inject(HttpClient);

  /** Seriales de un producto, paginados. La tienda ve los de su sucursal; el servidor lo decide si no se indica sucursal. */
  forProduct(productId: number, request: PageRequest, filters: ProductSerialFilters): Observable<Page<ProductSerialView>> {
    let params: HttpParams = pageParams(request);
    if (filters.status !== null) {
      params = params.set('status', filters.status);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    return this.http.get<Page<ProductSerialView>>(`/api/v1/products/${productId}/serials`, { params });
  }

  /** Rastreo de un número de serie. productId es opcional: sin él, una fila por cada producto con ese número. */
  trace(serialNumber: string, productId: number | null): Observable<readonly SerialTraceView[]> {
    let params = new HttpParams().set('serialNumber', serialNumber);
    if (productId !== null) {
      params = params.set('productId', productId);
    }
    return this.http.get<readonly SerialTraceView[]>('/api/v1/serials', { params });
  }
}
