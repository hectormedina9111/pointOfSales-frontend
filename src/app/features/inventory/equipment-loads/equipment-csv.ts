import { AttributeView } from '../../../core/api/categories-api';
import { splitCsvFields } from '../shared/csv-fields';
import { AttributeTexts, attributeIssue } from '../shared/equipment-attributes';

/** Nombres de las columnas fijas. El encabezado no distingue mayúsculas. */
const SERIAL_COLUMN = 'serialnumber';
const EXTERNAL_COLUMN = 'externalcode';

/** Parámetros de un mensaje de traducción (por ejemplo, el nombre de la columna). */
export type EquipmentCsvParams = Readonly<Record<string, string | number>>;

/** Un mensaje: clave de traducción y sus parámetros. */
export interface EquipmentCsvMessage {
  readonly key: string;
  readonly params: EquipmentCsvParams;
}

/** Un error de una fila, con su número de línea en el archivo. */
export interface EquipmentCsvRowError extends EquipmentCsvMessage {
  readonly line: number;
}

/** Una fila válida: serie, código externo (o null) y el texto de cada característica por código. */
export interface EquipmentCsvRow {
  readonly line: number;
  readonly serialNumber: string;
  readonly externalCode: string | null;
  readonly texts: AttributeTexts;
}

/** Resultado de leer el archivo. Si headerError no es null, no hay filas que leer. */
export interface EquipmentCsvResult {
  readonly headerError: EquipmentCsvMessage | null;
  readonly rows: readonly EquipmentCsvRow[];
  readonly errors: readonly EquipmentCsvRowError[];
}

/** Columna del encabezado ya reconocida. */
type Column =
  | { readonly kind: 'serial' }
  | { readonly kind: 'external' }
  | { readonly kind: 'attribute'; readonly attribute: AttributeView };

function headerFailure(key: string, params: EquipmentCsvParams = {}): EquipmentCsvResult {
  return { headerError: { key, params }, rows: [], errors: [] };
}

/**
 * Lee el CSV de una carga de equipos. El encabezado es serialNumber, externalCode (opcional) y un
 * código de característica por columna; el separador puede ser coma o punto y coma. Se rechaza el
 * archivo si una columna no existe en la plantilla, se repite o falta una característica obligatoria.
 * Cada fila con error se reporta con su línea y las válidas se devuelven. Función pura, sin red.
 */
export function parseEquipmentCsv(text: string, attributes: readonly AttributeView[]): EquipmentCsvResult {
  const numbered = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((content, index) => ({ line: index + 1, content }))
    .filter((entry) => entry.content.trim() !== '');

  const header = numbered[0];
  if (header === undefined) {
    return headerFailure('equipment.csv.header.missing');
  }

  const separator = header.content.includes(';') ? ';' : ',';
  const names = splitCsvFields(header.content, separator).map((name) => name.trim());
  const byCode = new Map(attributes.map((attribute) => [attribute.code.toLowerCase(), attribute] as const));

  const columns: Column[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const lower = name.toLowerCase();
    let column: Column;
    if (lower === SERIAL_COLUMN) {
      column = { kind: 'serial' };
    } else if (lower === EXTERNAL_COLUMN) {
      column = { kind: 'external' };
    } else {
      const attribute = byCode.get(lower);
      if (attribute === undefined) {
        return headerFailure('equipment.csv.header.unknown', { column: name });
      }
      column = { kind: 'attribute', attribute };
    }
    if (seen.has(lower)) {
      return headerFailure('equipment.csv.header.duplicate', { column: name });
    }
    seen.add(lower);
    columns.push(column);
  }

  if (!columns.some((column) => column.kind === 'serial')) {
    return headerFailure('equipment.csv.header.serial');
  }
  for (const attribute of attributes) {
    if (attribute.required && !seen.has(attribute.code.toLowerCase())) {
      return headerFailure('equipment.csv.header.required', { column: attribute.code });
    }
  }

  const rows: EquipmentCsvRow[] = [];
  const errors: EquipmentCsvRowError[] = [];
  for (const entry of numbered.slice(1)) {
    const fields = splitCsvFields(entry.content, separator).map((field) => field.trim());
    if (fields.length !== columns.length) {
      errors.push({ line: entry.line, key: 'equipment.csv.error.columns', params: { count: columns.length } });
      continue;
    }

    let serialNumber = '';
    let externalCode = '';
    const texts: Record<string, string> = {};
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const value = fields[index] ?? '';
      if (column.kind === 'serial') {
        serialNumber = value;
      } else if (column.kind === 'external') {
        externalCode = value;
      } else {
        texts[column.attribute.code] = value;
      }
    }

    if (serialNumber === '') {
      errors.push({ line: entry.line, key: 'equipment.csv.error.serial', params: {} });
      continue;
    }
    const failed = firstAttributeError(columns, texts);
    if (failed !== null) {
      errors.push({ line: entry.line, key: failed.key, params: { column: failed.code } });
      continue;
    }
    rows.push({
      line: entry.line,
      serialNumber,
      externalCode: externalCode === '' ? null : externalCode,
      texts,
    });
  }
  return { headerError: null, rows, errors };
}

/** Primer error de tipo o de obligatoriedad entre las columnas de características de una fila. */
function firstAttributeError(
  columns: readonly Column[],
  texts: AttributeTexts,
): { readonly key: string; readonly code: string } | null {
  for (const column of columns) {
    if (column.kind !== 'attribute') {
      continue;
    }
    const key = attributeIssue(column.attribute, texts[column.attribute.code] ?? '');
    if (key !== null) {
      return { key, code: column.attribute.code };
    }
  }
  return null;
}
