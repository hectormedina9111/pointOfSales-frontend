import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Usuario que ha iniciado sesión (record UserProfile del backend). */
export interface UserProfile {
  readonly id: number;
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly string[];
  readonly mustChangePassword: boolean;
}

/** Nodo del menú que puede ver el usuario (record MenuItem del backend). Los grupos no tienen ruta. */
export interface MenuItem {
  readonly code: string;
  readonly name: string;
  readonly route: string | null;
  readonly icon: string | null;
  readonly children: readonly MenuItem[];
}

export interface PasswordChangeRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/** Respuesta de GET /api/v1/me/privileges: { codes: [...] }. */
interface PrivilegeCodes {
  readonly codes: readonly string[];
}

/**
 * Llamadas a /api/v1/me. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class MeApi {
  private readonly http = inject(HttpClient);

  profile(): Observable<UserProfile> {
    return this.http.get<UserProfile>('/api/v1/me');
  }

  /** Solo se llama cuando el usuario ya no tiene que cambiar la contraseña. */
  menus(): Observable<readonly MenuItem[]> {
    return this.http.get<readonly MenuItem[]>('/api/v1/me/menus');
  }

  /** Solo se llama cuando el usuario ya no tiene que cambiar la contraseña. */
  privileges(): Observable<readonly string[]> {
    return this.http.get<PrivilegeCodes>('/api/v1/me/privileges').pipe(map((response) => response.codes));
  }

  changePassword(body: PasswordChangeRequest): Observable<void> {
    return this.http.post<void>('/api/v1/me/password', body);
  }
}
