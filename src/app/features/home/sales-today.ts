import { SaleFilters } from '../../core/api/sales-api';
import { endOfDay, startOfDay, todayDate } from '../../shared/time/day-range';

/**
 * Filas que pide el inicio para las ventas de hoy. El total se suma en la web con las filas
 * recibidas, así que si el día tiene más ventas, el widget lo avisa como resultado parcial.
 */
export const SALES_TODAY_PAGE_SIZE = 200;

/** Ventas cobradas de hoy (día local). El servidor limita a la sucursal de la tienda o a las del privilegio. */
export function paidSalesToday(): SaleFilters {
  const today = todayDate();
  return {
    status: 'PAID',
    cashSessionId: null,
    cashierId: null,
    branchId: null,
    from: startOfDay(today),
    to: endOfDay(today),
  };
}
