import { SerialMode } from '../../core/api/products-api';

/**
 * Reglas de la configuración de serie (ver "Tres configuraciones de serie" en el plan). Las
 * pantallas preguntan aquí en lugar de comparar el modo en la plantilla.
 */

/** Un producto con serie manual o de lista: en ventas y devoluciones se pide una serie por unidad. */
export function needsSerialPerUnit(mode: SerialMode): boolean {
  return mode !== 'NONE';
}

/** Solo las series de lista son equipos cargados antes: inventario, transferencias y carga de equipos. */
export function isEquipmentSerial(mode: SerialMode): boolean {
  return mode === 'LIST';
}
