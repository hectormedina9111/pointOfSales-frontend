import { inject, Pipe, PipeTransform } from '@angular/core';

import { LanguageService } from '../../core/i18n/language.service';
import { parseInstant } from '../time/parse-instant';

/**
 * Fecha y hora en la zona horaria del navegador, con el formato del idioma activo.
 * Las fechas llegan en UTC (ISO-8601) desde el backend. Es impura para seguir al idioma.
 */
@Pipe({
  name: 'localDateTime',
  pure: false,
})
export class LocalDateTimePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const date = value instanceof Date ? value : new Date(parseInstant(value));
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(date);
  }
}
