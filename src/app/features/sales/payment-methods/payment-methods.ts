import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { PaymentMethodView, PaymentMethodsApi } from '../../../core/api/payment-methods-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PaymentMethodFormComponent } from './payment-method-form';

/**
 * Métodos de pago de la venta. No hay alta ni baja: los códigos los fija el sistema y la central
 * solo cambia nombre y banderas. En una tienda el listado es de solo lectura.
 */
@Component({
  selector: 'app-payment-methods',
  imports: [TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './payment-methods.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodsComponent implements OnInit {
  private readonly api = inject(PaymentMethodsApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly methods = new PagedList<PaymentMethodView>((request) => this.api.list(request), 'code');
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.methods.load();
  }

  protected edit(method: PaymentMethodView): void {
    const ref = this.modal.open(PaymentMethodFormComponent, { size: 'md' });
    ref.componentInstance.method = method;
    ref.result.then(
      () => {
        this.notice.set('sales.paymentMethods.saved');
        this.methods.load();
      },
      () => undefined,
    );
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }
}
