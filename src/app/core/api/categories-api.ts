import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Categoría de producto (record CategoryView del backend). parentId es null en la categoría principal. */
export interface CategoryView {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  readonly active: boolean;
}

/** Body de POST y PUT /api/v1/categories (record CategoryRequest). */
export interface CategoryRequest {
  readonly name: string;
  readonly parentId: number | null;
  readonly active: boolean;
}

/**
 * Llamadas a /api/v1/categories. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<CategoryView>> {
    return this.http.get<Page<CategoryView>>('/api/v1/categories', { params: pageParams(request) });
  }

  create(body: CategoryRequest): Observable<CategoryView> {
    return this.http.post<CategoryView>('/api/v1/categories', body);
  }

  update(id: number, body: CategoryRequest): Observable<CategoryView> {
    return this.http.put<CategoryView>(`/api/v1/categories/${id}`, body);
  }

  /** Desactiva la categoría (DELETE no borra). Devuelve la categoría desactivada. */
  deactivate(id: number): Observable<CategoryView> {
    return this.http.delete<CategoryView>(`/api/v1/categories/${id}`);
  }
}
