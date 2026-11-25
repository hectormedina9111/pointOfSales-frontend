import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { FINAL_CONSUMER_ID, SaleView, SalesApi } from '../../../core/api/sales-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Detalle de una venta: datos, líneas, totales con exento, gravado e ISV, pagos y la autorización
 * del descuento. Solo lectura. Quien la abre pasa las etiquetas, la moneda y los nombres de usuario.
 * El botón de reimpresión abre el ticket, que la central también puede servir.
 */
@Component({
  selector: 'app-sale-detail',
  imports: [RouterLink, ProblemAlertComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './sale-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleDetailComponent implements OnInit {
  private readonly api = inject(SalesApi);
  private readonly language = inject(LanguageService);
  protected readonly activeModal = inject(NgbActiveModal);
  protected readonly finalConsumerId = FINAL_CONSUMER_ID;

  /** Venta a mostrar y datos de contexto. Los asigna quien abre el diálogo. */
  saleId = 0;
  registerLabel = '';
  /** Sucursal de la venta; null en una tienda, donde todas las ventas son de la misma sucursal. */
  branchLabel: string | null = null;
  cashierLabel = '';
  currency: string | null = null;
  userNames: ReadonlyMap<number, string> = new Map();

  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly sale = signal<SaleView | null>(null);

  ngOnInit(): void {
    this.api.get(this.saleId).subscribe({
      next: (sale) => {
        this.sale.set(sale);
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

  protected userLabel(userId: number): string {
    return this.userNames.get(userId) ?? `#${userId}`;
  }
}
