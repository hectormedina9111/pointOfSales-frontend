import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { UnitOfMeasureView, UnitsApi } from '../../../core/api/units-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { UnitFormComponent } from './unit-form';

/** Listado de unidades de medida con alta y edición. */
@Component({
  selector: 'app-units',
  imports: [TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './units.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitsComponent implements OnInit {
  private readonly api = inject(UnitsApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly units = new PagedList<UnitOfMeasureView>((request) => this.api.list(request), 'code');
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.units.load();
  }

  protected create(): void {
    const ref = this.modal.open(UnitFormComponent, { size: 'lg' });
    ref.componentInstance.unit = null;
    this.afterClose(ref.result);
  }

  protected edit(unit: UnitOfMeasureView): void {
    const ref = this.modal.open(UnitFormComponent, { size: 'lg' });
    ref.componentInstance.unit = unit;
    this.afterClose(ref.result);
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>): void {
    result.then(
      () => {
        this.notice.set('catalog.units.saved');
        this.units.load();
      },
      () => undefined,
    );
  }
}
