import { StoreNodeView } from '../../core/api/store-nodes-api';

/**
 * Porcentaje de la réplica de una tienda: versión descargada frente a la última de la central.
 * Sin cambios en la central (última versión 0) la tienda está al día.
 */
export function downloadProgress(node: StoreNodeView): number {
  if (node.latestVersion <= 0) {
    return 100;
  }
  const downloaded = node.lastDownloadVersion ?? 0;
  return Math.min(100, Math.round((downloaded / node.latestVersion) * 100));
}
