import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { CountryFormComponent } from './country-form';

/** Listado de países con alta y edición. Solo la central escribe. */
@Component({
  selector: 'app-countries',
  imports: [TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './countries.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountriesComponent implements OnInit {
  private readonly api = inject(CountriesApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly countries = new PagedList<CountryView>((request) => this.api.list(request), 'isoCode');
  /** Clave de traducción del aviso de la última operación completada. */
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.countries.load();
  }

  protected create(): void {
    const ref = this.modal.open(CountryFormComponent, { size: 'lg' });
    ref.componentInstance.country = null;
    this.afterClose(ref.result);
  }

  protected edit(country: CountryView): void {
    const ref = this.modal.open(CountryFormComponent, { size: 'lg' });
    ref.componentInstance.country = country;
    this.afterClose(ref.result);
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>): void {
    result.then(
      () => {
        this.notice.set('organization.countries.saved');
        this.countries.load();
      },
      () => undefined,
    );
  }
}
