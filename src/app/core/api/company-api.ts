import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Empresa (record CompanyView del backend). */
export interface CompanyView {
  readonly id: number;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly currency: string;
  readonly timeZone: string;
}

/** Body de PUT /api/v1/company (record CompanyRequest). */
export interface CompanyRequest {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly currency: string;
  readonly timeZone: string;
}

/**
 * Llamadas a /api/v1/company. Escrito a mano hasta que `npm run api:update` genere src/app/api
 * a partir del OpenAPI del backend.
 */
@Injectable({ providedIn: 'root' })
export class CompanyApi {
  private readonly http = inject(HttpClient);

  /** Responde 404 mientras la empresa no esté configurada con PUT. */
  get(): Observable<CompanyView> {
    return this.http.get<CompanyView>('/api/v1/company');
  }

  configure(body: CompanyRequest): Observable<CompanyView> {
    return this.http.put<CompanyView>('/api/v1/company', body);
  }
}
