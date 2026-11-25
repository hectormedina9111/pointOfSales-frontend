/**
 * Color de la diferencia de caja: rojo si falta dinero, amarillo si sobra y verde si cuadra.
 * Compara en centavos para no depender de la coma flotante. Null (sesión abierta) no tiene color.
 */
export function differenceBadgeClass(difference: number | null): string | null {
  if (difference === null) {
    return null;
  }
  const cents = Math.round(difference * 100);
  if (cents < 0) {
    return 'text-bg-danger';
  }
  return cents > 0 ? 'text-bg-warning' : 'text-bg-success';
}
