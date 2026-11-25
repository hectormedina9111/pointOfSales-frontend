import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { StoreNodesApi, StoreNodeView } from '../../../core/api/store-nodes-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Alta de tienda. La sucursal es opcional y solo se ofrecen las activas que ve el usuario.
 * Cierra el diálogo con la tienda creada, para que el panel muestre su número.
 */
@Component({
  selector: 'app-store-node-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, TranslatePipe],
  templateUrl: './store-node-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreNodeFormComponent implements OnInit {
  private readonly api = inject(StoreNodesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);

  protected readonly form = this.fb.group({
    branchId: this.fb.control<number | null>(null),
  });

  ngOnInit(): void {
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => {
        this.branches.set(list.filter((branch) => branch.active));
        this.lookupsLoading.set(false);
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.api.create(this.form.getRawValue().branchId).subscribe({
      next: (created: StoreNodeView) => this.activeModal.close(created),
      error: (error: unknown) => {
        this.error.set(error);
        this.submitting.set(false);
      },
    });
  }
}
