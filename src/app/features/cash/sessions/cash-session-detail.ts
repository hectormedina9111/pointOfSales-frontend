import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { CashSessionDetailView, CashSessionsApi } from '../../../core/api/cash-sessions-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { differenceBadgeClass } from '../cash-format';

/**
 * Detalle de una sesión de caja: datos, conteo al cierre y movimientos. Solo lectura. Quien la
 * abre pasa la etiqueta de la caja y del cajero, la moneda y los nombres de los métodos de pago.
 */
@Component({
  selector: 'app-cash-session-detail',
  imports: [ProblemAlertComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './cash-session-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashSessionDetailComponent implements OnInit {
  private readonly api = inject(CashSessionsApi);
  private readonly language = inject(LanguageService);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Sesión a mostrar y datos de contexto. Los asigna quien abre el diálogo. */
  sessionId = 0;
  registerLabel = '';
  cashierLabel = '';
  currency: string | null = null;
  methodNames: ReadonlyMap<string, string> = new Map();

  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly session = signal<CashSessionDetailView | null>(null);

  ngOnInit(): void {
    this.api.get(this.sessionId).subscribe({
      next: (session) => {
        this.session.set(session);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency, this.language.current());
  }

  protected differenceBadge(value: number | null): string | null {
    return differenceBadgeClass(value);
  }

  protected methodName(code: string): string {
    return this.methodNames.get(code) ?? code;
  }
}
