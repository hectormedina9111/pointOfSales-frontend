import { HttpParams } from '@angular/common/http';

/** Página de un listado (record PageResponse del backend). La página empieza en 0. */
export interface Page<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/** Paginación de un listado: page, size y sort con el formato "campo,asc". */
export interface PageRequest {
  readonly page: number;
  readonly size: number;
  readonly sort?: string;
}

/** Convierte la paginación en parámetros de la URL. */
export function pageParams(request: PageRequest): HttpParams {
  let params = new HttpParams().set('page', request.page).set('size', request.size);
  if (request.sort !== undefined) {
    params = params.set('sort', request.sort);
  }
  return params;
}
