import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { CountryView } from '../../../core/api/countries-api';
import { TaxView, TaxesApi } from '../../../core/api/taxes-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { CentralCountriesService } from '../../../core/system/central-countries.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { formatAmount } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TaxFormComponent } from './tax-form';

/** Listado de impuestos, filtrado por país, con alta y edición. */
@Component({
  selector: 'app-taxes',
  imports: [ReactiveFormsModule, TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './taxes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxesComponent implements OnInit {
  private readonly api = inject(TaxesApi);
  private readonly centralCountries = inject(CentralCountriesService);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly systemInfo = inject(SystemInfoService);
  protected readonly isCentral = this.systemInfo.isCentral;
  /** En una tienda no hay países que filtrar: el filtro no aparece. */
  protected readonly isStore = this.systemInfo.isStore;
  /** Filtro por país. Null muestra los impuestos de todos los países. */
  protected readonly countryFilter = this.fb.control<number | null>(null);
  protected readonly taxes = new PagedList<TaxView>(
    (request) => this.api.list(request, this.countryFilter.getRawValue()),
    'code',
  );
  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly countryNames = computed(
    () => new Map(this.countries().map((country) => [country.id, country.isoCode] as const)),
  );
  protected readonly notice = signal<string | null>(null);
  protected readonly formatAmount = formatAmount;

  constructor() {
    this.countryFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.taxes.goToPage(0));
  }

  ngOnInit(): void {
    this.taxes.load();
    this.centralCountries.list().subscribe({
      next: (countries) => this.countries.set(countries),
    });
  }

  protected create(): void {
    const ref = this.modal.open(TaxFormComponent, { size: 'lg' });
    ref.componentInstance.tax = null;
    ref.componentInstance.defaultCountryId = this.countryFilter.getRawValue();
    this.afterClose(ref.result);
  }

  protected edit(tax: TaxView): void {
    const ref = this.modal.open(TaxFormComponent, { size: 'lg' });
    ref.componentInstance.tax = tax;
    this.afterClose(ref.result);
  }

  protected countryName(id: number): string {
    return this.countryNames().get(id) ?? '';
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>): void {
    result.then(
      () => {
        this.notice.set('catalog.taxes.saved');
        this.taxes.load();
      },
      () => undefined,
    );
  }
}
