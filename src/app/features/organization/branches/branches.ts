import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { listAllPages } from '../../../core/api/page';
import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CountriesApi, CountryView } from '../../../core/api/countries-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { BranchFormComponent } from './branch-form';

/**
 * Listado de sucursales con alta y edición. La central ve todas las sucursales; una tienda solo ve
 * la que le asignó la central, y por eso muestra un aviso.
 */
@Component({
  selector: 'app-branches',
  imports: [TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './branches.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchesComponent implements OnInit {
  private readonly api = inject(BranchesApi);
  private readonly countriesApi = inject(CountriesApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  private readonly systemInfo = inject(SystemInfoService);
  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly isStore = this.systemInfo.isStore;
  protected readonly branches = new PagedList<BranchView>((request) => this.api.list(request), 'code');
  protected readonly countries = signal<readonly CountryView[]>([]);
  protected readonly countryNames = computed(
    () => new Map(this.countries().map((country) => [country.id, country.isoCode] as const)),
  );
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.branches.load();
    listAllPages((request) => this.countriesApi.list(request), 'isoCode').subscribe({
      next: (countries) => this.countries.set(countries),
    });
  }

  protected create(): void {
    const ref = this.modal.open(BranchFormComponent, { size: 'lg' });
    ref.componentInstance.branch = null;
    this.afterClose(ref.result);
  }

  protected edit(branch: BranchView): void {
    const ref = this.modal.open(BranchFormComponent, { size: 'lg' });
    ref.componentInstance.branch = branch;
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
        this.notice.set('organization.branches.saved');
        this.branches.load();
      },
      () => undefined,
    );
  }
}
