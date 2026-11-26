import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AttributeValues } from './categories-api';
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
  /** Código externo del equipo (ERP u otro sistema); null si no tiene. */
  readonly externalCode: string | null;
  /** Características del equipo según la plantilla de su categoría. */
  readonly attributes: AttributeValues;
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
 * Origen de un resultado de búsqueda por serial: EQUIPMENT es un equipo de serie de lista; SALE es una
 * serie manual que se registró al facturar.
 */
export type SerialSource = 'EQUIPMENT' | 'SALE';

/**
 * Resultado de buscar un número de serie (record SerialSearchView). Una fila por producto con ese número.
 * Una serie SALE trae la venta donde se registró; una EQUIPMENT trae su id de equipo.
 */
export interface SerialSearchView {
  readonly id: number;
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly serialNumber: string;
  readonly status: SerialStatus;
  readonly branchId: number;
  readonly branchName: string;
  readonly soldAt: string | null;
  readonly saleId: number | null;
  readonly saleReceiptNumber: string | null;
  readonly source: SerialSource;
}

/** Filtros de los seriales de un producto. Un valor null no filtra. */
export interface ProductSerialFilters {
  readonly status: SerialStatus | null;
  readonly branchId: number | null;
  readonly search: string | null;
}

/**
 * Llamadas a los seriales: /api/v1/products/{id}/serials. Escrito a mano hasta que
 * `npm run api:update` genere src/app/api a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class SerialsApi {
  private readonly http = inject(HttpClient);

  /** Búsqueda por número de serie en todas las sucursales que ve el nodo. Lista sin paginar. */
  searchBySerial(serialNumber: string): Observable<readonly SerialSearchView[]> {
    return this.http.get<readonly SerialSearchView[]>('/api/v1/serials', {
      params: new HttpParams().set('serialNumber', serialNumber),
    });
  }

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
}
