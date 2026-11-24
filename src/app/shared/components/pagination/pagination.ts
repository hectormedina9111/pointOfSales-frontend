import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgbPagination } from '@ng-bootstrap/ng-bootstrap';

import { TranslatePipe } from '../../pipes/translate.pipe';

/** Tamaños de página que ofrece el selector. */
export const PAGE_SIZES: readonly number[] = [10, 20, 50];

/**
 * Paginación de un listado: selector de filas por página y botones de página. Las páginas
 * llegan y salen en base 0, como en el backend; NgbPagination usa base 1 por dentro.
 */
@Component({
  selector: 'app-pagination',
  imports: [NgbPagination, TranslatePipe],
  templateUrl: './pagination.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly total = input.required<number>();

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizes = PAGE_SIZES;

  protected sizeSelected(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
