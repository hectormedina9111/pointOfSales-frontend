import { QUANTITY_PATTERN } from '../../../shared/forms/amounts';

/**
 * Cantidad escrita a mano, en milésimas, admitiendo cero (un conteo puede dar cero). Devuelve null
 * si no es una cantidad válida o es negativa.
 */
export function countToThousandths(text: string): number | null {
  const value = text.trim();
  if (!QUANTITY_PATTERN.test(value)) {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

/** Cantidad del backend (número) a texto con tres decimales, para mostrar. */
export function formatQuantity(value: number): string {
  return value.toFixed(3);
}

/** Diferencia con signo ("+2.000", "-1.500", "0.000"), para mostrar un ajuste. */
export function formatDifference(thousandths: number): string {
  const sign = thousandths > 0 ? '+' : '';
  return `${sign}${(thousandths / 1000).toFixed(3)}`;
}
