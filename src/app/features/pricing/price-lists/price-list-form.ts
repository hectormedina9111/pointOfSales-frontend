import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { CountryView } from '../../../core/api/countries-api';
import { PriceListRequest, PriceListView, PriceListsApi, PricingMethod } from '../../../core/api/price-lists-api';
import { CentralCountriesService } from '../../../core/system/central-countries.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { RATE_PATTERN, formatAmount, percentValidator } from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Prioridad máxima que admite el backend (SMALLINT). */
const MAX_PRIORITY = 32767;

/** Métodos de precio en el orden del selector. */
const PRICING_METHODS: readonly PricingMethod[] = ['FIXED_PRICE', 'PERCENT_OFF_BASE'];

/**
 * Alta y edición de lista de precios. El descuento solo se pide con PERCENT_OFF_BASE y se envía
 * vacío con precio fijo. Las fechas son opcionales: vacías significan sin límite. Cierra el
 * diálogo con la lista guardada.
 */
@Component({
  selector: 'app-price-list-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './price-list-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListFormComponent implements OnInit {
  private readonly api = inject(PriceListsApi);
  private readonly centralCountries = inject(CentralCountriesService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Lista a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  priceList: PriceListView | null = null;

  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;
  protected readonly pricingMethods = PRICING_METHODS;
  protected readonly maxPriority = MAX_PRIORITY;
  protected readonly formatAmount = formatAmount;

  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.maxLength(30)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    countryId: this.fb.control<number | null>(null, [Validators.required]),
    pricingMethod: this.fb.control<PricingMethod>('FIXED_PRICE', [Validators.required]),
    percent: this.fb.control(''),
    validFrom: this.fb.control(''),
    validTo: this.fb.control(''),
    priority: this.fb.control<number | null>(0, [Validators.required, Validators.min(0), Validators.max(MAX_PRIORITY)]),
    active: this.fb.control(true),
  });

  constructor() {
    this.form.controls.pricingMethod.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncPercent());
    this.syncPercent();
  }

  ngOnInit(): void {
    this.centralCountries.list().subscribe({
      next: (countries) => {
        this.countries.set(countries);
        this.lookupsLoading.set(false);
        this.fillForm();
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  /** Países activos, más el de la lista aunque esté inactivo. */
  protected countryOptions(): readonly CountryView[] {
    const current = this.form.getRawValue().countryId;
    return this.countries().filter((country) => country.active || country.id === current);
  }

  /** El campo de descuento solo aparece con PERCENT_OFF_BASE. */
  protected showPercent(): boolean {
    return this.form.getRawValue().pricingMethod === 'PERCENT_OFF_BASE';
  }

  /** El descuento es obligatorio solo con PERCENT_OFF_BASE; con precio fijo se limpia. */
  private syncPercent(): void {
    const control = this.form.controls.percent;
    if (this.showPercent()) {
      control.setValidators([Validators.required, Validators.pattern(RATE_PATTERN), percentValidator]);
    } else {
      control.setValue('', { emitEvent: false });
      control.clearValidators();
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.countryId === null || value.priority === null) {
      return;
    }
    const body: PriceListRequest = {
      code: value.code.trim(),
      name: value.name.trim(),
      countryId: value.countryId,
      pricingMethod: value.pricingMethod,
      percent: this.showPercent() ? value.percent.trim() : null,
      validFrom: blankToNull(value.validFrom),
      validTo: blankToNull(value.validTo),
      priority: value.priority,
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.priceList === null
      ? this.api.create(body)
      : this.api.update(this.priceList.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  private fillForm(): void {
    const list = this.priceList;
    if (list !== null) {
      this.form.patchValue({
        code: list.code,
        name: list.name,
        countryId: list.countryId,
        pricingMethod: list.pricingMethod,
        // El descuento llega como número; se muestra como texto con dos decimales.
        percent: list.percent === null ? '' : formatAmount(list.percent),
        validFrom: list.validFrom ?? '',
        validTo: list.validTo ?? '',
        priority: list.priority,
        active: list.active,
      });
    }
  }
}
