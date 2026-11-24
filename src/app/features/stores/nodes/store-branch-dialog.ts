import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { StoreNodesApi, StoreNodeView } from '../../../core/api/store-nodes-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Asignar o quitar la sucursal de una tienda. Ofrece las sucursales activas que ve el usuario y,
 * aunque esté inactiva, la actual de la tienda. Cierra el diálogo con la tienda actualizada.
 * Quien lo abre asigna la tienda en `node`.
 */
@Component({
  selector: 'app-store-branch-dialog',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './store-branch-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreBranchDialogComponent implements OnInit {
  private readonly api = inject(StoreNodesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Tienda a la que se cambia la sucursal. La asigna quien abre el diálogo. */
  node: StoreNodeView | null = null;

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);

  protected readonly form = this.fb.group({
    branchId: this.fb.control<number | null>(null),
  });

  ngOnInit(): void {
    const current = this.node?.branchId ?? null;
    this.form.reset({ branchId: current });
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => {
        this.branches.set(list.filter((branch) => branch.active || branch.id === current));
        this.lookupsLoading.set(false);
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  protected submit(): void {
    if (this.submitting() || this.node === null) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.api.assignBranch(this.node.id, this.form.getRawValue().branchId).subscribe({
      next: (updated: StoreNodeView) => this.activeModal.close(updated),
      error: (error: unknown) => {
        this.error.set(error);
        this.submitting.set(false);
      },
    });
  }
}
