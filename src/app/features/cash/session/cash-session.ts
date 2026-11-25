import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, map, of, switchMap } from 'rxjs';

import { CompanyApi } from '../../../core/api/company-api';
import { CashRegisterView, CashRegistersApi } from '../../../core/api/cash-registers-api';
import {
  CashMovementType,
  CashSessionDetailView,
  CashSessionsApi,
  OpenCashSessionRequest,
  SessionSummaryView,
} from '../../../core/api/cash-sessions-api';
import { listAllPages } from '../../../core/api/page';
import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { AMOUNT_PATTERN, formatMoney } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { differenceBadgeClass } from '../cash-format';
import { CashCloseFormComponent } from './cash-close-form';
import { CashMovementFormComponent } from './cash-movement-form';

/** Estado que trae la carga: la sesión abierta del cajero (o null) y su resumen. */
interface CurrentState {
  readonly session: CashSessionDetailView | null;
  readonly summary: SessionSummaryView | null;
}

/** Una fila del resumen: método de pago (nombre ya resuelto) y lo que debería haber. */
interface SummaryRow {
  readonly code: string;
  readonly name: string;
  readonly expected: number;
}

/**
 * Mi caja, en la tienda. Sin sesión abierta muestra el asistente para abrirla; con sesión, el
 * resumen, los movimientos y las acciones (depósito, retiro, cierre). Tras cerrar, muestra el
 * resultado del cierre con botón de imprimir. En la central solo muestra que la caja se opera
 * en las tiendas.
 */
