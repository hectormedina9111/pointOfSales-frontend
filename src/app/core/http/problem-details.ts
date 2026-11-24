import { HttpErrorResponse } from '@angular/common/http';

/** Error de un campo, como viene en "errors" de una respuesta de validación. */
export interface ProblemFieldError {
  readonly field: string | null;
  readonly message: string;
}

/** Campos de una respuesta RFC 9457 que usa la aplicación. Todos son opcionales. */
export interface ProblemBody {
  readonly code?: string;
  readonly detail?: string;
  readonly errors?: readonly ProblemFieldError[];
}

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

/** Lee code, detail y errors de una respuesta RFC 9457. Null si el error no es una respuesta HTTP con cuerpo. */
export function readProblem(error: unknown): ProblemBody | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body = asRecord(error.error);
  if (body === null) {
    return null;
  }
  const code = body['code'];
  const detail = body['detail'];
  return {
    code: typeof code === 'string' ? code : undefined,
    detail: typeof detail === 'string' ? detail : undefined,
    errors: Array.isArray(body['errors']) ? (body['errors'] as ProblemFieldError[]) : undefined,
  };
}

/**
 * Código del error para buscar su texto ("error.<CODE>").
 * Algunos errores del backend no traen "code" (credenciales, cuenta bloqueada, errores de
 * validación), así que se deduce del estado HTTP. Sin pista, devuelve "generic".
 */
export function resolveErrorCode(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'network';
  }
  const problem = readProblem(error);
  if (problem?.code) {
    return problem.code;
  }
  if (error.status === 423) {
    return 'ACCOUNT_LOCKED';
  }
  if (error.status === 400 && problem?.errors) {
    return 'VALIDATION_FAILED';
  }
  return 'generic';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
