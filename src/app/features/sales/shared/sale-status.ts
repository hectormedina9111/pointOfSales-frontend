import { SaleStatus } from '../../../core/api/sales-api';

/**
 * Clases de Bootstrap del distintivo de estado de una venta o devolución: en espera, cobrada, con
 * devoluciones parciales o devuelta por completo.
 */
export function saleStatusClass(status: SaleStatus): string {
  switch (status) {
    case 'ON_HOLD':
      return 'badge text-bg-warning';
    case 'PAID':
      return 'badge text-bg-success';
    case 'PARTIALLY_RETURNED':
      return 'badge text-bg-info';
    case 'RETURNED':
      return 'badge text-bg-secondary';
  }
}
