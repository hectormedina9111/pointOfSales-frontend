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
