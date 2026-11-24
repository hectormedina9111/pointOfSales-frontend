import { inject, Pipe, PipeTransform } from '@angular/core';

import { TranslationParams, TranslationService } from '../../core/i18n/translation.service';

/**
 * Traduce una clave: {{ 'home.title' | translate }}.
 * Es impura para que se vuelva a evaluar al cambiar de idioma o al cargar el diccionario.
 */
@Pipe({
  name: 'translate',
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(key: string, params?: TranslationParams): string {
    return this.translation.translate(key, params);
  }
}
