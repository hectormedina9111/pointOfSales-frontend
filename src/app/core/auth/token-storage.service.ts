import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'pos.accessToken';
const REFRESH_TOKEN_KEY = 'pos.refreshToken';

/**
 * Guarda los tokens en sessionStorage: sobreviven a recargar la pestaña, pero no pasan a
 * otras pestañas. Sin almacenamiento disponible, la sesión no se conserva al recargar.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  accessToken(): string | null {
    return readItem(ACCESS_TOKEN_KEY);
  }

  refreshToken(): string | null {
    return readItem(REFRESH_TOKEN_KEY);
  }

  save(accessToken: string, refreshToken: string): void {
    writeItem(ACCESS_TOKEN_KEY, accessToken);
    writeItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clear(): void {
    removeItem(ACCESS_TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
  }
}

function readItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    // Sin almacenamiento no hay sesión guardada.
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento la sesión solo dura mientras no se recargue la página.
  }
}

function removeItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}
