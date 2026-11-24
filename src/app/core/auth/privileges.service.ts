import { Injectable, signal } from '@angular/core';

/**
 * Privilegios del usuario que ha iniciado sesión (códigos como POST_PRODUCTS).
 * Los botones y las acciones consultan has(); no se fijan roles en el código.
 */
@Injectable({ providedIn: 'root' })
export class PrivilegesService {
  private readonly codesSignal = signal<ReadonlySet<string>>(new Set());

  has(code: string): boolean {
    return this.codesSignal().has(code);
  }

  set(codes: readonly string[]): void {
    this.codesSignal.set(new Set(codes));
  }

  clear(): void {
    this.codesSignal.set(new Set());
  }
}
