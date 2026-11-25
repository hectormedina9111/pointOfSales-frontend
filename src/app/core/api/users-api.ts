import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest, pageParams } from './page';

/** Usuario (record UserView del backend). Nunca incluye la contraseña. */
export interface UserView {
  readonly id: number;
  readonly username: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly externalCode: string | null;
  readonly active: boolean;
  readonly mustChangePassword: boolean;
  readonly roles: readonly string[];
  readonly branchIds: readonly number[];
}

/** Body de POST /api/v1/users (record CreateUserRequest). */
export interface CreateUserRequest {
  readonly username: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly externalCode: string | null;
  readonly roleCodes: readonly string[];
  readonly initialPassword: string;
}

/** Body de PUT /api/v1/users/{id} (record UpdateUserRequest). El usuario y la contraseña no cambian aquí. */
export interface UpdateUserRequest {
  readonly fullName: string;
  readonly email: string | null;
  readonly externalCode: string | null;
  readonly active: boolean;
  readonly roleCodes: readonly string[];
}

/** Body de POST /api/v1/users/{id}/password-reset (record PasswordResetRequest). */
export interface PasswordResetRequest {
  readonly newPassword: string;
}

/**
 * Llamadas a /api/v1/users. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(request: PageRequest): Observable<Page<UserView>> {
    return this.http.get<Page<UserView>>('/api/v1/users', { params: pageParams(request) });
  }

  create(body: CreateUserRequest): Observable<UserView> {
    return this.http.post<UserView>('/api/v1/users', body);
  }

  update(id: number, body: UpdateUserRequest): Observable<UserView> {
    return this.http.put<UserView>(`/api/v1/users/${id}`, body);
  }

  /** Devuelve 204 sin cuerpo: la contraseña la pone quien administra y el usuario la cambia al entrar. */
  resetPassword(id: number, body: PasswordResetRequest): Observable<void> {
    return this.http.post<void>(`/api/v1/users/${id}/password-reset`, body);
  }

  branchIds(id: number): Observable<readonly number[]> {
    return this.http.get<readonly number[]>(`/api/v1/users/${id}/branches`);
  }

  replaceBranches(id: number, branchIds: readonly number[]): Observable<readonly number[]> {
    return this.http.put<readonly number[]>(`/api/v1/users/${id}/branches`, { branchIds });
  }
}
