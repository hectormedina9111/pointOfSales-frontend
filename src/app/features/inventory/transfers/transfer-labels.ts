import { TransferStatus } from '../../../core/api/inventory-api';

/** Estados de una transferencia, en el orden del filtro. */
export const TRANSFER_STATUSES: readonly TransferStatus[] = ['IN_TRANSIT', 'RECEIVED', 'RECEIVED_WITH_DIFFERENCES'];

/** Clase de Bootstrap del distintivo de estado: en tránsito es advertencia; con diferencias, peligro. */
export function transferStatusClass(status: TransferStatus): string {
  switch (status) {
    case 'IN_TRANSIT':
      return 'text-bg-warning';
    case 'RECEIVED':
      return 'text-bg-success';
    case 'RECEIVED_WITH_DIFFERENCES':
      return 'text-bg-danger';
  }
}
