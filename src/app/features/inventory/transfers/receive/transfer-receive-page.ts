import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  InventoryApi,
  TransferReceiptRequest,
  TransferView,
} from '../../../../core/api/inventory-api';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { FieldLabelComponent } from '../../../../shared/components/field-label/field-label';
import { numberToThousandths, thousandthsToQuantity } from '../../../../shared/forms/amounts';
import { randomUuid } from '../../../../shared/ids/random-uuid';
import { blankToNull } from '../../../../shared/forms/form-values';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { countToThousandths, formatDifference, formatQuantity } from '../../shared/inventory-math';

/** Una unidad en milésimas: lo recibido de una línea sin seriales se escribe en unidades y cantidades. */
const ONE_UNIT = 1000;

/**
 * Línea que se recibe. text es lo escrito en líneas sin seriales; chosen son los seriales marcados
 * en líneas con seriales (todos marcados al empezar). sentThousandths es lo enviado, en milésimas.
 */
interface ReceiveLine {
  readonly lineId: number;
  readonly sku: string;
  readonly name: string;
  readonly sentThousandths: number;
  readonly tracksSerials: boolean;
  readonly sentSerials: readonly string[];
  readonly text: string;
  readonly chosen: readonly string[];
}

/** Línea lista para mostrar: lo recibido, el error si lo hay y la diferencia con lo enviado. */
export interface ReceiveRow {
  readonly lineId: number;
  readonly sku: string;
  readonly name: string;
  readonly sent: string;
  readonly tracksSerials: boolean;
  readonly sentSerials: readonly string[];
  readonly chosen: readonly string[];
  readonly text: string;
  /** Clave de traducción del error de la línea, o null si es válida. */
  readonly errorKey: string | null;
  readonly differs: boolean;
  readonly difference: string;
  readonly missingSerials: readonly string[];
  readonly receivedText: string;
}

/**
 * Recepción de una transferencia en la tienda destino. Por cada línea se indica lo que llegó: en
 * productos sin seriales, una cantidad que no pasa de lo enviado; en productos con seriales, las
 * seriales que llegaron (todas marcadas al empezar) y la cantidad es su número. Lo que falta queda
 * como diferencia. Confirmar envía la recepción con una clave de idempotencia y vuelve al detalle.
 */
@Component({
  selector: 'app-transfer-receive-page',
  imports: [ReactiveFormsModule, RouterLink, ProblemAlertComponent, FieldLabelComponent, TranslatePipe],
  templateUrl: './transfer-receive-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferReceivePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);

  /** Clave de idempotencia: se crea una vez por recepción y se reusa en los reintentos. */
  private readonly idempotencyKey = randomUuid();

  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<unknown>(null);
  protected readonly transfer = signal<TransferView | null>(null);
  private readonly lines = signal<readonly ReceiveLine[]>([]);
  private transferId = 0;

  /** Solo una transferencia en tránsito se puede recibir. */
  protected readonly receivable = computed(() => this.transfer()?.status === 'IN_TRANSIT');
  protected readonly rows = computed<readonly ReceiveRow[]>(() => this.lines().map((line) => toRow(line)));
  /** Las líneas con diferencia, para el resumen. */
  protected readonly differences = computed(() => this.rows().filter((row) => row.differs));
  /** Se puede confirmar si hay líneas y ninguna tiene error. */
  protected readonly canConfirm = computed(
    () => this.receivable() && this.rows().length > 0 && this.rows().every((row) => row.errorKey === null),
  );

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.transferId = id;
    this.api.transfer(id).subscribe({
      next: (transfer) => {
        this.transfer.set(transfer);
        this.lines.set(transfer.lines.map((line) => toLine(line)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  /** Cantidad escrita en una línea sin seriales. El error se muestra en la fila. */
  protected onQuantityInput(lineId: number, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    this.updateLine(lineId, (line) => ({ ...line, text: input.value }));
  }

  /** Marca o desmarca una serial que llegó, según el checkbox. */
  protected onSerialChange(lineId: number, serial: string, event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.toggleSerial(lineId, serial, input.checked);
    }
  }

  /** La cantidad de una línea con seriales es el número de seriales marcados. */
  private toggleSerial(lineId: number, serial: string, checked: boolean): void {
    this.updateLine(lineId, (line) => ({
      ...line,
      chosen: checked
        ? [...line.chosen.filter((item) => item !== serial), serial]
        : line.chosen.filter((item) => item !== serial),
    }));
  }

  protected confirm(): void {
    if (this.saving() || !this.canConfirm()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.receiveTransfer(this.transferId, this.buildRequest()).subscribe({
      next: (transfer) => void this.router.navigate(['/inventory/transfers', transfer.id]),
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(error);
      },
    });
  }

  /** Cuerpo de la recepción: cada línea con lo recibido y, si tiene seriales, las que llegaron. */
  private buildRequest(): TransferReceiptRequest {
    return {
      notes: blankToNull(this.notes.value),
      lines: this.rows().map((row) => ({
        lineId: row.lineId,
        receivedQuantity: thousandthsToQuantity(receivedThousandths(row)),
        ...(row.tracksSerials ? { serialNumbers: [...row.chosen] } : {}),
      })),
      idempotencyKey: this.idempotencyKey,
    };
  }

  private updateLine(lineId: number, change: (line: ReceiveLine) => ReceiveLine): void {
    this.lines.update((current) => current.map((line) => (line.lineId === lineId ? change(line) : line)));
  }
}

/** Línea de la transferencia recibida: sin seriales empieza con lo enviado; con seriales, todas marcadas. */
function toLine(line: TransferView['lines'][number]): ReceiveLine {
  const sentThousandths = numberToThousandths(line.quantity);
  const tracksSerials = line.serialNumbers.length > 0;
  return {
    lineId: line.id,
    sku: line.productSku,
    name: line.productName,
    sentThousandths,
    tracksSerials,
    sentSerials: line.serialNumbers,
    text: thousandthsToQuantity(sentThousandths),
    chosen: [...line.serialNumbers],
  };
}

/** Lo recibido de una línea en milésimas, o null si la cantidad escrita no es válida. */
function receivedThousandths(row: Pick<ReceiveRow, 'tracksSerials' | 'chosen' | 'text'>): number {
  if (row.tracksSerials) {
    return row.chosen.length * ONE_UNIT;
  }
  return countToThousandths(row.text) ?? 0;
}

/** Arma la fila: error, diferencia y seriales que faltan. */
function toRow(line: ReceiveLine): ReceiveRow {
  const parsed = line.tracksSerials ? line.chosen.length * ONE_UNIT : countToThousandths(line.text);
  let errorKey: string | null = null;
  if (parsed === null) {
    errorKey = 'inventory.transfers.receive.invalidQuantity';
  } else if (parsed > line.sentThousandths) {
    errorKey = 'inventory.transfers.receive.exceedsSent';
  }
  const received = parsed ?? 0;
  const differs = parsed !== null && parsed !== line.sentThousandths;
  return {
    lineId: line.lineId,
    sku: line.sku,
    name: line.name,
    sent: formatQuantity(line.sentThousandths / ONE_UNIT),
    tracksSerials: line.tracksSerials,
    sentSerials: line.sentSerials,
    chosen: line.chosen,
    text: line.text,
    errorKey,
    differs,
    difference: parsed === null ? '—' : formatDifference(received - line.sentThousandths),
    missingSerials: line.tracksSerials ? line.sentSerials.filter((serial) => !line.chosen.includes(serial)) : [],
    receivedText: formatQuantity(received / ONE_UNIT),
  };
}
