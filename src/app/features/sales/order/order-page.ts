import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, map, of } from 'rxjs';

import { CashSessionsApi } from '../../../core/api/cash-sessions-api';
import { CompanyApi } from '../../../core/api/company-api';
import { AuthorizationRequest, SalesApi } from '../../../core/api/sales-api';
import { readProblem } from '../../../core/http/problem-details';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ManagerAuthorizationComponent } from '../shared/manager-authorization';
import { OrderCustomerStepComponent } from './order-customer-step';
import { OrderDraftStore } from './order-draft.store';
import { OrderProductsStepComponent } from './order-products-step';
import { OrderSummaryStepComponent } from './order-summary-step';
import { OrderTypeStepComponent } from './order-type-step';

/** Estado de la caja para esta pantalla: cargando, sin sesión abierta, con sesión o con error al consultarla. */
type SessionState = 'loading' | 'none' | 'open' | 'error';

/** Códigos que piden la autorización de un jefe de tienda al guardar. */
const AUTHORIZATION_CODES = ['DISCOUNT_AUTHORIZATION_REQUIRED', 'PRICE_OVERRIDE_AUTHORIZATION_REQUIRED'];

/**
 * Orden de venta en cuatro pasos: cliente, tipo, productos y resumen. Guardar la orden la deja en
 * espera (nueva o reemplazando la que se edita) y lleva a la pantalla de cobro; aquí no se cobra.
 * La ruta sales/pos/:id abre una orden en espera para editarla. Si el guardado pide la autorización
 * de un jefe de tienda, se pregunta con un diálogo y el guardado se reintenta con esas credenciales.
 * En la central solo muestra un aviso: las ventas se hacen en las tiendas.
 */
@Component({
  selector: 'app-order-page',
  imports: [
    RouterLink,
    ProblemAlertComponent,
    StepperComponent,
    StepComponent,
    IfPrivilegeDirective,
    TranslatePipe,
    OrderCustomerStepComponent,
    OrderTypeStepComponent,
    OrderProductsStepComponent,
    OrderSummaryStepComponent,
  ],
  providers: [OrderDraftStore],
  templateUrl: './order-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPageComponent {
  private readonly cashSessions = inject(CashSessionsApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly sales = inject(SalesApi);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(OrderDraftStore);
  protected readonly system = inject(SystemInfoService);

  protected readonly isStore = this.system.isStore;
  protected readonly isCentral = this.system.isCentral;

  protected readonly sessionState = signal<SessionState>('loading');
  protected readonly loadError = signal<unknown>(null);
  /** Verdadero mientras se carga la venta en espera que se edita. */
  protected readonly loadingSaved = signal(false);
  protected readonly invalidId = signal(false);
  /** La venta de la ruta ya fue cobrada o anulada: no se puede editar. */
  protected readonly notEditable = signal(false);

  /** Id de la ruta (sales/pos/:id); null para una orden nueva. */
  private readonly routeId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );

  /** Controles de cada paso: el asistente no avanza mientras alguno no esté válido. */
  protected readonly customerControls: readonly AbstractControl[] = [this.store.customerControl];
  protected readonly typeControls: readonly AbstractControl[] = [this.store.orderTypeControl];
  protected readonly productControls: readonly AbstractControl[] = [this.store.productsControl];
  protected readonly noControls: readonly AbstractControl[] = [];

  private started = false;

  constructor() {
    // Los datos del nodo llegan de forma asíncrona: la carga empieza cuando se sabe que es una tienda.
    effect(() => {
      if (this.isStore() && !this.started) {
        this.started = true;
        untracked(() => this.load());
      }
    });

    // La ruta (o la caja) cambian: se carga la venta en espera pedida, o la orden se deja nueva.
    effect(() => {
      const id = this.routeId();
      const state = this.sessionState();
      untracked(() => this.applyRoute(id, state));
    });
  }

  protected async cancelOrder(): Promise<void> {
    const wasSaved = this.store.savedId() !== null;
    if (!this.store.hasLines() && !wasSaved) {
      this.store.reset();
      return;
    }
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'sales.order.cancel.title',
      messageKey: 'sales.order.cancel.message',
      confirmKey: 'sales.order.cancel.confirm',
    });
    if (!confirmed) {
      return;
    }
    this.store.reset();
    if (wasSaved) {
      void this.router.navigate(['/sales/pos']);
    }
  }

  /**
   * Va al listado de órdenes en espera. Si la orden tiene líneas, se salen sin guardar: se pide
   * confirmación antes de dejarlas.
   */
  protected async openSaved(): Promise<void> {
    if (this.store.hasLines()) {
      const confirmed = await openConfirmDialog(this.modal, {
        titleKey: 'sales.order.leave.title',
        messageKey: 'sales.order.leave.message',
        confirmKey: 'sales.order.leave.confirm',
      });
      if (!confirmed) {
        return;
      }
    }
    void this.router.navigate(['/sales'], { queryParams: { status: 'ON_HOLD' } });
  }

  /** Guarda la orden y lleva a la pantalla de cobro. Con authorization, es el reintento tras autorizar. */
  protected save(authorization: AuthorizationRequest | null = null): void {
    if (this.store.busy() || !this.store.readyToSave()) {
      return;
    }
    this.store.busy.set(true);
    this.store.actionError.set(null);
    this.store.save(authorization).subscribe({
      next: (sale) => {
        this.store.busy.set(false);
        void this.router.navigate(['/sales/checkout', sale.id]);
      },
      error: (error: unknown) => {
        this.store.busy.set(false);
        const code = readProblem(error)?.code ?? '';
        if (AUTHORIZATION_CODES.includes(code)) {
          this.askManager(code);
          return;
        }
        this.store.actionError.set(error);
      },
    });
  }

  private askManager(code: string): void {
    const ref = this.modal.open(ManagerAuthorizationComponent, { centered: true });
    ref.componentInstance.introKey =
      code === 'PRICE_OVERRIDE_AUTHORIZATION_REQUIRED' ? 'sales.pos.authorization.priceIntro' : 'sales.pos.authorization.intro';
    ref.result.then((authorization: AuthorizationRequest) => this.save(authorization), () => undefined);
  }

  private load(): void {
    this.companyApi
      .get()
      .pipe(
        map((company) => company.currency),
        catchError(() => of(null)),
      )
      .subscribe((currency) => this.store.currency.set(currency));

    this.cashSessions.current().subscribe({
      next: (session) => this.sessionState.set(session === null ? 'none' : 'open'),
      error: (error: unknown) => {
        this.loadError.set(error);
        this.sessionState.set('error');
      },
    });
  }

  private applyRoute(idText: string | null, state: SessionState): void {
    if (state !== 'open') {
      return;
    }
    if (idText === null) {
      if (this.store.savedId() !== null) {
        this.store.reset();
      }
      return;
    }
    const id = Number(idText);
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      return;
    }
    this.invalidId.set(false);
    this.notEditable.set(false);
    if (id === this.store.savedId()) {
      return;
    }
    this.loadingSaved.set(true);
    this.store.actionError.set(null);
    this.sales.getHold(id).subscribe({
      next: (sale) => {
        this.loadingSaved.set(false);
        if (sale.status !== 'ON_HOLD') {
          this.notEditable.set(true);
          return;
        }
        this.store.load(sale);
      },
      error: (error: unknown) => {
        this.loadingSaved.set(false);
        this.store.actionError.set(error);
      },
    });
  }
}
