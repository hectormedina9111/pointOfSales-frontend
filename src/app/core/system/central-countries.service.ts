import { Injector, inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, filter, of, switchMap, take } from 'rxjs';

import { CountriesApi, CountryView } from '../api/countries-api';
import { listAllPages } from '../api/page';
import { SystemInfoService } from './system-info.service';

/**
 * Países para los listados y selectores. Los países solo existen en la central: en una tienda no
 * se pide nada y la lista sale vacía. Espera a conocer el nodo antes de decidir.
 */
@Injectable({ providedIn: 'root' })
export class CentralCountriesService {
  private readonly api = inject(CountriesApi);
  private readonly systemInfo = inject(SystemInfoService);
  private readonly injector = inject(Injector);

  /** Todos los países de la central; en una tienda o si no se conoce el nodo, lista vacía. */
  list(): Observable<readonly CountryView[]> {
    return toObservable(this.systemInfo.state, { injector: this.injector }).pipe(
      filter((state) => state.status !== 'loading'),
      take(1),
      switchMap((state) =>
        state.status === 'ready' && state.info.nodeRole === 'CENTRAL'
          ? listAllPages((request) => this.api.list(request), 'isoCode')
          : of<readonly CountryView[]>([]),
      ),
    );
  }
}
