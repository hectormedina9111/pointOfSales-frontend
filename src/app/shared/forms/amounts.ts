import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Monto: hasta 12 enteros y 2 decimales (NUMERIC(14,2) del backend). Se valida como texto. */
export const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** Cantidad: hasta 9 enteros y 3 decimales (NUMERIC(12,3) del backend). */
export const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

/** Tasa de impuesto: hasta 3 enteros y 2 decimales (NUMERIC(5,2)). El rango 0 a 100 lo valida percentValidator. */
export const RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

/** Comprueba que un texto numérico esté entre 0 y 100. Se usa solo para validar, nunca para calcular montos. */
export function percentValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (value === '' || !RATE_PATTERN.test(value)) {
    return null;
  }
  return Number(value) <= 100 ? null : { max: { max: 100 } };
}

/** Muestra un monto del backend con dos decimales. Vacío si no hay valor. */
export function formatAmount(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

/**
 * Convierte un monto escrito ("12.5", "12.50") a centavos enteros, para restar sin errores de
 * coma flotante. Devuelve null si el texto no es un monto válido.
 */
export function amountToCents(text: string): number | null {
  const value = text.trim();
  if (!AMOUNT_PATTERN.test(value)) {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Convierte un monto del backend (número) a centavos enteros, redondeando a 2 decimales. */
export function numberToCents(value: number): number {
  return Math.round(value * 100);
}

/** Centavos enteros a monto con dos decimales ("-3.50"), listo para enviar como texto. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/**
 * Muestra un monto con su moneda ("L 1,250.00") según el idioma. Sin moneda (la empresa no está
 * configurada), solo los dos decimales. Null se muestra como guion.
 */
export function formatMoney(value: number | null, currency: string | null, locale: string): string {
  if (value === null) {
    return '—';
  }
  if (currency === null) {
    return value.toFixed(2);
  }
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Convierte una cantidad escrita ("2.5", "2.500") a milésimas enteras, para sumar y restar sin
 * coma flotante. Devuelve null si no es una cantidad válida mayor que cero.
 */
export function quantityToThousandths(text: string): number | null {
  const value = text.trim();
  if (!QUANTITY_PATTERN.test(value)) {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return thousandths > 0 ? thousandths : null;
}

/** Milésimas enteras a cantidad con tres decimales ("2.500"), listo para enviar como texto. */
export function thousandthsToQuantity(thousandths: number): string {
  return (thousandths / 1000).toFixed(3);
}

/** Convierte una cantidad del backend (número) a milésimas enteras. */
export function numberToThousandths(value: number): number {
  return Math.round(value * 1000);
}

/** Centavos enteros a número con dos decimales, solo para mostrar con formatMoney. */
export function centsToNumber(cents: number): number {
  return cents / 100;
}

/** Suma montos del backend sin coma flotante (en centavos) y devuelve el total con dos decimales. */
export function sumAmounts(values: readonly number[]): number {
  return centsToNumber(values.reduce((total, value) => total + numberToCents(value), 0));
}
