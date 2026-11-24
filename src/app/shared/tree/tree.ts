/** Fila de un árbol ya aplanado: el elemento y su nivel (0 en la raíz), para sangrar la vista. */
export interface TreeRow<T> {
  readonly item: T;
  readonly level: number;
}

/**
 * Aplana una lista con padre en un árbol con el orden de la lista. Las filas quedan con su
 * nivel. Un elemento cuyo padre no está en la lista se trata como raíz, para no perderlo.
 */
export function flattenTree<T>(
  items: readonly T[],
  idOf: (item: T) => number,
  parentOf: (item: T) => number | null,
): TreeRow<T>[] {
  const ids = new Set(items.map(idOf));
  const childrenOf = new Map<number | null, T[]>();
  for (const item of items) {
    const parent = parentOf(item);
    const key = parent !== null && ids.has(parent) ? parent : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), item]);
  }

  const rows: TreeRow<T>[] = [];
  const visited = new Set<number>();
  const visit = (parent: number | null, level: number): void => {
    for (const item of childrenOf.get(parent) ?? []) {
      const id = idOf(item);
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      rows.push({ item, level });
      visit(id, level + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** Ids de todos los descendientes de un elemento (sin incluirlo). */
export function descendantIds<T>(
  items: readonly T[],
  idOf: (item: T) => number,
  parentOf: (item: T) => number | null,
  rootId: number,
): ReadonlySet<number> {
  const result = new Set<number>();
  let frontier = [rootId];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const item of items) {
      const parent = parentOf(item);
      const id = idOf(item);
      if (parent !== null && frontier.includes(parent) && !result.has(id) && id !== rootId) {
        result.add(id);
        next.push(id);
      }
    }
    frontier = next;
  }
  return result;
}

/** Sangría de una opción de selector según el nivel: un guion por nivel. */
export function indentLabel(level: number): string {
  return '— '.repeat(level);
}
