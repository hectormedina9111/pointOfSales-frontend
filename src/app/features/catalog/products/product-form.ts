import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { ProductRequest, ProductType, ProductView, ProductsApi, SerialMode } from '../../../core/api/products-api';
import { TaxView, TaxesApi } from '../../../core/api/taxes-api';
import { UnitOfMeasureView, UnitsApi } from '../../../core/api/units-api';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { AMOUNT_PATTERN, QUANTITY_PATTERN, formatAmount } from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TreeRow, flattenTree, indentLabel } from '../../../shared/tree/tree';

/** Fila del resumen del último paso: etiqueta (clave de traducción) y valor ya en texto. */
interface SummaryRow {
  readonly labelKey: string;
  readonly value: string;
}

/**
 * Alta y edición de producto, en un asistente de cinco pasos. Reglas entre campos: un servicio no
 * controla inventario ni seriales, y controlar seriales obliga a controlar inventario. Los montos
 * viajan como texto y se validan con patrones; la web no calcula nada con ellos. Cierra el diálogo
 * con el producto guardado.
 */
@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule,
    ProblemAlertComponent,
    FieldErrorComponent,
    FieldLabelComponent,
    StepperComponent,
    StepComponent,
    TranslatePipe,
  ],
  templateUrl: './product-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormComponent implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly taxesApi = inject(TaxesApi);
  private readonly unitsApi = inject(UnitsApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly translation = inject(TranslationService);
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
  protected readonly serialModes: readonly SerialMode[] = ['NONE', 'MANUAL', 'LIST'];
  protected readonly indent = indentLabel;

  /**
   * Error de la configuración de serie con una unidad que admite decimales: una serie identifica
   * una sola unidad. Se revalida cuando cambia la unidad (ver el constructor).
   */
  private readonly serialModeValidator = (control: AbstractControl): ValidationErrors | null => {
    const unitId = this.form?.controls.unitOfMeasureId.value ?? null;
    const unit = this.units().find((row) => row.id === unitId);
    return control.value !== 'NONE' && unit?.allowsDecimals === true ? { serialUnit: true } : null;
  };

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
    cost: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    tracksInventory: this.fb.control(true),
    serialMode: this.fb.control<SerialMode>('NONE', [this.serialModeValidator]),
    requiresExclusiveInvoice: this.fb.control(false),
    minStock: this.fb.control('', [Validators.pattern(QUANTITY_PATTERN)]),
    imageUrl: this.fb.control('', [Validators.maxLength(300)]),
    active: this.fb.control(true),
  });

  /** Controles de cada paso: el asistente no avanza mientras alguno tenga error. */
  protected readonly identificationControls: readonly AbstractControl[] = [
    this.form.controls.sku,
    this.form.controls.barcode,
    this.form.controls.name,
    this.form.controls.description,
    this.form.controls.productType,
    this.form.controls.imageUrl,
  ];
  protected readonly classificationControls: readonly AbstractControl[] = [
    this.form.controls.categoryId,
    this.form.controls.unitOfMeasureId,
    this.form.controls.taxId,
  ];
  protected readonly priceControls: readonly AbstractControl[] = [this.form.controls.salePrice, this.form.controls.cost];
  protected readonly inventoryControls: readonly AbstractControl[] = [this.form.controls.serialMode, this.form.controls.minStock];
  /** El resumen no tiene campos propios. */
  protected readonly noControls: readonly AbstractControl[] = [];

  /** Impuestos activos, más el del producto aunque esté inactivo. */
  protected taxOptions(): readonly TaxView[] {
    const current = this.form.getRawValue().taxId;
    return this.taxes().filter((tax) => tax.active || tax.id === current);
  }

  constructor() {
    this.form.controls.productType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncFlags());
    this.form.controls.serialMode.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncFlags());
    // El aviso de unidad con decimales depende de la unidad elegida en el paso 2.
    this.form.controls.unitOfMeasureId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncFlags());
  }

  ngOnInit(): void {
    forkJoin({
      categories: listAllPages((request) => this.categoriesApi.list(request), 'name'),
      taxes: listAllPages((request) => this.taxesApi.list(request), 'code'),
      units: listAllPages((request) => this.unitsApi.list(request), 'code'),
      countries: listAllPages((request) => this.countriesApi.list(request), 'isoCode'),
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

  /** Clave de la ayuda de cada configuración de serie, para mostrarla bajo el selector. */
  protected serialModeHintKey(): string {
    return `catalog.products.serialModeHint.${this.form.getRawValue().serialMode}`;
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

  /** Filas del resumen del último paso, con los valores actuales del formulario. */
  protected summaryRows(): readonly SummaryRow[] {
    const raw = this.form.getRawValue();
    const none = this.t('common.none');
    const yesNo = (value: boolean): string => this.t(value ? 'common.yes' : 'common.no');
    const text = (value: string): string => (value.trim() === '' ? none : value.trim());
    const category = raw.categoryId === null
      ? this.t('catalog.products.option.noCategory')
      : (this.categories().find((row) => row.item.id === raw.categoryId)?.item.name ?? none);
    const unit = this.units().find((row) => row.id === raw.unitOfMeasureId);
    const tax = this.taxes().find((row) => row.id === raw.taxId);

    return [
      { labelKey: 'catalog.products.field.sku', value: text(raw.sku) },
      { labelKey: 'catalog.products.field.barcode', value: text(raw.barcode) },
      { labelKey: 'catalog.products.field.name', value: text(raw.name) },
      { labelKey: 'catalog.products.field.description', value: text(raw.description) },
      { labelKey: 'catalog.products.field.imageUrl', value: text(raw.imageUrl) },
      { labelKey: 'catalog.products.field.productType', value: this.t(`catalog.products.type.${raw.productType}`) },
      { labelKey: 'catalog.products.field.category', value: category },
      { labelKey: 'catalog.products.field.unit', value: unit ? `${unit.code} - ${unit.name}` : none },
      { labelKey: 'catalog.products.field.tax', value: tax ? this.taxLabel(tax) : none },
      { labelKey: 'catalog.products.field.salePrice', value: text(raw.salePrice) },
      { labelKey: 'catalog.products.field.cost', value: text(raw.cost) },
      { labelKey: 'catalog.products.field.tracksInventory', value: yesNo(raw.tracksInventory) },
      { labelKey: 'catalog.products.field.serialMode', value: this.t(`catalog.products.serialMode.${raw.serialMode}`) },
      { labelKey: 'catalog.products.field.minStock', value: text(raw.minStock) },
      { labelKey: 'catalog.products.field.requiresExclusiveInvoice', value: yesNo(raw.requiresExclusiveInvoice) },
      { labelKey: 'catalog.products.field.active', value: yesNo(raw.active) },
    ];
  }

  protected t(key: string): string {
    return this.translation.translate(key);
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
      serialMode: value.serialMode,
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
   * Aplica las reglas entre tipo, serie e inventario. Un servicio es siempre sin serie y sin
   * inventario. Manual y de lista exigen controlar inventario, así que la casilla se fija en
   * marcada y se deshabilita. La unidad se revalida porque el validador la lee del formulario.
   */
  private syncFlags(): void {
    const controls = this.form.controls;
    const raw = this.form.getRawValue();
    const isService = raw.productType === 'SERVICE';
    const hasSerials = raw.serialMode !== 'NONE';

    if (isService) {
      controls.serialMode.setValue('NONE', { emitEvent: false });
      controls.tracksInventory.setValue(false, { emitEvent: false });
    } else if (hasSerials) {
      controls.tracksInventory.setValue(true, { emitEvent: false });
    }

    setEnabled(controls.serialMode, !isService);
    setEnabled(controls.tracksInventory, !isService && !hasSerials);
    controls.serialMode.updateValueAndValidity({ emitEvent: false });
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
        serialMode: product.serialMode,
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
