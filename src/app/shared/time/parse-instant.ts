/**
 * Milisegundos de una fecha ISO-8601 que llega del backend, o NaN si no es válida. El backend envía
 * los decimales de los segundos con los dígitos que tenga (micro o nanosegundos) y no todos los
 * navegadores los aceptan, así que se recortan a milisegundos antes de leerla.
 */
export function parseInstant(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}
