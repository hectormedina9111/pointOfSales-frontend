import { Injectable, computed, inject, signal } from '@angular/core';
import { Params, Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  of,
  share,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { AuthApi } from '../api/auth-api';
import { MeApi, MenuItem, UserProfile } from '../api/me-api';
import { PrivilegesService } from './privileges.service';
import { TokenStorageService } from './token-storage.service';

/**
 * Sesión del usuario: tokens, perfil, menú y privilegios.
 * Las pantallas leen las señales; las acciones que llaman al backend devuelven un Observable.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApi);
  private readonly meApi = inject(MeApi);
  private readonly tokens = inject(TokenStorageService);
  private readonly privileges = inject(PrivilegesService);
  private readonly router = inject(Router);

  private readonly userSignal = signal<UserProfile | null>(null);
  private readonly menusSignal = signal<readonly MenuItem[]>([]);

  readonly user = this.userSignal.asReadonly();
  readonly menus = this.menusSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly mustChangePassword = computed(() => this.userSignal()?.mustChangePassword === true);

  /** Renovación en curso: las peticiones que reciben 401 a la vez esperan la misma respuesta. */
  private refreshInFlight: Observable<void> | null = null;

  accessToken(): string | null {
    return this.tokens.accessToken();
  }

  /** Inicia sesión y carga el perfil. Con cambio de contraseña pendiente, no carga menús ni privilegios. */
  login(username: string, password: string): Observable<void> {
    return this.authApi.login({ username, password }).pipe(
      tap((pair) => this.tokens.save(pair.accessToken, pair.refreshToken)),
      switchMap(() => this.loadCurrentUser()),
      catchError((error: unknown) => {
        this.clearSession();
        return throwError(() => error);
      }),
    );
  }

  /**
   * Al arrancar, recupera la sesión guardada en sessionStorage. Nunca falla: si no se
   * puede recuperar, la sesión queda cerrada y la guarda de rutas envía al inicio de sesión.
   */
  async restoreSession(): Promise<void> {
    if (this.tokens.accessToken() === null) {
      return;
    }
    try {
      await firstValueFrom(this.loadCurrentUser());
    } catch {
      this.clearSession();
    }
  }

  /**
   * Cierra la sesión en el cliente de inmediato y avisa al backend para revocar el refresco.
   * Si el backend no responde, la sesión ya está cerrada aquí.
   */
  logout(queryParams?: Params): void {
    const refreshToken = this.tokens.refreshToken();
    this.clearSession();
    if (refreshToken !== null) {
      this.authApi.logout({ refreshToken }).subscribe({ error: () => undefined });
    }
    void this.router.navigate(['/login'], { queryParams });
  }

  /**
   * Renueva los tokens después de un 401 de la petición que usó failedToken.
   * Si otra petición ya renovó la sesión, no vuelve a pedirlo.
   */
  refreshAfterUnauthorized(failedToken: string): Observable<void> {
    if (this.tokens.accessToken() !== failedToken) {
      return of<void>(undefined);
    }
    this.refreshInFlight ??= this.requestRefresh();
    return this.refreshInFlight;
  }

  private requestRefresh(): Observable<void> {
    return this.authApi.refresh({ refreshToken: this.tokens.refreshToken() ?? '' }).pipe(
      tap((pair) => this.tokens.save(pair.accessToken, pair.refreshToken)),
      map((): void => undefined),
      catchError((error: unknown) => {
        this.clearSession();
        void this.router.navigate(['/login']);
        return throwError(() => error);
      }),
      finalize(() => {
        this.refreshInFlight = null;
      }),
      share(),
    );
  }

  private loadCurrentUser(): Observable<void> {
    return this.meApi.profile().pipe(
      switchMap((user) => {
        if (user.mustChangePassword) {
          // Con la contraseña pendiente el backend no entrega menús ni privilegios.
          this.setSession(user, [], []);
          return of<void>(undefined);
        }
        return forkJoin({ menus: this.meApi.menus(), privileges: this.meApi.privileges() }).pipe(
          map(({ menus, privileges }) => this.setSession(user, menus, privileges)),
        );
      }),
    );
  }

  private setSession(user: UserProfile, menus: readonly MenuItem[], privilegeCodes: readonly string[]): void {
    this.privileges.set(privilegeCodes);
    this.menusSignal.set(menus);
    this.userSignal.set(user);
  }

  private clearSession(): void {
    this.tokens.clear();
    this.privileges.clear();
    this.menusSignal.set([]);
    this.userSignal.set(null);
  }
}
