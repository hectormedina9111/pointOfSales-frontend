import { BranchView } from '../../core/api/branches-api';

/**
 * Texto de una sucursal ("código · nombre"). Si el usuario no ve la sucursal en su listado, muestra
 * su id para no perder la referencia.
 */
export function branchLabel(branches: ReadonlyMap<number, BranchView>, branchId: number): string {
  const branch = branches.get(branchId);
  return branch ? `${branch.code} · ${branch.name}` : `#${branchId}`;
}
