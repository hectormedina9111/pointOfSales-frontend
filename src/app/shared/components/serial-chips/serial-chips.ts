import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';

import { ProductSerialView, SerialsApi } from '../../../core/api/serials-api';
import { FieldLabelComponent } from '../field-label/field-label';
import { ProblemAlertComponent } from '../problem-alert/problem-alert';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Pausa tras teclear en la búsqueda de la lista de seriales disponibles, en milisegundos. */
const PICK_DEBOUNCE_MS = 300;

/** Seriales disponibles que muestra la lista para elegir. */
const PICK_SIZE = 20;

/**
 * Captura de seriales en chips. Enter (o un lector de código) agrega el serial escrito; cada chip se
 * puede quitar. Si se indica pickProductId, un botón abre la lista de seriales disponibles del
 * producto, buscada en el servidor. El padre decide qué hacer con cada serial: el componente solo
 * evita repetirlo dentro de la misma lista.
 */
@Component({
  selector: 'app-serial-chips',
  imports: [ReactiveFormsModule, FieldLabelComponent, ProblemAlertComponent, TranslatePipe],
  templateUrl: './serial-chips.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialChipsComponent {
  private readonly serialsApi = inject(SerialsApi);

  readonly inputId = input.required<string>();
  readonly labelKey = input<string>('serials.input.label');
  readonly serials = input.required<readonly string[]>();
  /** Producto cuyos seriales disponibles se pueden elegir; null oculta el botón de la lista. */
  readonly pickProductId = input<number | null>(null);
  /** Sucursal de la lista de disponibles; null usa la del nodo. Un documento de la central la indica. */
  readonly pickBranchId = input<number | null>(null);
  /** Campo de solo lectura: se ven los chips pero no se agregan ni se quitan. */
  readonly disabled = input(false);

  readonly added = output<string>();
  readonly removed = output<string>();

  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly message = signal<string | null>(null);

  protected readonly picking = signal(false);
  protected readonly pickSearch = new FormControl('', { nonNullable: true });
  protected readonly pickItems = signal<readonly ProductSerialView[]>([]);
  protected readonly pickLoading = signal(false);
  protected readonly pickError = signal<unknown>(null);
  private readonly pickQuery = new Subject<string>();

  constructor() {
    this.pickSearch.valueChanges.pipe(takeUntilDestroyed()).subscribe((search) => this.pickQuery.next(search));
    this.pickQuery
      .pipe(
        debounceTime(PICK_DEBOUNCE_MS),
        switchMap((search) => {
          const productId = this.pickProductId();
          if (productId === null || !this.picking()) {
            return of(null);
          }
          this.pickLoading.set(true);
          this.pickError.set(null);
          return this.serialsApi
            .forProduct(productId, { page: 0, size: PICK_SIZE, sort: 'serialNumber,asc' }, {
              status: 'AVAILABLE',
              branchId: this.pickBranchId(),
              search: search.trim() || null,
            })
            .pipe(
              map((page) => page.content),
              catchError((error: unknown) => {
                this.pickError.set(error);
                return of([] as readonly ProductSerialView[]);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((items) => {
        if (items !== null) {
          this.pickItems.set(items);
          this.pickLoading.set(false);
        }
      });
  }

  /** Enter: agrega el serial escrito. Un serial repetido en la misma lista no se agrega. */
  protected onEnter(event: Event): void {
    event.preventDefault();
    const serial = this.text.value.trim();
    if (serial === '') {
      return;
    }
    if (this.serials().includes(serial)) {
      this.message.set('serials.input.duplicate');
      return;
    }
    this.message.set(null);
    this.text.setValue('');
    this.added.emit(serial);
  }

  protected remove(serial: string): void {
    this.message.set(null);
    this.removed.emit(serial);
  }

  /** Abre o cierra la lista de seriales disponibles y la carga. */
  protected togglePicking(): void {
    const next = !this.picking();
    this.picking.set(next);
    if (next) {
      this.pickQuery.next(this.pickSearch.value);
    }
  }

  protected pick(serial: string): void {
    this.message.set(null);
    this.added.emit(serial);
  }
}
