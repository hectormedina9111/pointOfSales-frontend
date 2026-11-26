import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AttributeValue, AttributeValues, AttributeView } from './categories-api';
import { InventoryDocumentView } from './inventory-api';
import { Page, PageRequest, pageParams } from './page';
import { SerialMovementView, SerialStatus } from './serials-api';

/** Equipo (record EquipmentView): una unidad con serie, su código externo y sus características. */
export interface EquipmentView {
  readonly id: number;
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly categoryId: number | null;
  readonly serialNumber: string;
  readonly externalCode: string | null;
  readonly attributes: AttributeValues;
  readonly status: SerialStatus;
  readonly branchId: number;
  readonly branchName: string;
  readonly receivedAt: string | null;
  readonly soldAt: string | null;
}

/**
 * Detalle de un equipo (EquipmentView más su bitácora y la plantilla de su categoría). Los movimientos
 * tienen la misma forma que el rastreo de un serial; una venta se enlaza desde su movimiento SALE_OUT.
 */
export interface EquipmentDetailView extends EquipmentView {
  readonly movements: readonly SerialMovementView[];
  readonly attributeDefinitions: readonly AttributeView[];
}

/** Filtros del listado de equipos. Un valor null no filtra. */
export interface EquipmentFilters {
  readonly search: string | null;
  readonly productId: number | null;
  readonly categoryId: number | null;
  readonly status: SerialStatus | null;
  readonly branchId: number | null;
}

/** Body de PUT /api/v1/inventory/equipment/{id}: código externo y características. */
export interface EquipmentUpdateRequest {
  readonly externalCode: string | null;
  readonly attributes: Record<string, AttributeValue>;
}

/** Una unidad de la carga de equipos (record EquipmentLoadLineRequest). */
export interface EquipmentLoadLineRequest {
  readonly serialNumber: string;
  readonly externalCode: string | null;
  readonly attributes: Record<string, AttributeValue>;
}

/**
 * Body de POST /api/v1/inventory/equipment-loads. La carga es la entrada de inventario de un producto
 * con serie. branchId solo lo envía la central; el costo va como texto ("100.00") para llegar exacto.
 */
export interface EquipmentLoadRequest {
  readonly branchId: number | null;
  readonly productId: number;
  readonly unitCost: string;
  readonly notes: string | null;
  readonly equipment: readonly EquipmentLoadLineRequest[];
  readonly idempotencyKey: string;
}

/**
 * Llamadas a /api/v1/inventory/equipment y /api/v1/inventory/equipment-loads. Escrito a mano hasta que
 * `npm run api:update` genere src/app/api a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class EquipmentApi {
  private readonly http = inject(HttpClient);

  /** Equipos paginados. Las sucursales de una tienda las limita el servidor a la suya. */
  list(request: PageRequest, filters: EquipmentFilters): Observable<Page<EquipmentView>> {
    let params: HttpParams = pageParams(request);
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    if (filters.productId !== null) {
      params = params.set('productId', filters.productId);
    }
    if (filters.categoryId !== null) {
      params = params.set('categoryId', filters.categoryId);
    }
    if (filters.status !== null) {
      params = params.set('status', filters.status);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    return this.http.get<Page<EquipmentView>>('/api/v1/inventory/equipment', { params });
  }

  /** Detalle de un equipo: características, código externo, bitácora y plantilla de la categoría. */
  get(id: number): Observable<EquipmentDetailView> {
    return this.http.get<EquipmentDetailView>(`/api/v1/inventory/equipment/${id}`);
  }

  /** Corrige el código externo y las características de un equipo. */
  update(id: number, body: EquipmentUpdateRequest): Observable<EquipmentView> {
    return this.http.put<EquipmentView>(`/api/v1/inventory/equipment/${id}`, body);
  }

  /** Registra una carga de equipos: crea el documento de entrada con todas las unidades. */
  createLoad(body: EquipmentLoadRequest): Observable<InventoryDocumentView> {
    return this.http.post<InventoryDocumentView>('/api/v1/inventory/equipment-loads', body);
  }
}
