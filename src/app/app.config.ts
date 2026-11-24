import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { AppConfigService } from './core/config/app-config.service';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { languageInterceptor } from './core/http/language.interceptor';
import { TranslationService } from './core/i18n/translation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    // El interceptor de sesión va al final: para entonces la URL ya es la del backend.
    provideHttpClient(withInterceptors([apiBaseUrlInterceptor, languageInterceptor, authInterceptor])),
    // La sesión guardada necesita la dirección del backend, así que se restaura después de leer config.json.
    provideAppInitializer(() => {
      const config = inject(AppConfigService);
      const auth = inject(AuthService);
      return config.load().then(() => auth.restoreSession());
    }),
    // Carga el diccionario del idioma guardado antes de mostrar la aplicación.
    provideAppInitializer(() => inject(TranslationService).load()),
  ],
};
