import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AppConfigService } from './core/config/app-config.service';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { languageInterceptor } from './core/http/language.interceptor';
import { TranslationService } from './core/i18n/translation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiBaseUrlInterceptor, languageInterceptor])),
    // Carga la configuración del nodo y el diccionario del idioma guardado antes de mostrar la aplicación.
    provideAppInitializer(() => inject(AppConfigService).load()),
    provideAppInitializer(() => inject(TranslationService).load()),
  ],
};
