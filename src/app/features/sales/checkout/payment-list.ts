import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { amountToCents, centsToNumber, formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { AddedPayment } from './payment-math';

/**
 * Pagos agregados y el resumen de cobro: total, pagado, pendiente y vuelto. Los pagos no se editan:
 * solo se quitan, con su botón de la fila. Los montos llegan en centavos, calculados por la pantalla.
 */
@Component({
  selector: 'app-payment-list',
  imports: [TranslatePipe],
  templateUrl: './payment-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentListComponent {
  private readonly language = inject(LanguageService);

  readonly payments = input.required<readonly AddedPayment[]>();
  readonly totalCents = input.required<number>();
  readonly paidCents = input.required<number>();
  readonly pendingCents = input.required<number>();
  readonly changeCents = input.required<number>();
  /** Moneda de la empresa; null si no está configurada. */
  readonly currency = input<string | null>(null);

  /** Se emite con la clave del pago que se quita. */
  readonly removed = output<number>();

  protected money(cents: number): string {
    return formatMoney(centsToNumber(cents), this.currency(), this.language.current());
  }

  protected paymentCents(payment: AddedPayment): number {
    return amountToCents(payment.request.amount) ?? 0;
  }
}
