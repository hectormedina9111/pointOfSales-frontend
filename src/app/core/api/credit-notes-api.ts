import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Estado de una nota de crédito (enum CreditNoteStatus del backend): ACTIVE tiene saldo; USED ya no. */
export type CreditNoteStatus = 'ACTIVE' | 'USED';

/**
 * Nota de crédito (record CreditNoteView). Se emite por una devolución y su saldo vive en la central.
 * amount y balance son números con dos decimales; issuedAt es un instante ISO-8601.
 */
export interface CreditNoteView {
  readonly id: number;
  readonly number: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly returnSaleId: number;
  readonly returnReceiptNumber: string | null;
  readonly branchId: number;
  readonly amount: number;
  readonly balance: number;
  readonly status: CreditNoteStatus;
  readonly issuedAt: string;
}

/**
 * Resultado de buscar una nota por número (record CreditNoteLookupView). El saldo viene de la central:
 * solo con conexión. amount y balance son números con dos decimales.
 */
export interface CreditNoteLookupView {
  readonly id: number;
  readonly number: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly amount: number;
  readonly balance: number;
  readonly status: CreditNoteStatus;
}

/** Estado de un uso de la nota (enum RedemptionStatus del backend). */
export type CreditNoteRedemptionStatus = 'APPLIED' | 'CONFIRMED' | 'RELEASED';

/**
 * Uso de una nota de crédito en una compra (record CreditNoteRedemptionView). saleId es la venta que
 * la usó; storeNodeId, la tienda donde se hizo.
 */
export interface CreditNoteRedemptionView {
  readonly id: number;
  readonly redemptionKey: string;
  readonly amount: number;
  readonly status: CreditNoteRedemptionStatus;
  readonly storeNodeId: number;
  readonly saleId: number | null;
  readonly createdAt: string;
}

/**
 * Filtros del listado de notas de crédito. Un valor null no filtra. search busca por número; from y
 * to son instantes ISO-8601. branchId solo tiene efecto en la central.
 */
export interface CreditNoteFilters {
  readonly customerId: number | null;
  readonly status: CreditNoteStatus | null;
  readonly search: string | null;
  readonly branchId: number | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** Llamadas a /api/v1/credit-notes. Escrito a mano hasta que `npm run api:update` genere src/app/api. */
@Injectable({ providedIn: 'root' })
export class CreditNotesApi {
  private readonly http = inject(HttpClient);

  /** Notas de crédito paginadas. El orden va en request.sort (por ejemplo "issuedAt,desc"). */
  list(request: PageRequest, filters: CreditNoteFilters): Observable<Page<CreditNoteView>> {
    let params: HttpParams = pageParams(request);
    const values: Record<string, string | number | null | undefined> = {
      customerId: filters.customerId,
      status: filters.status,
      search: filters.search,
      branchId: filters.branchId,
      from: filters.from,
      to: filters.to,
    };
    for (const [name, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(name, value);
      }
    }
    return this.http.get<Page<CreditNoteView>>('/api/v1/credit-notes', { params });
  }

  get(id: number): Observable<CreditNoteView> {
    return this.http.get<CreditNoteView>(`/api/v1/credit-notes/${id}`);
  }

  /** Busca una nota por su número y devuelve el saldo actual de la central. Solo en la tienda. */
  lookup(number: string): Observable<CreditNoteLookupView> {
    return this.http.get<CreditNoteLookupView>('/api/v1/credit-notes/lookup', { params: { number } });
  }

  /** Usos de una nota en la central, paginados. El orden va en request.sort. */
  redemptions(id: number, request: PageRequest): Observable<Page<CreditNoteRedemptionView>> {
    return this.http.get<Page<CreditNoteRedemptionView>>(`/api/v1/credit-notes/${id}/redemptions`, {
      params: pageParams(request),
    });
  }
}
