import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { MovementReferenceType } from '../../../core/api/inventory-api';
import { SerialStatus, SerialTraceView, SerialsApi } from '../../../core/api/serials-api';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { movementReferenceLink } from '../shared/movement-link';
import { idOf } from '../shared/inventory-query';

/** Estado de la búsqueda: cargando, error o las filas que devolvió el servidor. */
interface SearchState {
  readonly loading: boolean;
  readonly error: unknown;
  readonly rows: readonly SerialTraceView[];
}

const IDLE: SearchState = { loading: false, error: null, rows: [] };

/** Número de serie de la URL, sin espacios sobrantes; "" si no hay búsqueda. */
function serialOf(params: ParamMap): string {
  return (params.get('serialNumber') ?? '').trim();
}

/** Clase del badge de cada estado del serial. */
const STATUS_CLASS: Readonly<Record<SerialStatus, string>> = {
  AVAILABLE: 'text-bg-success',
  SOLD: 'text-bg-secondary',
  IN_TRANSIT: 'text-bg-info',
  REMOVED: 'text-bg-dark',
};

/**
 * Rastreo de seriales por número. La búsqueda vive en la URL (serialNumber), así el enlace se puede
 * guardar. Como varios productos pueden compartir un número, cada fila es un producto; el rastreo
 * (traceId en la URL) lista sus movimientos, con enlace a su documento o venta. Si solo hay una fila,
 * se muestra sin tener que elegirla.
 */
@Component({
  selector: 'app-serial-search',
  imports: [ReactiveFormsModule, RouterLink, FieldLabelComponent, ProblemAlertComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './serial-search.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialSearchComponent {
  private readonly serials = inject(SerialsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.group({ serialNumber: '' });

  /** Parámetros de la URL: el número buscado y el rastreo elegido. */
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly serialNumber = computed(() => serialOf(this.params()));
  /** Id de la fila en rastreo (traceId de la URL); null si no hay o no es un id. */
  private readonly traceId = computed(() => {
    const text = idOf(this.params().get('traceId'));
    return text === '' ? null : Number(text);
  });

  /** Cada cambio del número en la URL cancela la búsqueda anterior. */
  protected readonly search = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => serialOf(params)),
      switchMap((serial) =>
        serial === ''
          ? of(IDLE)
          : this.serials.trace(serial, null).pipe(
              map((rows): SearchState => ({ loading: false, error: null, rows })),
              startWith<SearchState>({ loading: true, error: null, rows: [] }),
              catchError((error: unknown) => of<SearchState>({ loading: false, error, rows: [] })),
            ),
      ),
    ),
    { requireSync: true },
  );

  /** Fila elegida para el rastreo: la de traceId, o la única fila si solo hay una. */
  protected readonly selected = computed<SerialTraceView | null>(() => {
    const rows = this.search().rows;
    const id = this.traceId();
    return rows.find((row) => row.id === id) ?? (rows.length === 1 ? (rows[0] ?? null) : null);
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.form.patchValue({ serialNumber: serialOf(params) }, { emitEvent: false });
    });
  }

  protected submit(): void {
    const serial = this.form.getRawValue().serialNumber.trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { serialNumber: serial || null, traceId: null },
    });
  }

  protected trace(row: SerialTraceView): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { traceId: row.id } });
  }

  protected statusClass(status: SerialStatus): string {
    return STATUS_CLASS[status];
  }

  /** Ruta del documento o venta de un movimiento; null si aún no tiene pantalla. */
  protected linkOf(referenceType: MovementReferenceType, referenceId: number): readonly string[] | null {
    return movementReferenceLink(referenceType, referenceId);
  }
}
