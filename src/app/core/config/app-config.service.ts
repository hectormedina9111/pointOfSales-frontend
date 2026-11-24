import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Forma de public/config.json (o del config.json que genera nginx al arrancar el contenedor). */
interface RuntimeConfig {
  apiBaseUrl?: unknown;
}

const CONFIG_URL = '/config.json';

/**
 * Configuración que cambia por nodo y no se compila: se lee de /config.json antes de
 * mostrar la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);

  private readonly apiBaseUrlSignal = signal('');

  /** Dirección del backend al que se conecta esta web, sin barra final. Vacía = mismo origen. */
  readonly apiBaseUrl = this.apiBaseUrlSignal.asReadonly();

  /** Nunca falla: si no se puede leer el archivo, las llamadas van al mismo origen. */
  async load(): Promise<void> {
    try {
      const config = await firstValueFrom(this.http.get<RuntimeConfig>(CONFIG_URL));
      this.apiBaseUrlSignal.set(normalizeBaseUrl(config.apiBaseUrl));
    } catch {
      console.warn('Could not load /config.json; API calls will use the same origin.');
    }
  }
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\/+$/, '');
}
