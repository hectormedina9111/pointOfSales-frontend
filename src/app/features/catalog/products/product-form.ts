import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { ProductRequest, ProductType, ProductView, ProductsApi } from '../../../core/api/products-api';
import { TaxView, TaxesApi } from '../../../core/api/taxes-api';
import { UnitOfMeasureView, UnitsApi } from '../../../core/api/units-api';
import { CentralCountriesService } from '../../../core/system/central-countries.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { AMOUNT_PATTERN, QUANTITY_PATTERN, formatAmount } from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TreeRow, flattenTree, indentLabel } from '../../../shared/tree/tree';

/**
 * Alta y edición de producto. Reglas entre campos: un servicio no controla inventario ni seriales,
 * y controlar seriales obliga a controlar inventario. Los montos viajan como texto y se validan
 * con patrones; la web no calcula nada con ellos. Cierra el diálogo con el producto guardado.
 */
@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './product-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormComponent implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly taxesApi = inject(TaxesApi);
  private readonly unitsApi = inject(UnitsApi);
  private readonly centralCountries = inject(CentralCountriesService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Producto a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  product: ProductView | null = null;

  protected readonly categories = signal<readonly TreeRow<CategoryView>[]>([]);
  protected readonly taxes = signal<readonly TaxView[]>([]);
  protected readonly units = signal<readonly UnitOfMeasureView[]>([]);
  protected readonly countries = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;
  protected readonly productTypes: readonly ProductType[] = ['GOOD', 'SERVICE'];
  protected readonly indent = indentLabel;

  protected readonly form = this.fb.group({
    sku: this.fb.control('', [Validators.required, Validators.maxLength(40)]),
    barcode: this.fb.control('', [Validators.maxLength(50)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.control(''),
    categoryId: this.fb.control<number | null>(null),
    taxId: this.fb.control<number | null>(null, [Validators.required]),
    unitOfMeasureId: this.fb.control<number | null>(null, [Validators.required]),
    productType: this.fb.control<ProductType>('GOOD', [Validators.required]),
    salePrice: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    cost: this.fb.control('', [Validators.pattern(AMOUNT_PATTERN)]),
    tracksInventory: this.fb.control(true),
    tracksSerials: this.fb.control(false),
    requiresExclusiveInvoice: this.fb.control(false),
    minStock: this.fb.control('', [Validators.pattern(QUANTITY_PATTERN)]),
    imageUrl: this.fb.control('', [Validators.maxLength(300)]),
    active: this.fb.control(true),
  });

  /** Impuestos activos, más el del producto aunque esté inactivo. */
  protected taxOptions(): readonly TaxView[] {
    const current = this.form.getRawValue().taxId;
    return this.taxes().filter((tax) => tax.active || tax.id === current);
  }

  constructor() {
    this.form.controls.productType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncFlags());
    this.form.controls.tracksSerials.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncFlags());
  }

  ngOnInit(): void {
    forkJoin({
      categories: listAllPages((request) => this.categoriesApi.list(request), 'name'),
      taxes: listAllPages((request) => this.taxesApi.list(request), 'code'),
      units: listAllPages((request) => this.unitsApi.list(request), 'code'),
      countries: this.centralCountries.list(),
    }).subscribe({
      next: ({ categories, taxes, units, countries }) => {
        this.categories.set(flattenTree(categories, (c) => c.id, (c) => c.parentId));
        this.taxes.set(taxes);
        this.units.set(units);
        this.countries.set(new Map(countries.map((country: CountryView) => [country.id, country.isoCode] as const)));
        this.lookupsLoading.set(false);
        this.fillForm();
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  /** Categorías activas, más la del producto aunque esté inactiva. */
  protected categoryOptions(): readonly TreeRow<CategoryView>[] {
    const current = this.form.getRawValue().categoryId;
    return this.categories().filter((row) => row.item.active || row.item.id === current);
  }

  protected unitOptions(): readonly UnitOfMeasureView[] {
    const current = this.form.getRawValue().unitOfMeasureId;
    return this.units().filter((unit) => unit.active || unit.id === current);
  }

  /** Texto de un impuesto en el selector: país, código, nombre y tasa. */
  protected taxLabel(tax: TaxView): string {
    const iso = this.countries().get(tax.countryId) ?? '';
    return `${iso} - ${tax.code} - ${tax.name} (${formatAmount(tax.rate)}%)`;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.taxId === null || value.unitOfMeasureId === null) {
      return;
    }
    const body: ProductRequest = {
      sku: value.sku.trim(),
      barcode: blankToNull(value.barcode),
      name: value.name.trim(),
      description: blankToNull(value.description),
      categoryId: value.categoryId,
      taxId: value.taxId,
      unitOfMeasureId: value.unitOfMeasureId,
      salePrice: value.salePrice.trim(),
      cost: blankToNull(value.cost),
      productType: value.productType,
      tracksInventory: value.tracksInventory,
      tracksSerials: value.tracksSerials,
      requiresExclusiveInvoice: value.requiresExclusiveInvoice,
      minStock: blankToNull(value.minStock),
      imageUrl: blankToNull(value.imageUrl),
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.product === null
      ? this.api.create(body)
      : this.api.update(this.product.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  /**
   * Aplica las reglas entre tipo y flags. Un servicio no controla inventario ni seriales. Con
   * seriales activos, el inventario se controla siempre, así que su casilla se fija en marcada.
   */
  private syncFlags(): void {
    const controls = this.form.controls;
    const raw = this.form.getRawValue();
    const isService = raw.productType === 'SERVICE';

    if (isService) {
      controls.tracksSerials.setValue(false, { emitEvent: false });
      controls.tracksInventory.setValue(false, { emitEvent: false });
    } else if (raw.tracksSerials) {
      controls.tracksInventory.setValue(true, { emitEvent: false });
    }

    setEnabled(controls.tracksSerials, !isService);
    setEnabled(controls.tracksInventory, !isService && !raw.tracksSerials);
  }

  private fillForm(): void {
    const product = this.product;
    if (product !== null) {
      this.form.patchValue({
        sku: product.sku,
        barcode: product.barcode ?? '',
        name: product.name,
        description: product.description ?? '',
        categoryId: product.categoryId,
        taxId: product.taxId,
        unitOfMeasureId: product.unitOfMeasureId,
        productType: product.productType,
        // Los montos llegan como número con dos decimales; se muestran como texto.
        salePrice: formatAmount(product.salePrice),
        cost: formatAmount(product.cost),
        tracksInventory: product.tracksInventory,
        tracksSerials: product.tracksSerials,
        requiresExclusiveInvoice: product.requiresExclusiveInvoice,
        minStock: product.minStock === null ? '' : String(product.minStock),
        imageUrl: product.imageUrl ?? '',
        active: product.active,
      });
    }
    this.syncFlags();
  }
}

/** Habilita o deshabilita un control sin disparar eventos (evita bucles con las reglas). */
function setEnabled(control: AbstractControl, enabled: boolean): void {
  if (enabled && control.disabled) {
    control.enable({ emitEvent: false });
  } else if (!enabled && control.enabled) {
    control.disable({ emitEvent: false });
  }
}
