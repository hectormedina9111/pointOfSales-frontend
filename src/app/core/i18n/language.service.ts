import { Injectable, signal } from '@angular/core';

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const DEFAULT_LANGUAGE: Language = 'es';
const STORAGE_KEY = 'pos.language';

/**
 * Idioma activo. No depende de HttpClient, para que el interceptor de idioma
 * pueda leerlo sin crear una dependencia circular.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly languageSignal = signal<Language>(readStoredLanguage());

  readonly current = this.languageSignal.asReadonly();

  constructor() {
    document.documentElement.lang = this.languageSignal();
  }

  set(language: Language): void {
    this.languageSignal.set(language);
    document.documentElement.lang = language;
    writeStoredLanguage(language);
  }
}

function isLanguage(value: string | null): value is Language {
  return LANGUAGES.some((language) => language === value);
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function writeStoredLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento el idioma vuelve al valor por defecto al recargar.
  }
}
