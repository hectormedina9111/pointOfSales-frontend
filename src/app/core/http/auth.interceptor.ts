import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';

/**
 * Añade el token de acceso a las llamadas /api/. Si la API responde 401, renueva la sesión
 * una sola vez y repite la petición. Si la renovación falla, la sesión se cierra.
 * Las llamadas a /api/v1/auth/ no llevan token: son las que lo obtienen.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!requiresSession(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.accessToken();

  return next(withBearer(req, token)).pipe(
    catchError((error: unknown) => {
      if (token === null || !(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return auth.refreshAfterUnauthorized(token).pipe(
        switchMap(() => next(withBearer(req, auth.accessToken()))),
      );
    }),
  );
};

function requiresSession(url: string): boolean {
  return url.includes('/api/') && !url.includes('/api/v1/auth/');
}

function withBearer(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token === null ? req : req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
