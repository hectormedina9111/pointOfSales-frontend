import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { readProblemDetail } from '../http/problem-details';
import { LanguageService } from '../i18n/language.service';
import { TranslationService } from '../i18n/translation.service';

/** Respuesta de GET /api/v1/system/info. */
export interface SystemInfo {
  readonly application: string;
  readonly version: string;
  readonly nodeRole: 'CENTRAL' | 'STORE';
  readonly nodeNumber: number;
}

export type SystemInfoState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly info: SystemInfo }
  | { readonly status: 'error'; readonly errorDetail: string | null };

/** Datos del nodo al que está conectada esta web. Se consulta al arrancar y al cambiar de idioma. */
@Injectable({ providedIn: 'root' })
export class SystemInfoService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);
  private readonly translation = inject(TranslationService);

  private readonly stateSignal = signal<SystemInfoState>({ status: 'loading' });
  readonly state = this.stateSignal.asReadonly();

  /** Nombre del nodo para la barra superior ("Central", "Tienda 1"). Vacío mientras no hay datos. */
  readonly nodeName = computed(() => {
    const current = this.stateSignal();
    if (current.status !== 'ready') {
      return '';
    }
    const { nodeRole, nodeNumber } = current.info;
    return nodeRole === 'CENTRAL'
      ? this.translation.translate('node.central')
      : this.translation.translate('node.store', { number: nodeNumber });
  });

  private requestId = 0;

  constructor() {
    // Se vuelve a consultar al cambiar de idioma, para que los errores lleguen traducidos.
    effect(() => {
      this.language.current();
      this.load();
    });
  }

  /** Consulta el nodo. Si hay dos consultas seguidas, solo se aplica la última. */
  load(): void {
    const id = ++this.requestId;
    this.stateSignal.set({ status: 'loading' });

    this.http.get<SystemInfo>('/api/v1/system/info').subscribe({
      next: (info) => {
        if (id === this.requestId) {
          this.stateSignal.set({ status: 'ready', info });
        }
      },
      error: (error: unknown) => {
        if (id === this.requestId) {
          this.stateSignal.set({ status: 'error', errorDetail: readProblemDetail(error) });
        }
      },
    });
  }
}
