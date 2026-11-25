import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { ProductView, ProductsApi } from '../../../core/api/products-api';
import { ProblemAlertComponent } from '../problem-alert/problem-alert';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Pausa tras teclear antes de buscar, en milisegundos. */
const SEARCH_DEBOUNCE_MS = 300;

/** Productos que muestra la lista de resultados. */
const RESULT_SIZE = 10;

/**
 * Selector de producto: escriba nombre, SKU o código de barras y elija un producto activo de la
 * lista. Solo busca y avisa del producto elegido; quien lo usa decide qué hacer con él.
 */
@Component({
  selector: 'app-product-picker',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './product-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPickerComponent {
  private readonly api = inject(ProductsApi);

  /** Id del campo de texto, para que la etiqueta de quien lo usa apunte a él. */
  readonly inputId = input.required<string>();
  /** Producto elegido, que se muestra debajo del campo. */
  readonly selected = input<ProductView | null>(null);
  /** Emite el producto que eligió la persona. */
  readonly productPicked = output<ProductView>();

  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly results = signal<readonly ProductView[]>([]);
  protected readonly searching = signal(false);
  /** Texto de la última búsqueda; vacío cuando el campo está vacío. */
  protected readonly searchedText = signal('');
  protected readonly searchError = signal<unknown>(null);

  constructor() {
    this.query.valueChanges
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((value) => value.trim()),
        distinctUntilChanged(),
        switchMap((text) => this.search(text)),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => this.results.set(rows));
  }

  protected pick(product: ProductView): void {
    this.productPicked.emit(product);
    this.query.setValue('', { emitEvent: false });
    this.searchedText.set('');
    this.results.set([]);
  }

  /** Busca solo productos activos: un producto inactivo no tiene precio. */
  private search(text: string) {
    if (text === '') {
      this.searching.set(false);
      this.searchedText.set('');
      return of<readonly ProductView[]>([]);
    }
    this.searching.set(true);
    this.searchedText.set(text);
    this.searchError.set(null);
    return this.api
      .search({ page: 0, size: RESULT_SIZE, sort: 'name' }, { q: text, categoryId: null, type: null, active: true })
      .pipe(
        map((page) => {
          this.searching.set(false);
          return page.content;
        }),
        catchError((error: unknown) => {
          this.searching.set(false);
          this.searchError.set(error);
          return of<readonly ProductView[]>([]);
        }),
      );
  }
}
