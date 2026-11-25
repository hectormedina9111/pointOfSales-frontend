import { Signal, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, filter, fromEvent, interval, map, merge, startWith, switchMap } from 'rxjs';

/** Cada cuánto se refrescan las pantallas de réplica: lo bastante para ver bajar los pendientes. */
export const AUTO_REFRESH_MS = 5000;

/** Emite cada intervalo mientras la pestaña está visible, y al volver a mostrarla. */
function visibleTicks(intervalMs: number): Observable<void> {
  const visible = (): boolean => !document.hidden;
  const tick$ = interval(intervalMs).pipe(filter(visible));
  const back$ = fromEvent(document, 'visibilitychange').pipe(filter(visible));
  return merge(tick$, back$).pipe(map(() => undefined));
}

/**
 * Llama a refresh() de inmediato cuando enabled pasa a verdadero, y después cada intervalo mientras
 * enabled siga siendo verdadero y la pestaña esté visible. Se para al destruir el componente.
 * Debe llamarse en un contexto de inyección (constructor o inicializador de campo).
 */
export function autoRefresh(enabled: Signal<boolean>, refresh: () => void, intervalMs = AUTO_REFRESH_MS): void {
  toObservable(enabled)
    .pipe(
      switchMap((on) => (on ? visibleTicks(intervalMs).pipe(startWith(undefined)) : EMPTY)),
      takeUntilDestroyed(),
    )
    .subscribe(() => refresh());
}
