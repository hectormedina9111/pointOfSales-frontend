import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, map, switchMap } from 'rxjs';

import { InventoryApi, InventoryAvailabilityView } from '../../../core/api/inventory-api';

/** Pausa tras cambiar el conjunto de productos antes de pedir existencias, en milisegundos. */
export const AVAILABILITY_DEBOUNCE_MS = 300;

/** Máximo de productos por consulta, igual que en el backend. */
export const AVAILABILITY_MAX_IDS = 100;

/**
 * Existencias de los productos que se ven en la orden (resultados de búsqueda y líneas). Cada cambio
 * del conjunto de productos pide las existencias una vez, con pausa. Vive en el paso de productos,
 * así que se descarta con él. Los productos que no controlan inventario llegan con tracksInventory en
 * falso y la pantalla no los muestra.
 */
@Injectable()
export class OrderAvailabilityStore {
  private readonly api = inject(InventoryApi);
  private readonly productIds = new Subject<readonly number[]>();

  /** Existencia por id de producto; un producto aparece cuando llega su respuesta. */
  readonly byProduct = signal<ReadonlyMap<number, InventoryAvailabilityView>>(new Map());
  readonly error = signal<unknown>(null);

  constructor() {
    this.productIds
      .pipe(
        debounceTime(AVAILABILITY_DEBOUNCE_MS),
        map((ids) => ids.slice(0, AVAILABILITY_MAX_IDS)),
        switchMap((ids) =>
          ids.length === 0
            ? EMPTY
            : this.api.availability(ids).pipe(
                map((rows) => ({ rows })),
                catchError((error: unknown) => {
                  this.error.set(error);
                  return EMPTY;
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ rows }) => {
        this.error.set(null);
        this.byProduct.update((current) => {
          const next = new Map(current);
          for (const row of rows) {
            next.set(row.productId, row);
          }
          return next;
        });
      });
  }

  /** Pide las existencias de los productos dados. Llamar solo cuando cambia el conjunto. */
  watch(productIds: readonly number[]): void {
    this.productIds.next(productIds);
  }
}
