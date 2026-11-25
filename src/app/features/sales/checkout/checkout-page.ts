import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { CompanyApi } from '../../../core/api/company-api';
import { SaleView, SalesApi } from '../../../core/api/sales-api';
import { readProblem } from '../../../core/http/problem-details';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { numberToCents } from '../../../shared/forms/amounts';
import { randomUuid } from '../../../shared/ids/random-uuid';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { OrderReviewComponent } from './order-review';
import { PaymentEntryFormComponent } from './payment-entry-form';
import { PaymentListComponent } from './payment-list';
import {
  AddedPayment,
  NewPayment,
  canConfirmPayments,
  changeOf,
  isCreditNoteMethod,
  paidOf,
  pendingOf,
} from './payment-math';

/**
 * Cobro de una venta en espera. Muestra la orden en solo lectura (para cambiarla se vuelve a la
 * orden) y recibe los pagos: se agregan o se quitan, nunca se editan. Confirmar cobra la venta con
 * esos pagos; la clave de idempotencia se crea una vez por carga y se reusa en los reintentos.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [RouterLink, ProblemAlertComponent, TranslatePipe, OrderReviewComponent, PaymentEntryFormComponent, PaymentListComponent],
  templateUrl: './checkout-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sales = inject(SalesApi);
  private readonly companyApi = inject(CompanyApi);

  /** Clave de idempotencia: se crea una vez por carga de la pantalla y se reusa en los reintentos. */
  private readonly idempotencyKey = randomUuid();
  private nextKey = 1;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly invalidId = signal(false);
  protected readonly notOnHold = signal(false);
  protected readonly sale = signal<SaleView | null>(null);
  protected readonly currency = signal<string | null>(null);

  protected readonly payments = signal<readonly AddedPayment[]>([]);
  protected readonly saving = signal(false);
  protected readonly actionError = signal<unknown>(null);

  /**
   * Error de existencia al cobrar: el texto traducido y el detalle del servidor, que nombra el
   * producto. Null si el error es otro.
   */
  protected readonly shortage = computed<{ readonly detail: string } | null>(() => {
    const problem = readProblem(this.actionError());
    return problem?.code === 'INSUFFICIENT_STOCK' ? { detail: problem.detail ?? '' } : null;
  });

  private readonly requests = computed(() => this.payments().map((payment) => payment.request));
  protected readonly totalCents = computed(() => {
    const current = this.sale();
    return current === null ? 0 : numberToCents(current.totals.total);
  });
  protected readonly paidCents = computed(() => paidOf(this.requests()));
  protected readonly pendingCents = computed(() => pendingOf(this.totalCents(), this.requests()));
  protected readonly changeCents = computed(() => changeOf(this.requests()));
  /** Números de las notas de crédito ya agregadas; el formulario no deja usar una dos veces. */
  protected readonly creditNoteNumbers = computed(() =>
    this.requests()
      .filter((request) => isCreditNoteMethod(request.paymentMethodCode))
      .map((request) => request.creditNoteNumber ?? '')
      .filter((number) => number !== ''),
  );
  protected readonly canConfirm = computed(
    () => this.sale() !== null && !this.saving() && canConfirmPayments(this.totalCents(), this.requests()),
  );

  constructor() {
    this.companyApi
      .get()
      .pipe(
        map((company) => company.currency),
        catchError(() => of(null)),
        takeUntilDestroyed(),
      )
      .subscribe((currency) => this.currency.set(currency));

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.load(params.get('id')));
  }

  protected addPayment(payment: NewPayment): void {
    this.payments.update((list) => [...list, { key: this.nextKey++, ...payment }]);
  }

  protected removePayment(key: number): void {
    this.payments.update((list) => list.filter((payment) => payment.key !== key));
  }

  /** Cobra la venta con los pagos. Solo si suman el total; el ticket se abre al terminar. */
  protected confirm(): void {
    const current = this.sale();
    if (current === null || !this.canConfirm()) {
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    this.sales
      .checkoutHold(current.id, {
        payments: this.requests(),
        idempotencyKey: this.idempotencyKey,
        notes: null,
      })
      .subscribe({
        next: (paid) => {
          void this.router.navigate(['/sales/tickets', paid.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.actionError.set(error);
        },
      });
  }

  private load(idText: string | null): void {
    const id = Number(idText);
    if (idText === null || !Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.invalidId.set(false);
    this.loading.set(true);
    this.loadError.set(null);
    this.notOnHold.set(false);
    this.sales.getHold(id).subscribe({
      next: (sale) => {
        this.loading.set(false);
        if (sale.status !== 'ON_HOLD') {
          this.notOnHold.set(true);
          return;
        }
        this.sale.set(sale);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(error);
      },
    });
  }
}
