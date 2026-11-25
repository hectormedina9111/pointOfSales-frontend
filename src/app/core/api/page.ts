import { HttpParams } from '@angular/common/http';
import { Observable, map, of, switchMap } from 'rxjs';

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

/** Filas por petición al cargar un listado completo. */
const ALL_PAGES_SIZE = 200;

/**
 * Carga todas las páginas de un listado, para selectores y árboles de catálogo. Pide de 200
 * en 200 hasta la última página. No sirve para listados grandes: esos se paginan en pantalla.
 */
export function listAllPages<T>(
  fetchPage: (request: PageRequest) => Observable<Page<T>>,
  sort?: string,
): Observable<readonly T[]> {
  const fromPage = (page: number): Observable<readonly T[]> =>
    fetchPage({ page, size: ALL_PAGES_SIZE, sort }).pipe(
      switchMap((result): Observable<readonly T[]> =>
        result.page + 1 < result.totalPages
          ? fromPage(result.page + 1).pipe(map((rest) => [...result.content, ...rest]))
          : of(result.content),
      ),
    );
  return fromPage(0);
}
