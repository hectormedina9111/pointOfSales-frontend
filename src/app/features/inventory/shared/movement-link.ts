import { MovementReferenceType } from '../../../core/api/inventory-api';

/**
 * Ruta de la pantalla del origen de un movimiento, o null si todavía no tiene pantalla (por
 * ejemplo, las transferencias).
 */
export function movementReferenceLink(
  referenceType: MovementReferenceType,
  referenceId: number,
): readonly string[] | null {
  switch (referenceType) {
    case 'INVENTORY_DOCUMENT':
      return ['/inventory/documents', String(referenceId)];
    case 'SALE':
    case 'SALE_RETURN':
      return ['/sales/orders', String(referenceId)];
    default:
      return null;
  }
}
