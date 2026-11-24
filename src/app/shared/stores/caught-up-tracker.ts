import { signal } from '@angular/core';

import { StoreNodeView } from '../../core/api/store-nodes-api';

/** Cuánto tiempo se resalta una tienda que acaba de ponerse al día. */
export const CAUGHT_UP_MS = 2000;

/**
 * Detecta las tiendas cuyos cambios pendientes han bajado a cero entre dos cargas y las marca
 * unos segundos, para que se vea cómo la réplica se pone al día. La primera carga no marca nada.
 */
export class CaughtUpTracker {
  private readonly previous = new Map<number, number>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly idsSignal = signal<ReadonlySet<number>>(new Set());

  readonly ids = this.idsSignal.asReadonly();

  observe(nodes: readonly StoreNodeView[]): void {
    for (const node of nodes) {
      const before = this.previous.get(node.id);
      this.previous.set(node.id, node.pendingChanges);
      if (before !== undefined && before > 0 && node.pendingChanges === 0) {
        this.highlight(node.id);
      }
    }
  }

  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private highlight(id: number): void {
    this.idsSignal.update((ids) => new Set(ids).add(id));
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.idsSignal.update((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      }, CAUGHT_UP_MS),
    );
  }
}
