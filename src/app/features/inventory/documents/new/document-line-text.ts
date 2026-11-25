import { thousandthsToQuantity } from '../../../../shared/forms/amounts';
import { formatDifference } from '../../shared/inventory-math';
import { DocumentLine } from './document-draft.store';

/** Cantidad o contada de una línea como texto con tres decimales; vacío si todavía no se escribió. */
export function valueText(line: DocumentLine): string {
  return line.value === null ? '' : thousandthsToQuantity(line.value);
}

/** Saldo actual de una línea de ajuste; guion mientras no se conoce. */
export function currentText(line: DocumentLine): string {
  return line.currentQuantity === null ? '—' : thousandthsToQuantity(line.currentQuantity);
}

/** Diferencia de una línea de ajuste (contada menos actual); guion si falta alguno de los dos. */
export function differenceText(line: DocumentLine): string {
  if (line.value === null || line.currentQuantity === null) {
    return '—';
  }
  return formatDifference(line.value - line.currentQuantity);
}
