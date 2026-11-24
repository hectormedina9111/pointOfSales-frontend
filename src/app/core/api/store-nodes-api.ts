import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Estado de una tienda como lo ve la central (StoreNodeStatus del backend). */
export type StoreNodeState = 'PENDING' | 'ACTIVE' | 'OUT_OF_SYNC' | 'DISABLED';

/**
 * Tienda registrada (record StoreNodeView del backend). Nunca incluye secretos.
 * latestVersion, pendingChanges y connected se calculan en cada consulta.
 */
export interface StoreNodeView {
  readonly id: number;
  readonly nodeNumber: number;
  readonly branchId: number | null;
  readonly idRangeStart: number;
  readonly idRangeEnd: number;
  readonly status: StoreNodeState;
  readonly activatedAt: string | null;
  readonly lastHeartbeatAt: string | null;
  readonly lastDownloadVersion: number | null;
  readonly appVersion: string | null;
  readonly credentialRevokedAt: string | null;
  readonly latestVersion: number;
  readonly pendingChanges: number;
  readonly connected: boolean;
  readonly syncState: StoreNodeState;
}

/** Código de activación (record ActivationCodeView). El código solo llega en esta respuesta. */
export interface ActivationCodeView {
  readonly code: string;
  readonly expiresAt: string;
}

/**
 * Llamadas a /api/v1/store-nodes. Solo existen en la central: en una tienda responden 403
 * (READ_ONLY_NODE), así que la pantalla no las llama allí.
 */
@Injectable({ providedIn: 'root' })
export class StoreNodesApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<StoreNodeView>> {
    return this.http.get<Page<StoreNodeView>>('/api/v1/store-nodes', { params: pageParams(request) });
  }

  /** branchId null registra la tienda sin sucursal. */
  create(branchId: number | null): Observable<StoreNodeView> {
    return this.http.post<StoreNodeView>('/api/v1/store-nodes', { branchId });
  }

  activationCode(id: number): Observable<ActivationCodeView> {
    return this.http.post<ActivationCodeView>(`/api/v1/store-nodes/${id}/activation-code`, null);
  }

  revoke(id: number): Observable<StoreNodeView> {
    return this.http.post<StoreNodeView>(`/api/v1/store-nodes/${id}/revoke`, null);
  }
}
