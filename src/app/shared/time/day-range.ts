/**
 * Inicio y fin de un día (YYYY-MM-DD) en la hora local del navegador, como instantes ISO-8601 en
 * UTC. Los filtros de fecha del backend reciben instantes, no días.
 */
export function startOfDay(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function endOfDay(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

/** Día de hoy en la hora local, en formato YYYY-MM-DD (el que usan los campos de fecha). */
export function todayDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
