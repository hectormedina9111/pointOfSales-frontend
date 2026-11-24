import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ServerSelectorService } from '../server-selector.service';

/** Antepone el prefijo del nodo seleccionado a las llamadas /api/... */
export const apiPrefixInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }
  const prefix = inject(ServerSelectorService).selected().prefix;
  return next(req.clone({ url: `${prefix}${req.url}` }));
};
