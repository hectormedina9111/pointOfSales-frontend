import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { LanguageService } from '../i18n/language.service';

/** Envía el idioma activo en Accept-Language para que el backend responda en ese idioma. */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  const language = inject(LanguageService).current();
  return next(req.clone({ setHeaders: { 'Accept-Language': language } }));
};
