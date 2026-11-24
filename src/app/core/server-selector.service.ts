import { Injectable, computed, signal } from '@angular/core';

import { DEFAULT_SERVER_ID, SERVERS, ServerId, ServerNode } from './config/servers';

const STORAGE_KEY = 'pos.server';

@Injectable({ providedIn: 'root' })
export class ServerSelectorService {
  readonly servers: readonly ServerNode[] = SERVERS;

  private readonly selectedId = signal<ServerId>(readStoredServerId());

  /** Id del nodo seleccionado. */
  readonly selectedServerId = this.selectedId.asReadonly();

  /** Nodo seleccionado; las llamadas a la API usan su prefijo. */
  readonly selected = computed<ServerNode>(
    () => SERVERS.find((server) => server.id === this.selectedId()) ?? SERVERS[0],
  );

  select(id: ServerId): void {
    this.selectedId.set(id);
    writeStoredServerId(id);
  }
}

function isServerId(value: string | null): value is ServerId {
  return SERVERS.some((server) => server.id === value);
}

function readStoredServerId(): ServerId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isServerId(stored) ? stored : DEFAULT_SERVER_ID;
  } catch {
    // Almacenamiento bloqueado (ventana privada, permisos): se usa el valor por defecto.
    return DEFAULT_SERVER_ID;
  }
}

function writeStoredServerId(id: ServerId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento la selección solo dura mientras la página esté abierta.
  }
}
