import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { PriceListView, PriceListsApi } from '../../../core/api/price-lists-api';
import { ProductPriceView, ProductPricesApi } from '../../../core/api/product-prices-api';
import { ProductView } from '../../../core/api/products-api';
import { CentralCountriesService } from '../../../core/system/central-countries.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { QUANTITY_PATTERN, formatAmount } from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Consulta de precio: calcula el precio de un producto con una lista o una sucursal, y muestra la
 * base gravable y el impuesto. Es solo lectura: la central y las tiendas la usan igual. Los montos
 * se muestran con dos decimales y con la moneda del país de la lista o la sucursal.
 */
@Component({
  selector: 'app-price-check',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, ProductPickerComponent, TranslatePipe],
  templateUrl: './price-check.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceCheckComponent implements OnInit {
  private readonly api = inject(ProductPricesApi);
  private readonly priceListsApi = inject(PriceListsApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly centralCountries = inject(CentralCountriesService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    product: this.fb.control<ProductView | null>(null, [Validators.required]),
    priceListId: this.fb.control<number | null>(null),
    branchId: this.fb.control<number | null>(null),
    quantity: this.fb.control('1', [Validators.required, Validators.pattern(QUANTITY_PATTERN)]),
    date: this.fb.control(''),
  });

  protected readonly priceLists = signal<readonly PriceListView[]>([]);
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly countries = signal<ReadonlyMap<number, CountryView>>(new Map());
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;
  protected readonly formatAmount = formatAmount;

  /** Resultado de la última consulta y los datos que lo acompañan. */
  protected readonly result = signal<ProductPriceView | null>(null);
  protected readonly resultProduct = signal<ProductView | null>(null);
  protected readonly resultCurrency = signal('');

  ngOnInit(): void {
    forkJoin({
      priceLists: listAllPages((request) => this.priceListsApi.list(request), 'code'),
      branches: listAllPages((request) => this.branchesApi.list(request), 'code'),
      countries: this.centralCountries.list(),
    }).subscribe({
      next: ({ priceLists, branches, countries }) => {
        this.priceLists.set(priceLists);
        this.branches.set(branches);
        this.countries.set(new Map(countries.map((country) => [country.id, country] as const)));
        this.lookupsLoading.set(false);
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  /** Listas activas, más la elegida aunque esté inactiva. */
  protected priceListOptions(): readonly PriceListView[] {
    const current = this.form.getRawValue().priceListId;
    return this.priceLists().filter((list) => list.active || list.id === current);
  }

  protected chooseProduct(product: ProductView): void {
    this.form.controls.product.setValue(product);
    this.form.controls.product.markAsTouched();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const product = value.product;
    if (product === null) {
      return;
    }
    const countryId = this.countryIdOf(value.priceListId, value.branchId);

    this.submitting.set(true);
    this.error.set(null);
    this.result.set(null);
    this.api
      .resolve(product.id, {
        priceListId: value.priceListId,
        branchId: value.branchId,
        quantity: value.quantity.trim(),
        date: blankToNull(value.date),
      })
      .subscribe({
        next: (price) => {
          this.resultProduct.set(product);
          this.resultCurrency.set(countryId === null ? '' : (this.countries().get(countryId)?.currency ?? ''));
          this.result.set(price);
          this.submitting.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error);
          this.submitting.set(false);
        },
      });
  }

  /** Monto con dos decimales y, si se conoce, la moneda del país. */
  protected money(value: number): string {
    const amount = formatAmount(value);
    const currency = this.resultCurrency();
    return currency === '' ? amount : `${amount} ${currency}`;
  }

  protected priceListName(id: number | null): string {
    return this.priceLists().find((list) => list.id === id)?.name ?? '';
  }

  /** Como el backend: la lista decide el país; sin lista, el de la sucursal. */
  private countryIdOf(priceListId: number | null, branchId: number | null): number | null {
    if (priceListId !== null) {
      return this.priceLists().find((list) => list.id === priceListId)?.countryId ?? null;
    }
    if (branchId !== null) {
      return this.branches().find((branch) => branch.id === branchId)?.countryId ?? null;
    }
    return null;
  }
}
