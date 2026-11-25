import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Tipo de movimiento de inventario (enum MovementType del backend). */
export type MovementType =
  | 'ENTRY'
  | 'EXIT'
  | 'ADJUSTMENT'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

/** Tipo de documento que se puede crear desde la web. */
export type InventoryDocumentType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

/** Origen de un movimiento. Un documento de inventario, una venta, una devolución o una transferencia. */
export type MovementReferenceType = 'INVENTORY_DOCUMENT' | 'SALE' | 'SALE_RETURN' | 'TRANSFER';

/**
 * Existencia de un producto en una sucursal (record InventoryItemView). Las cantidades y los montos
 * llegan como número; la cantidad puede ser negativa si la sucursal permite vender sin existencia.
 */
export interface InventoryItemView {
  readonly id: number;
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly categoryId: number | null;
  readonly branchId: number;
  readonly branchName: string;
  readonly quantity: number;
  readonly averageCost: number;
  readonly minStock: number;
  readonly belowMin: boolean;
  readonly lastMovementAt: string | null;
}

/** Línea de la bitácora de inventario (record MovementView). quantity lleva signo. */
export interface MovementView {
  readonly id: number;
  readonly branchId: number;
  readonly productId: number;
  readonly productName: string;
  readonly type: MovementType;
  readonly quantity: number;
  readonly resultingBalance: number;
  readonly unitCost: number | null;
  readonly resultingAverageCost: number;
  readonly referenceType: MovementReferenceType;
  readonly referenceId: number;
  readonly referenceNumber: string | null;
  readonly movedAt: string;
  readonly userId: number;
  readonly userName: string;
}

/** Línea de un documento ya guardado (record InventoryDocumentLineView). */
export interface InventoryDocumentLineView {
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: number | null;
  readonly countedQuantity: number | null;
  readonly previousQuantity: number | null;
  readonly unitCost: number | null;
}

/** Documento de inventario guardado (record InventoryDocumentView). */
export interface InventoryDocumentView {
  readonly id: number;
  readonly number: string;
  readonly type: InventoryDocumentType;
  readonly branchId: number;
  readonly branchName: string;
  readonly reason: string | null;
  readonly notes: string | null;
  readonly postedAt: string;
  readonly userId: number;
  readonly userName: string;
  readonly lines: readonly InventoryDocumentLineView[];
}

/**
 * Línea enviada al crear un documento. Las cantidades van como texto ("2.500") para llegar exactas
 * al BigDecimal del backend. Entrada y salida usan quantity; el ajuste usa countedQuantity.
 */
export interface InventoryDocumentLineRequest {
  readonly productId: number;
  readonly quantity: string | null;
  readonly countedQuantity: string | null;
  readonly unitCost: string | null;
  /** Seriales de un producto que controla seriales: entrada (nuevos), salida (a retirar) o ajuste (presentes). */
  readonly serialNumbers?: readonly string[] | null;
}

/** Existencia de un producto en la sucursal, para la búsqueda y la orden (record InventoryAvailabilityView). */
export interface InventoryAvailabilityView {
  readonly productId: number;
  readonly tracksInventory: boolean;
  readonly quantity: number;
  readonly allowNegativeStock: boolean;
}

/** Body de POST /api/v1/inventory/documents. En una tienda, branchId se ignora. */
export interface InventoryDocumentRequest {
  readonly type: InventoryDocumentType;
  readonly branchId: number | null;
  readonly reason: string | null;
  readonly notes: string | null;
  readonly lines: readonly InventoryDocumentLineRequest[];
  readonly idempotencyKey: string;
}

/** Filtros del listado de existencias. Un valor null no filtra. */
export interface StockFilters {
  readonly search: string | null;
  readonly categoryId: number | null;
  readonly branchId: number | null;
  readonly belowMin: boolean | null;
}

