import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Respuesta de login y de refresh (record TokenPair del backend). */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Vida del token de acceso, en segundos. */
  readonly expiresIn: number;
  readonly mustChangePassword: boolean;
}

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}

export interface RefreshTokenRequest {
  readonly refreshToken: string;
}

/**
 * Llamadas a /api/v1/auth. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest): Observable<TokenPair> {
    return this.http.post<TokenPair>('/api/v1/auth/login', body);
  }

  refresh(body: RefreshTokenRequest): Observable<TokenPair> {
    return this.http.post<TokenPair>('/api/v1/auth/refresh', body);
  }

  logout(body: RefreshTokenRequest): Observable<void> {
    return this.http.post<void>('/api/v1/auth/logout', body);
  }
}
