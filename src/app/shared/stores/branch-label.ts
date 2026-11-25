import { BranchView } from '../../core/api/branches-api';

/**
 * Texto de una sucursal ("código · nombre"), o null si no está en el mapa (por ejemplo, mientras
 * carga). Quien llama decide el texto de respaldo.
 */
export function branchLabel(branches: ReadonlyMap<number, BranchView>, branchId: number): string | null {
  const branch = branches.get(branchId);
  return branch ? `${branch.code} · ${branch.name}` : null;
}
