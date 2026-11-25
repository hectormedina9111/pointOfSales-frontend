import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Estado de una sesión de caja (enum CashSessionStatus del backend). */
export type CashSessionStatus = 'OPEN' | 'CLOSED';

/** Tipo de movimiento de caja (enum CashMovementType del backend). */
export type CashMovementType = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Una línea del conteo al cierre: lo esperado, lo contado y la diferencia (contado menos esperado)
 * para un método de pago (record CountLine del backend).
 */
export interface CountLine {
  readonly method: string;
  readonly expected: number;
  readonly counted: number;
  readonly difference: number;
}

/** Sesión sin movimientos, como sale en el listado (record CashSessionView). Lo de cierre es null mientras está abierta. */
export interface CashSessionView {
  readonly id: number;
  readonly cashRegisterId: number;
  readonly userId: number;
  readonly status: CashSessionStatus;
  readonly openedAt: string;
  readonly openingAmount: number;
  readonly closedAt: string | null;
  readonly expectedTotal: number | null;
  readonly countedTotal: number | null;
  readonly difference: number | null;
  readonly countDetail: readonly CountLine[] | null;
  readonly notes: string | null;
}

/** Movimiento de caja (record CashMovementView). authorizedBy es el usuario que autorizó un retiro. */
export interface CashMovementView {
  readonly id: number;
  readonly cashSessionId: number;
  readonly type: CashMovementType;
  readonly amount: number;
  readonly reason: string;
  readonly movedAt: string;
  readonly userId: number;
  readonly authorizedBy: number | null;
}

/** Sesión con sus movimientos (record CashSessionDetailView). Es lo que devuelven el detalle, "actual" y el cierre. */
export interface CashSessionDetailView extends CashSessionView {
  readonly movements: readonly CashMovementView[];
}

/** Lo que debería haber en caja ahora, por método de pago, antes del conteo (record SessionSummaryView). */
export interface SessionSummaryView {
  readonly sessionId: number;
  readonly status: CashSessionStatus;
  readonly expectedByMethod: Readonly<Record<string, number>>;
  readonly expectedTotal: number;
}

/** Filtros del listado de sesiones. Un valor null no filtra. Las fechas son instantes ISO-8601. */
export interface CashSessionFilters {
  readonly status: CashSessionStatus | null;
  readonly cashRegisterId: number | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** Credenciales de un jefe de tienda para autorizar un retiro (record AuthorizationRequest). Nunca se guardan. */
export interface AuthorizationRequest {
  readonly username: string;
  readonly password: string;
}

/** Body de POST /api/v1/cash-sessions (record OpenRequest). Los montos viajan como texto. */
export interface OpenCashSessionRequest {
  readonly cashRegisterId: number;
  readonly openingAmount: string;
}

/** Body de POST /api/v1/cash-sessions/{id}/movements (record MovementRequest). */
export interface CashMovementRequest {
  readonly type: CashMovementType;
  readonly amount: string;
  readonly reason: string;
  readonly authorization: AuthorizationRequest | null;
}

/** Un método contado al cierre (record CountRequest). */
export interface CashCountRequest {
  readonly paymentMethodCode: string;
  readonly amount: string;
}

/** Body de POST /api/v1/cash-sessions/{id}/close (record CloseRequest). */
export interface CloseCashSessionRequest {
  readonly counts: readonly CashCountRequest[];
  readonly notes: string | null;
}

/**
 * Llamadas a /api/v1/cash-sessions. Escrito a mano hasta que `npm run api:update` genere
 * src/app/api a partir del OpenAPI del backend. Abrir, movimientos y cierre son de la tienda.
 */
@Injectable({ providedIn: 'root' })
export class CashSessionsApi {
  private readonly http = inject(HttpClient);

  /**
   * Sesión abierta del usuario actual, o null si no tiene ninguna. El backend responde 404 en
   * ese caso, que aquí no es un error.
   */
  current(): Observable<CashSessionDetailView | null> {
    return this.http.get<CashSessionDetailView>('/api/v1/cash-sessions/current').pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  get(id: number): Observable<CashSessionDetailView> {
    return this.http.get<CashSessionDetailView>(`/api/v1/cash-sessions/${id}`);
  }

  list(request: PageRequest, filters: CashSessionFilters): Observable<Page<CashSessionView>> {
    let params: HttpParams = pageParams(request);
    if (filters.status !== null) {
      params = params.set('status', filters.status);
    }
    if (filters.cashRegisterId !== null) {
      params = params.set('cashRegisterId', filters.cashRegisterId);
    }
    if (filters.from !== null) {
      params = params.set('from', filters.from);
    }
    if (filters.to !== null) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Page<CashSessionView>>('/api/v1/cash-sessions', { params });
  }

  open(body: OpenCashSessionRequest): Observable<CashSessionDetailView> {
    return this.http.post<CashSessionDetailView>('/api/v1/cash-sessions', body);
  }

  addMovement(id: number, body: CashMovementRequest): Observable<CashMovementView> {
    return this.http.post<CashMovementView>(`/api/v1/cash-sessions/${id}/movements`, body);
  }

  summary(id: number): Observable<SessionSummaryView> {
    return this.http.get<SessionSummaryView>(`/api/v1/cash-sessions/${id}/summary`);
  }

  close(id: number, body: CloseCashSessionRequest): Observable<CashSessionDetailView> {
    return this.http.post<CashSessionDetailView>(`/api/v1/cash-sessions/${id}/close`, body);
  }
}