@Component({
  selector: 'app-cash-session',
  imports: [
    ReactiveFormsModule,
    ProblemAlertComponent,
    FieldErrorComponent,
    FieldLabelComponent,
    StepperComponent,
    StepComponent,
    LocalDateTimePipe,
    TranslatePipe,
  ],
  templateUrl: './cash-session.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashSessionComponent {
  private readonly api = inject(CashSessionsApi);
  private readonly registersApi = inject(CashRegistersApi);
  private readonly methodsApi = inject(PaymentMethodsApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly language = inject(LanguageService);
  protected readonly privileges = inject(PrivilegesService);
  protected readonly system = inject(SystemInfoService);

  protected readonly isStore = this.system.isStore;
  protected readonly isCentral = this.system.isCentral;
  protected readonly isInvalid = isInvalidControl;
  /** Fecha de hoy para el resumen de apertura; se fija al entrar en la pantalla. */
  protected readonly today = new Date();

  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly session = signal<CashSessionDetailView | null>(null);
  protected readonly summary = signal<SessionSummaryView | null>(null);
  /** Resultado del último cierre, mostrado hasta que se recarga la pantalla o se abre otra caja. */
  protected readonly closed = signal<CashSessionDetailView | null>(null);
  protected readonly registers = signal<readonly CashRegisterView[]>([]);
  protected readonly methods = signal<readonly PaymentMethodView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly openError = signal<unknown>(null);

  protected readonly activeRegisters = computed(() => this.registers().filter((register) => register.active));
  private readonly methodNames = computed(
    () => new Map(this.methods().map((method) => [method.code, method.name] as const)),
  );
  protected readonly summaryRows = computed<readonly SummaryRow[]>(() => {
    const summary = this.summary();
    if (summary === null) {
      return [];
    }
    return Object.entries(summary.expectedByMethod).map(([code, expected]) => ({
      code,
      name: this.methodNames().get(code) ?? code,
      expected,
    }));
  });

  /** Asistente de apertura: caja (paso 1) y fondo inicial (paso 2). */
  protected readonly openForm = this.fb.group({
    cashRegisterId: this.fb.control<number | null>(null, [Validators.required]),
    openingAmount: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
  });
  protected readonly registerControls = [this.openForm.controls.cashRegisterId];
  protected readonly amountControls = [this.openForm.controls.openingAmount];

  private started = false;

  constructor() {
    // Los datos del nodo llegan de forma asíncrona: la carga empieza cuando se sabe que es una tienda.
    effect(() => {
      if (this.isStore() && !this.started) {
        this.started = true;
        untracked(() => this.load());
      }
    });
  }

  protected can(privilege: string): boolean {
    return this.privileges.has(privilege);
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected differenceBadge(value: number | null): string | null {
    return differenceBadgeClass(value);
  }

  protected registerLabel(registerId: number): string {
    const register = this.registers().find((item) => item.id === registerId);
    return register ? `${register.code} · ${register.name}` : String(registerId);
  }

  protected methodName(code: string): string {
    return this.methodNames().get(code) ?? code;
  }

  protected open(): void {
    const value = this.openForm.getRawValue();
    if (value.cashRegisterId === null || this.openForm.invalid) {
      this.openForm.markAllAsTouched();
      return;
    }
    const body: OpenCashSessionRequest = {
      cashRegisterId: value.cashRegisterId,
      openingAmount: value.openingAmount.trim(),
    };
    this.opening.set(true);
    this.openError.set(null);
    this.api.open(body).subscribe({
      next: () => {
        this.opening.set(false);
        this.openForm.reset({ cashRegisterId: null, openingAmount: '' });
        this.closed.set(null);
        this.notice.set('cash.session.opened');
        this.refresh();
      },
      error: (error: unknown) => {
        this.openError.set(error);
        this.opening.set(false);
      },
    });
  }

  protected cancelOpen(): void {
    this.openForm.reset({ cashRegisterId: null, openingAmount: '' });
    this.openError.set(null);
  }

  protected addMovement(type: CashMovementType): void {
    const session = this.session();
    if (session === null) {
      return;
    }
    const ref = this.modal.open(CashMovementFormComponent, { size: 'lg' });
    ref.componentInstance.sessionId = session.id;
    ref.componentInstance.type = type;
    ref.result.then(
      () => {
        this.notice.set(type === 'DEPOSIT' ? 'cash.session.deposit.saved' : 'cash.session.withdrawal.saved');
        this.refresh();
      },
      () => undefined,
    );
  }

  protected closeSession(): void {
    const session = this.session();
    if (session === null) {
      return;
    }
    const ref = this.modal.open(CashCloseFormComponent, { size: 'lg' });
    ref.componentInstance.sessionId = session.id;
    ref.componentInstance.summary = this.summary();
    ref.componentInstance.currency = this.currency();
    ref.result.then(
      (result: CashSessionDetailView) => {
        this.notice.set(null);
        this.session.set(null);
        this.summary.set(null);
        this.closed.set(result);
      },
      () => undefined,
    );
  }

  protected print(): void {
    window.print();
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.companyApi.get().pipe(catchError(() => of(null))).subscribe((company) => {
      this.currency.set(company?.currency ?? null);
    });
    listAllPages((request) => this.registersApi.list(request, { branchId: null, active: null }), 'code').subscribe({
      next: (registers) => this.registers.set(registers),
      error: (error: unknown) => this.loadError.set(error),
    });
    listAllPages((request) => this.methodsApi.list(request, null), 'code').subscribe({
      next: (methods) => this.methods.set(methods),
      error: (error: unknown) => this.loadError.set(error),
    });
    this.refresh();
  }

  /** Vuelve a leer la sesión abierta y su resumen. Sin sesión, solo deja la pantalla de apertura. */
  private refresh(): void {
    this.api
      .current()
      .pipe(
        switchMap((session) =>
          session === null
            ? of<CurrentState>({ session: null, summary: null })
            : this.api.summary(session.id).pipe(map((summary) => ({ session, summary }))),
        ),
      )
      .subscribe({
        next: (state) => {
          this.session.set(state.session);
          this.summary.set(state.summary);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loadError.set(error);
          this.loading.set(false);
        },
      });
  }
}
