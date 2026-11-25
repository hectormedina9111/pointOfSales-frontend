import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { merge } from 'rxjs';

import { CashRegisterView, CashRegistersApi } from '../../../core/api/cash-registers-api';
import {
  CashSessionFilters,
  CashSessionStatus,
  CashSessionView,
  CashSessionsApi,
} from '../../../core/api/cash-sessions-api';
import { listAllPages } from '../../../core/api/page';
import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { CompanyApi } from '../../../core/api/company-api';
import { UserView, UsersApi } from '../../../core/api/users-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { differenceBadgeClass } from '../cash-format';
import { CashSessionDetailComponent } from './cash-session-detail';

/** Inicio y fin de un día (YYYY-MM-DD) en la hora local, como instantes ISO-8601 en UTC. */
function startOfDay(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function endOfDay(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

/**
 * Sesiones de caja para el responsable: listado paginado con filtros de estado, caja y rango de
 * fechas. Cada fila abre el detalle. Es solo lectura, en la central y en las tiendas.
 */
@Component({
  selector: 'app-cash-sessions',
  imports: [ReactiveFormsModule, ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './cash-sessions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashSessionsComponent implements OnInit {
  private readonly api = inject(CashSessionsApi);
  private readonly registersApi = inject(CashRegistersApi);
  private readonly usersApi = inject(UsersApi);
  private readonly methodsApi = inject(PaymentMethodsApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly language = inject(LanguageService);

  protected readonly filterForm = this.fb.group({
    status: this.fb.control<CashSessionStatus | null>(null),
    cashRegisterId: this.fb.control<number | null>(null),
    from: this.fb.control(''),
    to: this.fb.control(''),
  });

  protected readonly sessions = new PagedList<CashSessionView>(
    (request) => this.api.list(request, this.filters()),
    'openedAt,desc',
  );

  protected readonly registers = signal<readonly CashRegisterView[]>([]);
  protected readonly users = signal<ReadonlyMap<number, UserView>>(new Map());
  protected readonly methods = signal<readonly PaymentMethodView[]>([]);
  protected readonly currency = signal<string | null>(null);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly rangeInvalid = signal(false);

  private readonly registerMap = computed(
    () => new Map(this.registers().map((register) => [register.id, register] as const)),
  );
  private readonly methodNames = computed(
    () => new Map(this.methods().map((method) => [method.code, method.name] as const)),
  );

  constructor() {
    merge(
      this.filterForm.controls.status.valueChanges,
      this.filterForm.controls.cashRegisterId.valueChanges,
      this.filterForm.controls.from.valueChanges,
      this.filterForm.controls.to.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
  }

  ngOnInit(): void {
    this.sessions.load();
    listAllPages((request) => this.registersApi.list(request, { branchId: null, active: null }), 'code').subscribe({
      next: (registers) => this.registers.set(registers),
      error: (error: unknown) => this.lookupError.set(error),
    });
    listAllPages((request) => this.methodsApi.list(request, null), 'code').subscribe({
      next: (methods) => this.methods.set(methods),
      error: (error: unknown) => this.lookupError.set(error),
    });
    listAllPages((request) => this.usersApi.list(request), 'username').subscribe({
      // Sin permiso para ver usuarios, el listado muestra el número del cajero.
      next: (users) => this.users.set(new Map(users.map((user) => [user.id, user] as const))),
      error: () => undefined,
    });
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
  }

  protected registerLabel(registerId: number): string {
    const register = this.registerMap().get(registerId);
    return register ? `${register.code} · ${register.name}` : String(registerId);
  }

  protected cashierLabel(userId: number): string {
    return this.users().get(userId)?.username ?? `#${userId}`;
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected differenceBadge(value: number | null): string | null {
    return differenceBadgeClass(value);
  }

  protected open(session: CashSessionView): void {
    const ref = this.modal.open(CashSessionDetailComponent, { size: 'lg' });
    ref.componentInstance.sessionId = session.id;
    ref.componentInstance.registerLabel = this.registerLabel(session.cashRegisterId);
    ref.componentInstance.cashierLabel = this.cashierLabel(session.userId);
    ref.componentInstance.currency = this.currency();
    ref.componentInstance.methodNames = this.methodNames();
  }

  /** Aplica los filtros: si el rango de fechas es inválido, no consulta y avisa. */
  private applyFilters(): void {
    const { from, to } = this.filterForm.getRawValue();
    this.rangeInvalid.set(from !== '' && to !== '' && from > to);
    if (!this.rangeInvalid()) {
      this.sessions.restart();
    }
  }

  private filters(): CashSessionFilters {
    const value = this.filterForm.getRawValue();
    return {
      status: value.status,
      cashRegisterId: value.cashRegisterId,
      from: value.from === '' ? null : startOfDay(value.from),
      to: value.to === '' ? null : endOfDay(value.to),
    };
  }
}
