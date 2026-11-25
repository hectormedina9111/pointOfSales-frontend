import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { merge } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CashRegisterFilters, CashRegisterView, CashRegistersApi } from '../../../core/api/cash-registers-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { branchLabel } from '../../../shared/stores/branch-label';
import { CashRegisterFormComponent } from './cash-register-form';

/**
 * Listado de cajas por sucursal, con filtros de sucursal y estado. Solo la central da de alta y
 * edita; en una tienda el listado es de solo lectura.
 */
@Component({
  selector: 'app-cash-registers',
  imports: [ReactiveFormsModule, TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './cash-registers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashRegistersComponent implements OnInit {
  private readonly api = inject(CashRegistersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;

  protected readonly filterForm = this.fb.group({
    branchId: this.fb.control<number | null>(null),
    active: this.fb.control<boolean | null>(null),
  });

  protected readonly registers = new PagedList<CashRegisterView>(
    (request) => this.api.list(request, this.filters()),
    'branchId,code',
  );
  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );
  protected readonly branchError = signal<unknown>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly branchText = branchLabel;

  constructor() {
    merge(this.filterForm.controls.branchId.valueChanges, this.filterForm.controls.active.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.registers.restart());
  }

  ngOnInit(): void {
    this.registers.load();
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (branches) => this.branches.set(branches),
      error: (error: unknown) => this.branchError.set(error),
    });
  }

  protected create(): void {
    const ref = this.modal.open(CashRegisterFormComponent, { size: 'lg' });
    ref.componentInstance.register = null;
    this.afterClose(ref.result, 'cash.registers.saved');
  }

  protected edit(register: CashRegisterView): void {
    const ref = this.modal.open(CashRegisterFormComponent, { size: 'lg' });
    ref.componentInstance.register = register;
    this.afterClose(ref.result, 'cash.registers.saved');
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private filters(): CashRegisterFilters {
    const value = this.filterForm.getRawValue();
    return { branchId: value.branchId, active: value.active };
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.registers.load();
      },
      () => undefined,
    );
  }
}
