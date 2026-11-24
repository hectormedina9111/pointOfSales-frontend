import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { listAllPages } from '../../../core/api/page';
import { PriceListFilters, PriceListView, PriceListsApi } from '../../../core/api/price-lists-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { formatAmount } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PriceListFormComponent } from './price-list-form';

/**
 * Listado de listas de precios, filtrado por país y estado, con alta y edición. Las listas de
 * precio fijo tienen un enlace a sus precios por producto.
 */
@Component({
  selector: 'app-price-lists',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ProblemAlertComponent,
    PaginationComponent,
    IfPrivilegeDirective,
  ],
  templateUrl: './price-lists.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListsComponent implements OnInit {
  private readonly api = inject(PriceListsApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;

  protected readonly filterForm = this.fb.group({
    countryId: this.fb.control<number | null>(null),
    active: this.fb.control<boolean | null>(null),
  });

  protected readonly priceLists = new PagedList<PriceListView>(
    (request) => this.api.list(request, this.filters()),
    'code',
  );
  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly countryCodes = computed(
    () => new Map(this.countries().map((country) => [country.id, country.isoCode] as const)),
  );
  protected readonly notice = signal<string | null>(null);
  protected readonly formatAmount = formatAmount;

  constructor() {
    this.filterForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.priceLists.goToPage(0));
  }

  ngOnInit(): void {
    this.priceLists.load();
    listAllPages((request) => this.countriesApi.list(request), 'isoCode').subscribe({
      next: (countries) => this.countries.set(countries),
    });
  }

  protected create(): void {
    const ref = this.modal.open(PriceListFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.priceList = null;
    this.afterClose(ref.result, 'pricing.priceLists.saved');
  }

  protected edit(list: PriceListView): void {
    const ref = this.modal.open(PriceListFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.priceList = list;
    this.afterClose(ref.result, 'pricing.priceLists.saved');
  }

  /** Solo las listas de precio fijo tienen precios por producto. */
  protected hasItems(list: PriceListView): boolean {
    return list.pricingMethod === 'FIXED_PRICE';
  }

  /** El descuento solo se muestra en las listas de descuento. */
  protected percentLabel(list: PriceListView): string {
    return list.pricingMethod === 'PERCENT_OFF_BASE' && list.percent !== null ? `${formatAmount(list.percent)}%` : '';
  }

  protected countryCode(id: number): string {
    return this.countryCodes().get(id) ?? '';
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Filtros actuales: un valor null no filtra. */
  private filters(): PriceListFilters {
    const value = this.filterForm.getRawValue();
    return { countryId: value.countryId, active: value.active };
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.priceLists.load();
      },
      () => undefined,
    );
  }
}