/** Filtros de la bitácora de un producto. Las fechas van como instantes ISO-8601. */
export interface MovementFilters {
  readonly productId: number | null;
  readonly branchId: number | null;
  readonly type: MovementType | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** Filtros del listado de documentos. */
export interface InventoryDocumentFilters {
  readonly search: string | null;
  readonly type: InventoryDocumentType | null;
  readonly branchId: number | null;
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Sucursal que se puede usar en una transferencia (GET /api/v1/inventory/transfer-branches): todas las
 * activas, porque una tienda solo ve la suya en /branches. operatedHere marca las que opera este nodo.
 */
export interface TransferBranchView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly operatedHere: boolean;
}

/** Estado de una transferencia (enum TransferStatus del backend). */
export type TransferStatus = 'IN_TRANSIT' | 'RECEIVED' | 'RECEIVED_WITH_DIFFERENCES';

/** Dirección del listado de transferencias, respecto a la sucursal que se consulta. */
export type TransferDirection = 'OUTGOING' | 'INCOMING';

/**
 * Línea de una transferencia enviada (record TransferLineView). receivedQuantity y las seriales
 * recibidas son null o vacías mientras la transferencia está en tránsito.
 */
export interface TransferLineView {
  readonly id: number;
  readonly productId: number;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly receivedQuantity: number | null;
  readonly serialNumbers: readonly string[];
  readonly receivedSerialNumbers: readonly string[];
  readonly unitCost: number | null;
}

/** Transferencia entre sucursales (record TransferView). */
export interface TransferView {
  readonly id: number;
  readonly number: string;
  readonly originBranchId: number;
  readonly originBranchName: string;
  readonly destinationBranchId: number;
  readonly destinationBranchName: string;
  readonly status: TransferStatus;
  readonly notes: string | null;
  readonly sentAt: string;
  readonly sentByName: string;
  readonly receivedAt: string | null;
  readonly receivedByName: string | null;
  readonly receiveNotes: string | null;
  readonly lines: readonly TransferLineView[];
}

/**
 * Línea enviada al crear una transferencia. La cantidad va como texto ("2.500") para llegar exacta
 * al BigDecimal del backend. Un producto con seriales lleva una serial por unidad.
 */
export interface TransferLineRequest {
  readonly productId: number;
  readonly quantity: string;
  readonly serialNumbers?: readonly string[];
}

/** Body de POST /api/v1/inventory/transfers. originBranchId solo lo envía la central. */
export interface TransferRequest {
  readonly destinationBranchId: number;
  readonly originBranchId: number | null;
  readonly notes: string | null;
  readonly lines: readonly TransferLineRequest[];
  readonly idempotencyKey: string;
}

/** Línea de la recepción: lo que llegó de una línea enviada, con sus seriales si las tiene. */
export interface TransferReceiptLineRequest {
  readonly lineId: number;
  readonly receivedQuantity: string;
  readonly serialNumbers?: readonly string[];
}

/** Body de POST /api/v1/inventory/transfers/{id}/receipt. */
export interface TransferReceiptRequest {
  readonly notes: string | null;
  readonly lines: readonly TransferReceiptLineRequest[];
  readonly idempotencyKey: string;
}

/** Filtros del listado de transferencias. Un valor null no filtra. Las fechas van como instantes ISO-8601. */
export interface TransferFilters {
  readonly direction: TransferDirection | null;
  readonly status: TransferStatus | null;
  readonly branchId: number | null;
  readonly search: string | null;
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Llamadas a /api/v1/inventory. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  stock(request: PageRequest, filters: StockFilters): Observable<Page<InventoryItemView>> {
    let params: HttpParams = pageParams(request);
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    if (filters.categoryId !== null) {
      params = params.set('categoryId', filters.categoryId);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.belowMin !== null) {
      params = params.set('belowMin', filters.belowMin);
    }
    return this.http.get<Page<InventoryItemView>>('/api/v1/inventory', { params });
  }

  /** Existencia de un producto en una sucursal. Responde 404 si nunca tuvo movimientos. */
  item(productId: number, branchId: number): Observable<InventoryItemView> {
    return this.http.get<InventoryItemView>(`/api/v1/inventory/${productId}/branches/${branchId}`);
  }

  movements(request: PageRequest, filters: MovementFilters): Observable<Page<MovementView>> {
    let params: HttpParams = pageParams(request);
    if (filters.productId !== null) {
      params = params.set('productId', filters.productId);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.type !== null) {
      params = params.set('type', filters.type);
    }
    if (filters.from !== null) {
      params = params.set('from', filters.from);
    }
    if (filters.to !== null) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Page<MovementView>>('/api/v1/inventory/movements', { params });
  }

  documents(request: PageRequest, filters: InventoryDocumentFilters): Observable<Page<InventoryDocumentView>> {
    let params: HttpParams = pageParams(request);
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    if (filters.type !== null) {
      params = params.set('type', filters.type);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.from !== null) {
      params = params.set('from', filters.from);
    }
    if (filters.to !== null) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Page<InventoryDocumentView>>('/api/v1/inventory/documents', { params });
  }

  /** Existencias de hasta 100 productos en una sucursal (en la tienda, la suya). Responde en el mismo orden que pidió. */
  availability(productIds: readonly number[], branchId: number | null = null): Observable<readonly InventoryAvailabilityView[]> {
    let params = new HttpParams().set('productIds', productIds.join(','));
    if (branchId !== null) {
      params = params.set('branchId', branchId);
    }
    return this.http.get<readonly InventoryAvailabilityView[]>('/api/v1/inventory/availability', { params });
  }

  document(id: number): Observable<InventoryDocumentView> {
    return this.http.get<InventoryDocumentView>(`/api/v1/inventory/documents/${id}`);
  }

  createDocument(body: InventoryDocumentRequest): Observable<InventoryDocumentView> {
    return this.http.post<InventoryDocumentView>('/api/v1/inventory/documents', body);
  }

  /** Transferencias paginadas. La dirección es relativa a la sucursal que consulta el nodo. */
  transferBranches(): Observable<readonly TransferBranchView[]> {
    return this.http.get<readonly TransferBranchView[]>('/api/v1/inventory/transfer-branches');
  }

  transfers(request: PageRequest, filters: TransferFilters): Observable<Page<TransferView>> {
    let params: HttpParams = pageParams(request);
    if (filters.direction !== null) {
      params = params.set('direction', filters.direction);
    }
    if (filters.status !== null) {
      params = params.set('status', filters.status);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.search !== null && filters.search !== '') {
      params = params.set('search', filters.search);
    }
    if (filters.from !== null) {
      params = params.set('from', filters.from);
    }
    if (filters.to !== null) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Page<TransferView>>('/api/v1/inventory/transfers', { params });
  }

  transfer(id: number): Observable<TransferView> {
    return this.http.get<TransferView>(`/api/v1/inventory/transfers/${id}`);
  }

  createTransfer(body: TransferRequest): Observable<TransferView> {
    return this.http.post<TransferView>('/api/v1/inventory/transfers', body);
  }

  /** Confirma lo recibido en la tienda destino. Solo la sucursal destino puede recibir. */
  receiveTransfer(id: number, body: TransferReceiptRequest): Observable<TransferView> {
    return this.http.post<TransferView>(`/api/v1/inventory/transfers/${id}/receipt`, body);
  }
}
