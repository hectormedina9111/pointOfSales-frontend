import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Language, LanguageService } from './language.service';

type Dictionary = Readonly<Record<string, string>>;

/** Valores para reemplazar los marcadores {nombre} de un texto. */
export type TranslationParams = Readonly<Record<string, string | number>>;

/**
 * Traducciones propias: carga public/i18n/{idioma}.json y reemplaza marcadores.
 * Si una clave no existe, devuelve la propia clave para que el fallo sea visible.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly http = inject(HttpClient);
  private readonly languageService = inject(LanguageService);

  private readonly dictionary = signal<Dictionary>({});

  /** Carga el diccionario del idioma activo. Nunca falla: sin diccionario se muestran las claves. */
  load(): Promise<void> {
    return this.fetchDictionary(this.languageService.current());
  }

  /** Cambia el idioma y carga su diccionario; el anterior sigue visible mientras tanto. */
  async setLanguage(language: Language): Promise<void> {
    this.languageService.set(language);
    await this.fetchDictionary(language);
  }

  translate(key: string, params?: TranslationParams): string {
    const text = this.dictionary()[key] ?? key;
    if (!params) {
      return text;
    }
    return text.replace(/\{(\w+)\}/g, (marker: string, name: string) =>
      name in params ? String(params[name]) : marker,
    );
  }

  private async fetchDictionary(language: Language): Promise<void> {
    try {
      const dictionary = await firstValueFrom(
        this.http.get<Dictionary>(`/i18n/${language}.json`),
      );
      // Solo se aplica si durante la descarga no se cambió de idioma otra vez.
      if (language === this.languageService.current()) {
        this.dictionary.set(dictionary);
      }
    } catch {
      console.warn(`No se pudo cargar el diccionario de idioma "${language}".`);
    }
  }
}
