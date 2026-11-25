/** Valor sin validar, de la URL o del formulario. */
export type RawValue = string | number | null | undefined;

/** Devuelve el valor si está en la lista de opciones; si no, "". */
export function pick<T extends string>(value: RawValue, options: readonly T[]): T | '' {
  return options.find((option) => option === value) ?? '';
}

/** Devuelve el texto si cumple el formato; si no, "". */
export function matching(value: RawValue, pattern: RegExp): string {
  const text = String(value ?? '').trim();
  return pattern.test(text) ? text : '';
}

/** Un id positivo sin ceros de más; si no es un id válido, "". */
export function idOf(value: RawValue): string {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : '';
}

/** Un día del calendario (YYYY-MM-DD) o "" si no lo es. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
