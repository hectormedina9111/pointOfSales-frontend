import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Estado de sincronización de este nodo (record SyncStatusView). En la central, node es CENTRAL
 * y el resto de campos son null. En una tienda, node es STORE.
 */
export interface SyncStatusView {
  readonly node: 'CENTRAL' | 'STORE';
  readonly activated: boolean;
  readonly nodeNumber: number | null;
  readonly storeNodeId: number | null;
  readonly branchId: number | null;
  readonly idRangeStart: number | null;
  readonly idRangeEnd: number | null;
  readonly lastAppliedVersion: number | null;
  readonly snapshotCompletedAt: string | null;
  readonly centralUrl: string | null;
  readonly lastSyncAt: string | null;
  readonly lastSyncError: string | null;
}

/** Llamadas a /api/v1/sync. Funciona en la central y en las tiendas. */
@Injectable({ providedIn: 'root' })
export class SyncApi {
  private readonly http = inject(HttpClient);

  status(): Observable<SyncStatusView> {
    return this.http.get<SyncStatusView>('/api/v1/sync/status');
  }
}
