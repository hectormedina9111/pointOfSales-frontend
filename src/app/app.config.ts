import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiPrefixInterceptor } from './core/http/api-prefix.interceptor';
import { languageInterceptor } from './core/http/language.interceptor';
import { TranslationService } from './core/i18n/translation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiPrefixInterceptor, languageInterceptor])),
    // Carga el diccionario del idioma guardado antes de mostrar la aplicación.
    provideAppInitializer(() => inject(TranslationService).load()),
  ],
};
