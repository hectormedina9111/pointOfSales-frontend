import { AttributeValue, AttributeValues, AttributeView } from '../../../core/api/categories-api';

/** Fecha de calendario en formato YYYY-MM-DD, como la entrega el campo de fecha. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Número con signo opcional y decimales opcionales. */
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** Texto de una característica mapeado por su código, como lo escribe la persona. */
export type AttributeTexts = Readonly<Record<string, string>>;

/** Clave de traducción de un error de característica, por código. */
export type AttributeIssues = Readonly<Record<string, string>>;

/** Verdadero si el texto es una fecha real (no 2026-02-31). */
function isCalendarDate(text: string): boolean {
  if (!DATE_PATTERN.test(text)) {
    return false;
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Error de un valor de característica, como clave de traducción, o null si es válido. Un texto vacío
 * solo es error si la característica es obligatoria. Lo que no cumple el tipo (número, fecha u opción
 * de lista) también es error; el servidor valida de nuevo al guardar.
 */
export function attributeIssue(attribute: AttributeView, text: string): string | null {
  const value = text.trim();
  if (value === '') {
    return attribute.required ? 'equipment.attribute.required' : null;
  }
  switch (attribute.dataType) {
    case 'NUMBER':
      return NUMBER_PATTERN.test(value) ? null : 'equipment.attribute.number';
    case 'DATE':
      return isCalendarDate(value) ? null : 'equipment.attribute.date';
    case 'LIST':
      return (attribute.options ?? []).includes(value) ? null : 'equipment.attribute.option';
    default:
      return null;
  }
}

/** Errores de todas las características de un equipo, por código. Un mapa vacío si no hay ninguno. */
export function attributeIssues(attributes: readonly AttributeView[], texts: AttributeTexts): AttributeIssues {
  const issues: Record<string, string> = {};
  for (const attribute of attributes) {
    const key = attributeIssue(attribute, texts[attribute.code] ?? '');
    if (key !== null) {
      issues[attribute.code] = key;
    }
  }
  return issues;
}

/**
 * Valores que se envían al servidor: los que tienen texto, con número para las características de tipo
 * NUMBER y texto para el resto. Las vacías no se envían.
 */
export function attributeValues(attributes: readonly AttributeView[], texts: AttributeTexts): Record<string, AttributeValue> {
  const values: Record<string, AttributeValue> = {};
  for (const attribute of attributes) {
    const value = (texts[attribute.code] ?? '').trim();
    if (value !== '') {
      values[attribute.code] = attribute.dataType === 'NUMBER' ? Number(value) : value;
    }
  }
  return values;
}

/** Texto de los valores de un equipo, para cargarlos en los campos. */
export function attributeTexts(attributes: readonly AttributeView[], values: AttributeValues): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const attribute of attributes) {
    const value = values[attribute.code];
    texts[attribute.code] = value === undefined ? '' : String(value);
  }
  return texts;
}

/** Valores legibles de un equipo en el orden de la plantilla ("Rojo · 2019"); vacío si no tiene. */
export function attributeReadableText(attributes: readonly AttributeView[], texts: AttributeTexts): string {
  return attributes
    .map((attribute) => (texts[attribute.code] ?? '').trim())
    .filter((text) => text !== '')
    .join(' · ');
}
