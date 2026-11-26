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

/** Tipo de dato de una característica de equipo (enum AttributeDataType del backend). */
export type AttributeDataType = 'TEXT' | 'NUMBER' | 'DATE' | 'LIST';

/**
 * Característica que todos los equipos de una categoría llevan (record AttributeView). options solo
 * tiene valores en tipo LIST; en los demás tipos es null.
 */
export interface AttributeView {
  readonly id: number;
  readonly categoryId: number;
  readonly code: string;
  readonly name: string;
  readonly dataType: AttributeDataType;
  readonly options: readonly string[] | null;
  readonly required: boolean;
  readonly sortOrder: number;
  readonly active: boolean;
}

/** Body de POST y PUT de una característica. El código no cambia después de creada. */
export interface AttributeRequest {
  readonly code: string;
  readonly name: string;
  readonly dataType: AttributeDataType;
  readonly options: readonly string[] | null;
  readonly required: boolean;
  readonly sortOrder: number;
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

  /** Características de los equipos de la categoría, sin paginar. Incluye las inactivas. */
  attributes(categoryId: number): Observable<readonly AttributeView[]> {
    return this.http.get<readonly AttributeView[]>(`/api/v1/categories/${categoryId}/attributes`);
  }

  createAttribute(categoryId: number, body: AttributeRequest): Observable<AttributeView> {
    return this.http.post<AttributeView>(`/api/v1/categories/${categoryId}/attributes`, body);
  }

  updateAttribute(categoryId: number, attributeId: number, body: AttributeRequest): Observable<AttributeView> {
    return this.http.put<AttributeView>(`/api/v1/categories/${categoryId}/attributes/${attributeId}`, body);
  }

  /** Desactiva la característica (DELETE no borra). Los equipos conservan el valor que ya tienen. */
  deactivateAttribute(categoryId: number, attributeId: number): Observable<AttributeView> {
    return this.http.delete<AttributeView>(`/api/v1/categories/${categoryId}/attributes/${attributeId}`);
  }
}
