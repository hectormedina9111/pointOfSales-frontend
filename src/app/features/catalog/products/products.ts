import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, merge } from 'rxjs';

import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { listAllPages } from '../../../core/api/page';
import { ProductFilters, ProductType, ProductView, ProductsApi } from '../../../core/api/products-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { formatAmount } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TreeRow, flattenTree, indentLabel } from '../../../shared/tree/tree';
import { ProductFormComponent } from './product-form';
import { ProductTaxesComponent } from './product-taxes';

/** Pausa tras teclear antes de buscar, en milisegundos. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Listado de productos: búsqueda por nombre, SKU o código de barras (con pausa al teclear),
 * filtros por categoría, tipo y estado, y acciones de alta, edición, impuestos por país y
 * desactivación.
 */
@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './products.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;

  protected readonly filterForm = this.fb.group({
    search: this.fb.control(''),
    categoryId: this.fb.control<number | null>(null),
    type: this.fb.control<ProductType | null>(null),
    active: this.fb.control<boolean | null>(null),
  });

  protected readonly products = new PagedList<ProductView>(
    (request) => this.api.search(request, this.filters()),
    'name',
  );
  protected readonly categories = signal<readonly TreeRow<CategoryView>[]>([]);
  protected readonly categoryNames = computed(
    () => new Map(this.categories().map((row) => [row.item.id, row.item.name] as const)),
  );
  protected readonly notice = signal<string | null>(null);
  /** Error de una acción de la tabla (desactivar). El de la carga va aparte, en PagedList. */
  protected readonly actionError = signal<unknown>(null);
  protected readonly formatAmount = formatAmount;
  protected readonly indent = indentLabel;

  constructor() {
    this.filterForm.controls.search.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.products.goToPage(0));
    merge(
      this.filterForm.controls.categoryId.valueChanges,
      this.filterForm.controls.type.valueChanges,
      this.filterForm.controls.active.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.products.goToPage(0));
  }

  ngOnInit(): void {
    this.products.load();
    listAllPages((request) => this.categoriesApi.list(request), 'name').subscribe({
      next: (categories) => this.categories.set(flattenTree(categories, (c) => c.id, (c) => c.parentId)),
    });
  }

  protected create(): void {
    const ref = this.modal.open(ProductFormComponent, { size: 'xl', scrollable: true });
    ref.componentInstance.product = null;
    this.afterClose(ref.result, 'catalog.products.saved');
  }

  protected edit(product: ProductView): void {
    const ref = this.modal.open(ProductFormComponent, { size: 'xl', scrollable: true });
    ref.componentInstance.product = product;
    this.afterClose(ref.result, 'catalog.products.saved');
  }

  protected taxes(product: ProductView): void {
    const ref = this.modal.open(ProductTaxesComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.product = product;
    this.afterClose(ref.result, 'catalog.products.taxesSaved');
  }

  protected async deactivate(product: ProductView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'catalog.products.deactivate.title',
      messageKey: 'catalog.products.deactivate.message',
      messageParams: { name: product.name },
      confirmKey: 'common.deactivate',
    });
    if (!confirmed) {
      return;
    }
    this.actionError.set(null);
    this.api.deactivate(product.id).subscribe({
      next: () => {
        this.notice.set('catalog.products.deactivated');
        this.products.load();
      },
      error: (error: unknown) => this.actionError.set(error),
    });
  }

  protected categoryName(id: number | null): string {
    return id === null ? '' : (this.categoryNames().get(id) ?? '');
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Filtros actuales: el texto sin espacios de los extremos; un valor vacío no filtra. */
  private filters(): ProductFilters {
    const value = this.filterForm.getRawValue();
    const search = value.search.trim();
    return {
      q: search === '' ? null : search,
      categoryId: value.categoryId,
      type: value.type,
      active: value.active,
    };
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.products.load();
      },
      () => undefined,
    );
  }
}
