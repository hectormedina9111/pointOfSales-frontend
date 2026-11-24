import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { CountriesApi } from '../../../core/api/countries-api';
import { PriceListItemView, PriceListItemsApi } from '../../../core/api/price-list-items-api';
import { PriceListView, PriceListsApi } from '../../../core/api/price-lists-api';
import { Page, PageRequest, listAllPages } from '../../../core/api/page';
import { ProductView, ProductsApi } from '../../../core/api/products-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { formatAmount } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PriceListItemFormComponent } from './price-list-item-form';

/**
 * Precios por producto de una lista de precio fijo. Filtra por producto, agrega, edita y elimina
 * precios. Los nombres de los productos se piden al abrir cada página de precios y se guardan en
 * memoria; un producto que no se puede leer se muestra por su id.
 */
@Component({
  selector: 'app-price-list-detail',
  imports: [
    RouterLink,
    TranslatePipe,
    ProblemAlertComponent,
    PaginationComponent,
    ProductPickerComponent,
    IfPrivilegeDirective,
  ],
  templateUrl: './price-list-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListDetailComponent implements OnInit {
  private readonly listsApi = inject(PriceListsApi);
  private readonly itemsApi = inject(PriceListItemsApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly listId = Number(this.route.snapshot.paramMap.get('id'));

  protected readonly priceList = signal<PriceListView | null>(null);
  protected readonly loadError = signal<unknown>(null);
  protected readonly countryCodes = signal<ReadonlyMap<number, string>>(new Map());
  /** Producto por el que se filtra la tabla; null muestra todos los precios. */
  protected readonly productFilter = signal<ProductView | null>(null);
  /** Productos ya leídos, por id. */
  protected readonly products = signal<ReadonlyMap<number, ProductView>>(new Map());
  protected readonly notice = signal<string | null>(null);
  /** Error de una acción de la tabla (eliminar). El de la carga va aparte, en PagedList. */
  protected readonly actionError = signal<unknown>(null);

  /** Solo las listas de precio fijo tienen precios por producto. */
  protected readonly notFixedPrices = computed(() => {
    const list = this.priceList();
    return list !== null && list.pricingMethod !== 'FIXED_PRICE';
  });
  protected readonly canAddItems = computed(
    () => this.isCentral() && this.priceList()?.pricingMethod === 'FIXED_PRICE',
  );
  protected readonly formatAmount = formatAmount;

  protected readonly items = new PagedList<PriceListItemView>(
    (request) => this.loadItems(request),
    'productId',
  );

  ngOnInit(): void {
    this.listsApi.get(this.listId).subscribe({
      next: (list) => this.priceList.set(list),
      error: (error: unknown) => this.loadError.set(error),
    });
    listAllPages((request) => this.countriesApi.list(request), 'isoCode').subscribe({
      next: (countries) => this.countryCodes.set(new Map(countries.map((country) => [country.id, country.isoCode] as const))),
    });
    this.items.load();
  }

  protected countryCode(id: number): string {
    return this.countryCodes().get(id) ?? '';
  }

  protected productOf(item: PriceListItemView): ProductView | undefined {
    return this.products().get(item.productId);
  }

  protected filterByProduct(product: ProductView): void {
    this.productFilter.set(product);
    this.items.goToPage(0);
  }

  protected clearFilter(): void {
    this.productFilter.set(null);
    this.items.goToPage(0);
  }

  protected add(): void {
    const ref = this.modal.open(PriceListItemFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.listId = this.listId;
    ref.componentInstance.item = null;
    ref.componentInstance.product = null;
    this.afterSave(ref.result, 'pricing.priceList.itemSaved');
  }

  protected edit(item: PriceListItemView): void {
    const ref = this.modal.open(PriceListItemFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.listId = this.listId;
    ref.componentInstance.item = item;
    ref.componentInstance.product = this.productOf(item) ?? null;
    this.afterSave(ref.result, 'pricing.priceList.itemSaved');
  }

  protected async remove(item: PriceListItemView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'pricing.priceList.delete.title',
      messageKey: 'pricing.priceList.delete.message',
      messageParams: { product: this.productName(item), quantity: item.minQuantity },
      confirmKey: 'common.delete',
    });
    if (!confirmed) {
      return;
    }
    this.actionError.set(null);
    this.itemsApi.delete(this.listId, item.id).subscribe({
      next: () => {
        this.notice.set('pricing.priceList.itemDeleted');
        this.items.load();
      },
      error: (error: unknown) => this.actionError.set(error),
    });
  }

  protected productName(item: PriceListItemView): string {
    return this.productOf(item)?.name ?? String(item.productId);
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Carga una página de precios y, antes de mostrarla, los productos que aún no se conocen. */
  private loadItems(request: PageRequest): Observable<Page<PriceListItemView>> {
    return this.itemsApi.list(this.listId, request, this.productFilter()?.id ?? null).pipe(
      switchMap((page) =>
        this.loadProducts(page.content.map((item) => item.productId)).pipe(map(() => page)),
      ),
    );
  }

  /** Pide los productos que faltan. Si uno no se puede leer, queda sin nombre y no corta la carga. */
  private loadProducts(ids: readonly number[]): Observable<void> {
    const missing = [...new Set(ids)].filter((id) => !this.products().has(id));
    if (missing.length === 0) {
      return of(undefined);
    }
    return forkJoin(
      missing.map((id) => this.productsApi.get(id).pipe(catchError(() => of(null)))),
    ).pipe(
      tap((found) =>
        this.products.update((current) => {
          const next = new Map(current);
          found.forEach((product, index) => {
            const id = missing[index];
            if (product !== null && id !== undefined) {
              next.set(id, product);
            }
          });
          return next;
        }),
      ),
      map(() => undefined),
    );
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la tabla; si se cancela, no hace nada. */
  private afterSave(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.items.load();
      },
      () => undefined,
    );
  }
}
