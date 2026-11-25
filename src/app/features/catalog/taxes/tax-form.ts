import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { TaxRequest, TaxView, TaxesApi } from '../../../core/api/taxes-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { RATE_PATTERN, percentValidator } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta y edición de impuesto. El país se elige al crear y no cambia después. Con tax null es un
 * alta; con un impuesto, edita código, nombre, tasa y estado. Cierra el diálogo con el impuesto guardado.
 */
@Component({
  selector: 'app-tax-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './tax-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxFormComponent implements OnInit {
  private readonly api = inject(TaxesApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Impuesto a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  tax: TaxView | null = null;
  /** País preseleccionado al dar de alta (el filtro de la lista). */
  defaultCountryId: number | null = null;

  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    countryId: this.fb.control<number | null>(null, [Validators.required]),
    code: this.fb.control('', [Validators.required, Validators.maxLength(20)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(80)]),
    rate: this.fb.control('', [Validators.required, Validators.pattern(RATE_PATTERN), percentValidator]),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const tax = this.tax;
    if (tax !== null) {
      // El país de un impuesto no cambia: se muestra, pero no se edita.
      this.form.controls.countryId.disable();
    }
    listAllPages((request) => this.countriesApi.list(request), 'isoCode').subscribe({
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

  /** Países activos, más el seleccionado aunque esté inactivo. */
  protected countryOptions(): readonly CountryView[] {
    const current = this.form.getRawValue().countryId;
    return this.countries().filter((country) => country.active || country.id === current);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.countryId === null) {
      return;
    }
    const body: TaxRequest = {
      countryId: value.countryId,
      code: value.code.trim(),
      name: value.name.trim(),
      rate: value.rate.trim(),
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.tax === null
      ? this.api.create(body)
      : this.api.update(this.tax.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  private fillForm(): void {
    const tax = this.tax;
    if (tax === null) {
      this.form.controls.countryId.setValue(this.defaultCountryId);
      this.lockSingleCountry();
      return;
    }
    this.form.patchValue({
      countryId: tax.countryId,
      code: tax.code,
      name: tax.name,
      // La tasa llega como número con dos decimales; se muestra y se envía como texto.
      rate: tax.rate.toFixed(2),
      active: tax.active,
    });
    this.lockSingleCountry();
  }

  /**
   * Con un solo país en el servidor no hay nada que elegir: se preselecciona (si aún no hay
   * valor) y el selector queda deshabilitado. Con varios países, el selector sigue igual.
   */
  private lockSingleCountry(): void {
    const countries = this.countries();
    if (countries.length !== 1) {
      return;
    }
    const control = this.form.controls.countryId;
    if (control.value === null) {
      control.setValue(countries[0].id);
    }
    control.disable();
  }
}
