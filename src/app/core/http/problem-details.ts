import { HttpErrorResponse } from '@angular/common/http';

/**
 * Devuelve el campo "detail" de una respuesta RFC 9457 (application/problem+json),
 * o null si el error no lo trae.
 */
export function readProblemDetail(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
    return body.detail;
  }
  return null;
}
