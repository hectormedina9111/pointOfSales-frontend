import { AttributeValues } from '../../core/api/categories-api';

/** Valores que entran en el resumen corto; el resto no se muestra en las listas. */
const SUMMARY_VALUES = 3;

/**
 * Resumen corto de las características de un equipo ("Rojo · 2019"), con los primeros valores en el
 * orden del servidor. Cadena vacía si el equipo no tiene características.
 */
export function attributeSummary(attributes: AttributeValues): string {
  return Object.values(attributes)
    .slice(0, SUMMARY_VALUES)
    .map((value) => String(value))
    .join(' · ');
}
