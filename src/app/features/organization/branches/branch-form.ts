import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { BranchRequest, BranchView, BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { PriceListView, PriceListsApi } from '../../../core/api/price-lists-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta y edición de sucursal. Con branch null es un alta; con una sucursal, la edita.
 * Los países y las listas de precios salen de la API; los inactivos se marcan en el selector.
 * Cierra el diálogo con la sucursal guardada.
 */
@Component({
  selector: 'app-branch-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './branch-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchFormComponent implements OnInit {
  private readonly api = inject(BranchesApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly priceListsApi = inject(PriceListsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Sucursal a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  branch: BranchView | null = null;

  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly priceLists = signal<readonly PriceListView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.maxLength(10)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
    address: this.fb.control('', [Validators.maxLength(300)]),
    phone: this.fb.control('', [Validators.maxLength(20)]),
    countryId: this.fb.control<number | null>(null, [Validators.required]),
    allowNegativeStock: this.fb.control(false),
    defaultPriceListId: this.fb.control<number | null>(null),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    forkJoin({
      countries: listAllPages((request) => this.countriesApi.list(request), 'isoCode'),
      priceLists: listAllPages((request) => this.priceListsApi.list(request), 'code'),
    }).subscribe({
      next: ({ countries, priceLists }) => {
        this.countries.set(countries);
        this.priceLists.set(priceLists);
        this.lookupsLoading.set(false);
        this.fillForm();
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  /** Países y listas activas, más la que ya tiene la sucursal aunque esté inactiva. */
  protected countryOptions(): readonly CountryView[] {
    return this.countries().filter((country) => country.active || country.id === this.form.getRawValue().countryId);
  }

  protected priceListOptions(): readonly PriceListView[] {
    return this.priceLists().filter((list) => list.active || list.id === this.form.getRawValue().defaultPriceListId);
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
    const body: BranchRequest = {
      code: value.code.trim(),
      name: value.name.trim(),
      address: blankToNull(value.address),
      phone: blankToNull(value.phone),
      countryId: value.countryId,
      allowNegativeStock: value.allowNegativeStock,
      active: value.active,
      defaultPriceListId: value.defaultPriceListId,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.branch === null
      ? this.api.create(body)
      : this.api.update(this.branch.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  private fillForm(): void {
    const branch = this.branch;
    if (branch !== null) {
      this.form.patchValue({
        code: branch.code,
        name: branch.name,
        address: branch.address ?? '',
        phone: branch.phone ?? '',
        countryId: branch.countryId,
        allowNegativeStock: branch.allowNegativeStock,
        defaultPriceListId: branch.defaultPriceListId,
        active: branch.active,
      });
    }
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
