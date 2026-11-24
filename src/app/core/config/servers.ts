/** Identificador de cada nodo del sistema: la central y las tiendas. */
export type ServerId = 'central' | 'store1' | 'store2';

export interface ServerNode {
  readonly id: ServerId;
  /** Clave de traducción del nombre que ve la persona. */
  readonly labelKey: string;
  /** Prefijo con el que nginx reenvía las llamadas a cada backend. */
  readonly prefix: string;
}

export const SERVERS: readonly ServerNode[] = [
  { id: 'central', labelKey: 'server.central', prefix: '/central' },
  { id: 'store1', labelKey: 'server.store1', prefix: '/store1' },
  { id: 'store2', labelKey: 'server.store2', prefix: '/store2' },
];

export const DEFAULT_SERVER_ID: ServerId = 'central';
