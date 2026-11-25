import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { InventoryApi, TransferLineView, TransferView } from '../../../core/api/inventory-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { numberToThousandths } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { formatDifference, formatQuantity } from '../shared/inventory-math';
import { NodeBranchService } from '../shared/node-branch.service';
import { transferStatusClass } from './transfer-labels';

/** Destino del botón "Volver": el listado con los filtros con que llegó el usuario, o el listado. */
const LIST_URL = /^\/inventory\/transfers(\?|$)/;

/** Una línea lista para mostrar: cantidades, diferencia y seriales que faltan. */
export interface TransferLineRow {
  readonly id: number;
  readonly sku: string;
  readonly name: string;
  readonly sent: string;
  readonly received: string;
  readonly difference: string;
  /** Verdadero si lo recibido es menor que lo enviado; solo cuando la línea ya se recibió. */
  readonly differs: boolean;
  readonly serials: readonly string[];
  readonly receivedSerials: readonly string[];
  readonly missingSerials: readonly string[];
}

/**
 * Detalle de una transferencia. Muestra cada línea con lo enviado y lo recibido, sus seriales y las
 * diferencias resaltadas. El botón de recibir aparece en tránsito, con el privilegio de recepción, y
 * (en una tienda) solo si la transferencia llega a su sucursal.
 */
@Component({
  selector: 'app-transfer-detail-page',
  imports: [RouterLink, ProblemAlertComponent, IfPrivilegeDirective, LocalDateTimePipe, TranslatePipe],
  templateUrl: './transfer-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly nodeBranch = inject(NodeBranchService);
  private readonly systemInfo = inject(SystemInfoService);

  protected readonly backUrl = this.listUrlFromState();
  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly transfer = signal<TransferView | null>(null);
  protected readonly statusClass = computed(() => {
    const current = this.transfer();
    return current === null ? '' : transferStatusClass(current.status);
  });
  protected readonly rows = computed<readonly TransferLineRow[]>(() =>
    (this.transfer()?.lines ?? []).map((line) => toRow(line)),
  );

  /**
   * Puede recibir si está en tránsito y la llegada es a este nodo. La central no sabe qué sucursal
   * atiende: en ese caso el botón aparece y el servidor responde si la transferencia no le llega.
   */
  protected readonly canReceive = computed(() => {
    const current = this.transfer();
    if (current === null || current.status !== 'IN_TRANSIT') {
      return false;
    }
    if (this.systemInfo.isCentral()) {
      return true;
    }
    const ownBranchId = this.nodeBranch.ownBranchId();
    return ownBranchId !== null && current.destinationBranchId === ownBranchId;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.api.transfer(id).subscribe({
      next: (transfer) => {
        this.transfer.set(transfer);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/inventory/transfers';
  }
}

/** Arma la fila de una línea. La diferencia y los faltantes solo existen si ya llegó algo. */
function toRow(line: TransferLineView): TransferLineRow {
  const sentThousandths = numberToThousandths(line.quantity);
  const received = line.receivedQuantity;
  const receivedSerials = line.receivedSerialNumbers;
  return {
    id: line.id,
    sku: line.productSku,
    name: line.productName,
    sent: formatQuantity(line.quantity),
    received: received === null ? '—' : formatQuantity(received),
    difference:
      received === null ? '—' : formatDifference(numberToThousandths(received) - sentThousandths),
    differs: received !== null && numberToThousandths(received) !== sentThousandths,
    serials: line.serialNumbers,
    receivedSerials,
    missingSerials:
      received === null ? [] : line.serialNumbers.filter((serial) => !receivedSerials.includes(serial)),
  };
}
