import { AMOUNT_PATTERN, quantityToThousandths } from '../../../../shared/forms/amounts';
import { splitCsvFields } from '../../shared/csv-fields';

/** Encabezado obligatorio, en este orden. El separador puede ser coma o punto y coma. */
const HEADER = ['sku', 'quantity', 'unitCost'] as const;

/** Una fila válida del archivo, con la cantidad en milésimas y el costo como texto (o null). */
export interface CsvRow {
  readonly line: number;
  readonly sku: string;
  readonly quantity: number;
  readonly unitCost: string | null;
}

/** Un error de una fila: número de línea del archivo y clave de traducción del motivo. */
export interface CsvRowError {
  readonly line: number;
  readonly key: string;
}

/** Resultado de leer el archivo. Si headerError es verdadero, no hay filas que leer. */
export interface CsvParseResult {
  readonly headerError: boolean;
  readonly rows: readonly CsvRow[];
  readonly errors: readonly CsvRowError[];
}

/**
 * Lee un archivo CSV de carga inicial de entradas: encabezado sku, quantity, unitCost. Admite coma o
 * punto y coma como separador, punto decimal, campos entre comillas dobles y líneas vacías. Valida
 * formato y deja la búsqueda del producto por SKU a quien lo usa. Función pura, sin acceso a red.
 */
export function parseInventoryCsv(text: string): CsvParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const numbered = lines
    .map((content, index) => ({ line: index + 1, content }))
    .filter((entry) => entry.content.trim() !== '');

  const header = numbered[0];
  if (header === undefined) {
    return { headerError: true, rows: [], errors: [] };
  }
  const separator = header.content.includes(';') ? ';' : ',';
  const headerFields = splitCsvFields(header.content, separator).map((field) => field.trim().toLowerCase());
  const headerOk = headerFields.length === HEADER.length && HEADER.every((name, i) => headerFields[i] === name.toLowerCase());
  if (!headerOk) {
    return { headerError: true, rows: [], errors: [] };
  }

  const rows: CsvRow[] = [];
  const errors: CsvRowError[] = [];
  for (const entry of numbered.slice(1)) {
    const fields = splitCsvFields(entry.content, separator).map((field) => field.trim());
    if (fields.length !== HEADER.length) {
      errors.push({ line: entry.line, key: 'inventory.csv.error.columns' });
      continue;
    }
    const [sku = '', quantityText = '', costText = ''] = fields;
    if (sku === '') {
      errors.push({ line: entry.line, key: 'inventory.csv.error.sku' });
      continue;
    }
    const quantity = quantityToThousandths(quantityText);
    if (quantity === null) {
      errors.push({ line: entry.line, key: 'inventory.csv.error.quantity' });
      continue;
    }
    if (costText !== '' && !AMOUNT_PATTERN.test(costText)) {
      errors.push({ line: entry.line, key: 'inventory.csv.error.unitCost' });
      continue;
    }
    rows.push({ line: entry.line, sku, quantity, unitCost: costText === '' ? null : costText });
  }
  return { headerError: false, rows, errors };
}
