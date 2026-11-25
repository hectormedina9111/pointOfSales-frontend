import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, map, of } from 'rxjs';

import { CompanyApi } from '../../../core/api/company-api';
import { listAllPages } from '../../../core/api/page';
import { PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { AuthorizationRequest, SalesApi } from '../../../core/api/sales-api';
import { readProblem } from '../../../core/http/problem-details';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ManagerAuthorizationComponent } from '../shared/manager-authorization';
import { ReturnDraftStore } from './return-draft.store';
import { ReturnLinesStepComponent } from './return-lines-step';
import { ReturnRefundStepComponent } from './return-refund-step';
import { ReturnSummaryStepComponent } from './return-summary-step';

/** Código que pide la autorización de un jefe de tienda para devolver. */
const AUTHORIZATION_CODE = 'RETURN_AUTHORIZATION_REQUIRED';

/**
 * Devolución de una venta cobrada en cuatro pasos: líneas y cantidades, motivo y reembolso, y
 * resumen. Confirmar crea la devolución y lleva a su ticket. Si el servidor pide la autorización de
 * un jefe de tienda, se pregunta con el diálogo de siempre y se reintenta con esas credenciales.
 */
@Component({
  selector: 'app-return-page',
  imports: [
    ProblemAlertComponent,
    StepperComponent,
    StepComponent,
    TranslatePipe,
    ReturnLinesStepComponent,
    ReturnRefundStepComponent,
    ReturnSummaryStepComponent,
  ],
  providers: [ReturnDraftStore],
  templateUrl: './return-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sales = inject(SalesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly paymentMethods = inject(PaymentMethodsApi);
  private readonly modal = inject(NgbModal);
  protected readonly store = inject(ReturnDraftStore);

  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);

  /** Una venta de otra sucursal no tiene detalle en esta tienda: su vuelta es la búsqueda. */
  protected readonly foreign = computed(() => this.store.returnable()?.foreign ?? false);
  protected readonly backLabelKey = computed(() =>
    this.foreign() ? 'sales.return.backToLookup' : 'sales.return.back',
  );

  protected readonly lineControls: readonly AbstractControl[] = [this.store.linesControl];
  protected readonly refundControls: readonly AbstractControl[] = [this.store.reasonControl, this.store.refundsControl];
  protected readonly summaryControls: readonly AbstractControl[] = [this.store.summaryControl];

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }

    listAllPages((request) => this.paymentMethods.list(request), 'name').subscribe({
      next: (methods) => this.store.paymentMethods.set(methods),
      error: () => undefined,
    });
    this.companyApi
      .get()
      .pipe(
        map((company) => company.currency),
        catchError(() => of(null)),
      )
      .subscribe((currency) => this.store.currency.set(currency));

    this.sales.returnable(id).subscribe({
      next: (returnable) => {
        this.store.start(id, returnable);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(this.foreign() ? '/sales/returns/lookup' : `/sales/orders/${this.store.saleId}`);
  }

  /**
   * Crea la devolución. Con authorization, es el reintento tras autorizar; la clave de idempotencia
   * es la misma, así que no se duplica.
   */
  protected confirm(authorization: AuthorizationRequest | null = null): void {
    if (this.store.saving() || !this.store.quoteReady()) {
      return;
    }
    this.store.saving.set(true);
    this.store.actionError.set(null);
    this.sales.createReturn(this.store.saleId, this.store.buildRequest(authorization)).subscribe({
      next: (created) => {
        void this.router.navigate(['/sales/tickets', created.id]);
      },
      error: (error: unknown) => {
        this.store.saving.set(false);
        if (readProblem(error)?.code === AUTHORIZATION_CODE) {
          this.askManager();
          return;
        }
        this.store.actionError.set(error);
      },
    });
  }

  private askManager(): void {
    const ref = this.modal.open(ManagerAuthorizationComponent, { centered: true });
    ref.componentInstance.introKey = 'sales.return.authorization.intro';
    ref.result.then((authorization: AuthorizationRequest) => this.confirm(authorization), () => undefined);
  }
}
