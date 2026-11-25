import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { ProductTaxView, ProductView, ProductsApi } from '../../../core/api/products-api';
import { TaxView, TaxesApi } from '../../../core/api/taxes-api';
import { CentralCountriesService } from '../../../core/system/central-countries.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatAmount } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Una fila del diálogo: un país, su impuesto elegido (null si no tiene) y las opciones de ese país. */
interface CountryTaxRow {
  readonly country: CountryView;
  readonly taxId: number | null;
  readonly options: readonly TaxView[];
}

/**
 * Impuestos de un producto por país: una fila por país. Un país sin impuesto no se guarda, así
 * que la lista que se envía solo trae las filas con impuesto. Cierra el diálogo al guardar.
 */
@Component({
  selector: 'app-product-taxes',
  imports: [ProblemAlertComponent, TranslatePipe],
  templateUrl: './product-taxes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTaxesComponent implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly centralCountries = inject(CentralCountriesService);
  private readonly taxesApi = inject(TaxesApi);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Producto cuyos impuestos se editan; lo asigna quien abre el diálogo antes de mostrarlo. */
  product!: ProductView;

  protected readonly rows = signal<readonly CountryTaxRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<unknown>(null);
  protected readonly formatAmount = formatAmount;

  ngOnInit(): void {
    forkJoin({
      countries: this.centralCountries.list(),
      taxes: listAllPages((request) => this.taxesApi.list(request), 'code'),
      current: this.api.taxes(this.product.id),
    }).subscribe({
      next: ({ countries, taxes, current }) => {
        this.rows.set(countries.map((country) => this.buildRow(country, taxes, current)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  /** Cambia el impuesto de un país. Un valor vacío quita el impuesto de ese país. */
  protected setTax(countryId: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const taxId = value === '' ? null : Number(value);
    this.rows.update((rows) => rows.map((row) => (row.country.id === countryId ? { ...row, taxId } : row)));
  }

  protected taxLabel(tax: TaxView): string {
    return `${tax.code} - ${tax.name} (${formatAmount(tax.rate)}%)`;
  }

  protected save(): void {
    const payload: ProductTaxView[] = this.rows().flatMap((row) =>
      row.taxId === null ? [] : [{ countryId: row.country.id, taxId: row.taxId }],
    );

    this.submitting.set(true);
    this.saveError.set(null);
    this.api.replaceTaxes(this.product.id, payload).subscribe({
      next: () => this.activeModal.close(true),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.saveError.set(error);
      },
    });
  }

  /** Impuestos activos del país, más el que ya tiene el producto aunque esté inactivo. */
  private buildRow(
    country: CountryView,
    taxes: readonly TaxView[],
    current: readonly ProductTaxView[],
  ): CountryTaxRow {
    const taxId = current.find((row) => row.countryId === country.id)?.taxId ?? null;
    const options = taxes.filter((tax) => tax.countryId === country.id && (tax.active || tax.id === taxId));
    return { country, taxId, options };
  }
}
