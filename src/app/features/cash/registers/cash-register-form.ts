import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { CashRegisterRequest, CashRegisterView, CashRegistersApi } from '../../../core/api/cash-registers-api';
import { listAllPages } from '../../../core/api/page';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Alta y edición de caja. Cierra el diálogo con la caja guardada. */
@Component({
  selector: 'app-cash-register-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './cash-register-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashRegisterFormComponent implements OnInit {
  private readonly api = inject(CashRegistersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Caja a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  register: CashRegisterView | null = null;

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly branchesLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    branchId: this.fb.control<number | null>(null, [Validators.required]),
    code: this.fb.control('', [Validators.required, Validators.maxLength(10)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(80)]),
    receiptPrefix: this.fb.control('', [Validators.required, Validators.maxLength(20)]),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (branches) => {
        this.branches.set(branches);
        this.branchesLoading.set(false);
        this.fillForm();
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.branchesLoading.set(false);
      },
    });
  }

  /** Sucursales activas, más la de la caja aunque esté inactiva. */
  protected branchOptions(): readonly BranchView[] {
    const current = this.form.getRawValue().branchId;
    return this.branches().filter((branch) => branch.active || branch.id === current);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.branchId === null) {
      return;
    }
    const body: CashRegisterRequest = {
      branchId: value.branchId,
      code: value.code.trim(),
      name: value.name.trim(),
      receiptPrefix: value.receiptPrefix.trim(),
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.register === null
      ? this.api.create(body)
      : this.api.update(this.register.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  private fillForm(): void {
    const register = this.register;
    if (register !== null) {
      this.form.patchValue({
        branchId: register.branchId,
        code: register.code,
        name: register.name,
        receiptPrefix: register.receiptPrefix,
        active: register.active,
      });
    }
  }
}
