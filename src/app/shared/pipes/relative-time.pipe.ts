import { inject, Pipe, PipeTransform } from '@angular/core';

import { TranslationService } from '../../core/i18n/translation.service';
import { parseInstant } from '../time/parse-instant';

/**
 * Tiempo relativo con el idioma activo: "hace 12 s", "12 s ago". Recibe una fecha ISO o un Date.
 * Es impura para que se recalcule con cada detección de cambios (las pantallas de réplica
 * refrescan cada pocos segundos).
 */
@Pipe({
  name: 'relativeTime',
  pure: false,
})
export class RelativeTimePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(value: string | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return this.translation.translate('time.never');
    }
    const time = value instanceof Date ? value.getTime() : parseInstant(value);
    if (Number.isNaN(time)) {
      return this.translation.translate('time.never');
    }
    // Un reloj de tienda un poco adelantado no debe mostrar tiempos negativos.
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 5) {
      return this.translation.translate('time.justNow');
    }
    if (seconds < 60) {
      return this.translation.translate('time.seconds', { count: seconds });
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return this.translation.translate('time.minutes', { count: minutes });
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return this.translation.translate('time.hours', { count: hours });
    }
    return this.translation.translate('time.days', { count: Math.floor(hours / 24) });
  }
}
