import { signal } from '@angular/core';
import { Observable } from 'rxjs';

import { Page, PageRequest } from '../../core/api/page';

/** Filas por página al abrir un listado. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Estado de un listado paginado: página, tamaño, total y filas. Cada pantalla crea una
 * instancia con la llamada a la API y llama a load(). Si hay dos cargas seguidas, solo se
 * aplica la última. La página empieza en 0, como en el backend.
 */
export class PagedList<T> {
  private readonly itemsSignal = signal<readonly T[]>([]);
  private readonly pageSignal = signal(0);
  private readonly sizeSignal = signal(DEFAULT_PAGE_SIZE);
  private readonly totalSignal = signal(0);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<unknown>(null);
  private requestId = 0;

  readonly items = this.itemsSignal.asReadonly();
  readonly page = this.pageSignal.asReadonly();
  readonly size = this.sizeSignal.asReadonly();
  readonly total = this.totalSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * @param loader llamada a la API para una página.
   * @param sort orden por defecto, por ejemplo "username" o "occurredAt,desc".
   * @param pageSize filas por página al abrir el listado (por defecto, DEFAULT_PAGE_SIZE).
   */
  constructor(
    private readonly loader: (request: PageRequest) => Observable<Page<T>>,
    private readonly sort?: string,
    pageSize?: number,
  ) {
    if (pageSize !== undefined) {
      this.sizeSignal.set(pageSize);
    }
  }

  load(): void {
    const id = ++this.requestId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.loader({ page: this.pageSignal(), size: this.sizeSignal(), sort: this.sort }).subscribe({
      next: (result) => {
        if (id !== this.requestId) {
          return;
        }
        this.itemsSignal.set(result.content);
        this.totalSignal.set(result.totalElements);
        this.loadingSignal.set(false);
      },
      error: (error: unknown) => {
        if (id !== this.requestId) {
          return;
        }
        this.errorSignal.set(error);
        this.loadingSignal.set(false);
      },
    });
  }

  goToPage(page: number): void {
    this.pageSignal.set(page);
    this.load();
  }

  setSize(size: number): void {
    this.sizeSignal.set(size);
    this.pageSignal.set(0);
    this.load();
  }

  /** Vuelve a la primera página y carga; se usa al cambiar los filtros. */
  restart(): void {
    this.pageSignal.set(0);
    this.load();
  }
}
