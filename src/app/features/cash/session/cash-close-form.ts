import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import {
  CashSessionDetailView,
  CashSessionsApi,
  CloseCashSessionRequest,
  SessionSummaryView,
} from '../../../core/api/cash-sessions-api';
import { listAllPages } from '../../../core/api/page';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import {
  AMOUNT_PATTERN,
  amountToCents,
  formatMoney,
  numberToCents,
} from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { differenceBadgeClass } from '../cash-format';

/** Una fila de la tabla de diferencias: lo esperado, lo contado (null si el texto no es un monto) y la diferencia, en centavos. */
interface DifferenceRow {
  readonly code: string;
  readonly name: string;
  readonly expectedCents: number;
  readonly countedCents: number | null;
  readonly differenceCents: number | null;
}

/**
 * Cierre de caja en tres pasos: conteo por método de pago, diferencias (vista previa calculada
 * aquí; el backend recalcula al cerrar) y confirmación. Cierra el diálogo con la sesión cerrada.
 */
@Component({
  selector: 'app-cash-close-form',
  imports: [
    ReactiveFormsModule,
    ProblemAlertComponent,
    FieldErrorComponent,
    FieldLabelComponent,
    StepperComponent,
    StepComponent,
    TranslatePipe,
  ],
  templateUrl: './cash-close-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashCloseFormComponent implements OnInit {
  private readonly api = inject(CashSessionsApi);
  private readonly methodsApi = inject(PaymentMethodsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = inject(LanguageService);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Sesión que se cierra, con su resumen por método. Lo asigna quien abre el diálogo. */
  sessionId = 0;
  summary: SessionSummaryView | null = null;
  /** Moneda de la empresa, o null si no está configurada. */
  currency: string | null = null;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;
  /** Cambia con cada tecla en un conteo; hace que la tabla de diferencias se recalcule. */
  private readonly revision = signal(0);

  /** Métodos activos, en el orden del listado. Se llenan al cargar. */
  protected methods: readonly PaymentMethodView[] = [];
  /** Un control de monto por método activo. El paso de conteo los recibe al terminar de cargar. */
  protected countList: readonly AbstractControl[] = [];
  protected readonly countControls: Record<string, FormControl<string>> = {};

  protected readonly form = this.fb.group({
    notes: this.fb.control('', [Validators.maxLength(500)]),
  });
  /** Controles del paso de diferencias (las notas son opcionales, pero tienen límite). */
  protected readonly notesControls: readonly AbstractControl[] = [this.form.controls.notes];

  /** Filas de la tabla de diferencias. Se recalculan con cada cambio de un conteo. */
  protected readonly rows = computed<readonly DifferenceRow[]>(() => {
    this.revision();
    return this.buildRows();
  });

  protected readonly totals = computed(() => {
    const rows = this.rows();
    const expected = rows.reduce((sum, row) => sum + row.expectedCents, 0);
    const complete = rows.every((row) => row.countedCents !== null);
    const counted = complete ? rows.reduce((sum, row) => sum + (row.countedCents ?? 0), 0) : null;
    return {
      expectedCents: expected,
      countedCents: counted,
      differenceCents: counted === null ? null : counted - expected,
    };
  });

  ngOnInit(): void {
    listAllPages((request) => this.methodsApi.list(request, true), 'code').subscribe({
      next: (methods) => {
        this.methods = methods;
        for (const method of methods) {
          const control = this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]);
          this.countControls[method.code] = control;
          control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.revision.update((n) => n + 1));
        }
        this.countList = Object.values(this.countControls);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected money(cents: number | null): string {
    return cents === null ? '—' : formatMoney(cents / 100, this.currency, this.language.current());
  }

  protected badge(cents: number | null): string | null {
    return differenceBadgeClass(cents === null ? null : cents / 100);
  }

  protected submit(): void {
    if (this.form.invalid || this.countList.some((control) => control.invalid)) {
      this.form.markAllAsTouched();
      return;
    }
    const body: CloseCashSessionRequest = {
      counts: this.methods.map((method) => ({
        paymentMethodCode: method.code,
        amount: this.countControls[method.code].value.trim(),
      })),
      notes: blankToNull(this.form.getRawValue().notes.trim()),
    };

    this.submitting.set(true);
    this.error.set(null);
    this.api.close(this.sessionId, body).subscribe({
      next: (session: CashSessionDetailView) => this.activeModal.close(session),
      error: (error: unknown) => {
        this.error.set(error);
        this.submitting.set(false);
      },
    });
  }

  private buildRows(): readonly DifferenceRow[] {
    return this.methods.map((method) => {
      const expectedCents = numberToCents(this.summary?.expectedByMethod[method.code] ?? 0);
      const countedCents = amountToCents(this.countControls[method.code].value);
      return {
        code: method.code,
        name: method.name,
        expectedCents,
        countedCents,
        differenceCents: countedCents === null ? null : countedCents - expectedCents,
      };
    });
  }
}
