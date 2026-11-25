import { Injectable, inject, effect, signal } from '@angular/core';

import { BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';

/**
 * Sucursal que atiende esta tienda. Una tienda solo ve su propia sucursal en el listado de
 * sucursales, así que es la única de la lista. La central atiende varias: aquí no hay una sucursal
 * fija y ownBranchId queda en null (el servidor decide al recibir una transferencia).
 */
@Injectable({ providedIn: 'root' })
export class NodeBranchService {
  private readonly branchesApi = inject(BranchesApi);
  private readonly systemInfo = inject(SystemInfoService);
  private requested = false;

  readonly ownBranchId = signal<number | null>(null);

  constructor() {
    // Se consulta cuando el nodo ya se conoce: en la central no hace falta.
    effect(() => {
      if (this.systemInfo.isStore() && !this.requested) {
        this.requested = true;
        listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
          next: (branches) => this.ownBranchId.set(branches[0]?.id ?? null),
          error: () => {
            this.requested = false;
          },
        });
      }
    });
  }
}
