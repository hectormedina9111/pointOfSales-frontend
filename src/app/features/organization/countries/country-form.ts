import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { CountriesApi, CountryRequest, CountryView, FiscalProviderCode } from '../../../core/api/countries-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta y edición de país. Con country null es un alta; con un país, edita sus datos.
 * Cierra el diálogo con el país guardado.
 */
@Component({
  selector: 'app-country-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './country-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountryFormComponent implements OnInit {
  private readonly api = inject(CountriesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** País a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  country: CountryView | null = null;

  protected readonly fiscalProviders: readonly FiscalProviderCode[] = ['HN_SAR', 'NONE'];
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    isoCode: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(80)]),
    currency: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]),
    timeZone: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
    taxIdLabel: this.fb.control('', [Validators.required, Validators.maxLength(20)]),
    fiscalProvider: this.fb.control<FiscalProviderCode>('NONE', [Validators.required]),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const country = this.country;
    if (country !== null) {
      this.form.patchValue({
        isoCode: country.isoCode,
        name: country.name,
        currency: country.currency,
        timeZone: country.timeZone,
        taxIdLabel: country.taxIdLabel,
        fiscalProvider: country.fiscalProvider,
        active: country.active,
      });
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: CountryRequest = {
      isoCode: value.isoCode,
      name: value.name.trim(),
      currency: value.currency,
      timeZone: value.timeZone.trim(),
      taxIdLabel: value.taxIdLabel.trim(),
      fiscalProvider: value.fiscalProvider,
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.country === null
      ? this.api.create(body)
      : this.api.update(this.country.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
