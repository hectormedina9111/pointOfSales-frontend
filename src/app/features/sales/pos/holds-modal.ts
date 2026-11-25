import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { SaleSummaryView, SalesApi } from '../../../core/api/sales-api';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { PagedList } from '../../../shared/paging/paged-list';
import { formatMoney } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageService } from '../../../core/i18n/language.service';

/** Filas por página de las ventas en espera. */
const HOLDS_PAGE_SIZE = 10;

/**
 * Ventas en espera de la caja. Elegir "Reanudar" cierra el diálogo con el id de la venta; quien lo
 * abre carga sus líneas. "Eliminar" pide confirmación y borra la venta en espera.
 */
@Component({
  selector: 'app-holds-modal',
  imports: [ProblemAlertComponent, PaginationComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './holds-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoldsModalComponent implements OnInit {
  private readonly api = inject(SalesApi);
  private readonly modal = inject(NgbModal);
  private readonly language = inject(LanguageService);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Moneda de la empresa para mostrar los totales; null si no está configurada. Lo asigna quien abre el diálogo. */
  currency: string | null = null;

  protected readonly holds = new PagedList<SaleSummaryView>(
    (request) => this.api.listHolds(request),
    'createdAt,desc',
    HOLDS_PAGE_SIZE,
  );
  protected readonly busyId = signal<number | null>(null);
  protected readonly actionError = signal<unknown>(null);

  ngOnInit(): void {
    this.holds.load();
  }

  protected money(value: number): string {
    return formatMoney(value, this.currency, this.language.current());
  }

  protected resume(hold: SaleSummaryView): void {
    this.activeModal.close(hold.id);
  }

  protected async remove(hold: SaleSummaryView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'sales.pos.holds.deleteTitle',
      messageKey: 'sales.pos.holds.deleteMessage',
      confirmKey: 'sales.pos.holds.deleteConfirm',
    });
    if (!confirmed) {
      return;
    }
    this.busyId.set(hold.id);
    this.actionError.set(null);
    this.api.deleteHold(hold.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.holds.load();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.actionError.set(error);
      },
    });
  }
}
