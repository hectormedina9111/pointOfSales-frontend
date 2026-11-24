import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AppConfigService } from '../config/app-config.service';

/**
 * Antepone la dirección del backend (apiBaseUrl de config.json) a las llamadas /api/...
 * Otras rutas, como /config.json o /i18n/..., no se tocan.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }
  const baseUrl = inject(AppConfigService).apiBaseUrl();
  return next(req.clone({ url: `${baseUrl}${req.url}` }));
};
