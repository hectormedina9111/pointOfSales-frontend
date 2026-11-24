import { AuditLogView } from '../../core/api/audit-api';

/** Línea de un JSON formateado. changed marca las líneas de una clave que cambió entre antes y después. */
export interface ChangeLine {
  readonly text: string;
  readonly changed: boolean;
}

/** Líneas de los valores anteriores y posteriores de una entrada de auditoría. */
export interface ChangeView {
  readonly before: readonly ChangeLine[];
  readonly after: readonly ChangeLine[];
}

/** Clave de primer nivel al inicio de una línea de JSON formateado con dos espacios de sangría. */
const TOP_LEVEL_KEY = /^ {2}("(?:[^"\\]|\\.)*"):/;

/**
 * Formatea los valores antes y después de una entrada. Una clave está cambiada si su valor JSON
 * es distinto en ambos lados (una clave que solo existe en uno también cuenta).
 */
export function changeView(entry: AuditLogView): ChangeView {
  const oldValues: Readonly<Record<string, unknown>> = entry.oldValues ?? {};
  const newValues: Readonly<Record<string, unknown>> = entry.newValues ?? {};
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changedKeys = new Set(
    [...keys].filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])),
  );
  return {
    before: formatLines(oldValues, changedKeys),
    after: formatLines(newValues, changedKeys),
  };
}

/** Las líneas de una clave pertenecen a esa clave hasta la siguiente clave de primer nivel. */
function formatLines(values: Readonly<Record<string, unknown>>, changedKeys: ReadonlySet<string>): ChangeLine[] {
  let inChangedKey = false;
  return JSON.stringify(values, null, 2)
    .split('\n')
    .map((text) => {
      const match = TOP_LEVEL_KEY.exec(text);
      if (match) {
        inChangedKey = changedKeys.has(JSON.parse(match[1]) as string);
      }
      const brace = text === '{' || text === '}';
      return { text, changed: !brace && inChangedKey };
    });
}
