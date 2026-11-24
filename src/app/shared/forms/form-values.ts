/** Texto sin espacios; cadena vacía se convierte en null (campos opcionales del backend). */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Estado marcado de una casilla de verificación, leído desde su evento change. */
export function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}
