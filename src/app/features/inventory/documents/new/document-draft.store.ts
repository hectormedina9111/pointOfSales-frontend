import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, Validators } from '@angular/forms';
import { catchError, map, merge, of, startWith, throwError } from 'rxjs';

import { BranchView, BranchesApi } from '../../../../core/api/branches-api';
import {
  InventoryApi,
  InventoryDocumentRequest,
  InventoryDocumentType,
} from '../../../../core/api/inventory-api';
import { ProductView } from '../../../../core/api/products-api';
import { listAllPages } from '../../../../core/api/page';
import { SystemInfoService } from '../../../../core/system/system-info.service';
import { AMOUNT_PATTERN, numberToThousandths, thousandthsToQuantity } from '../../../../shared/forms/amounts';
import { blankToNull } from '../../../../shared/forms/form-values';
import { randomUuid } from '../../../../shared/ids/random-uuid';
import { branchLabel } from '../../../../shared/stores/branch-label';
import { isEquipmentSerial } from '../../../../shared/serials/serial-mode';

/** Largo máximo del motivo, igual que en el backend. */
export const REASON_MAX = 200;

/** Una unidad en milésimas: la cantidad inicial de una línea de entrada o salida. */
const ONE_UNIT = 1000;

/**
 * Línea del documento en preparación. value es la cantidad en milésimas (entrada y salida) o la
 * cantidad contada (ajuste); null mientras la persona no la ha escrito. unitCost es el texto escrito
 * (solo entrada). currentQuantity es el saldo actual de la sucursal, en milésimas (solo ajuste).
 */
export interface DocumentLine {
  readonly key: number;
  readonly productId: number;
  readonly sku: string;
  readonly name: string;
  readonly value: number | null;
  readonly unitCost: string;
  readonly currentQuantity: number | null;
  /** Producto que controla seriales: su cantidad es el número de seriales (value) y no se escribe a mano. */
  readonly tracksSerials: boolean;
  readonly serials: readonly string[];
}

/** Línea nueva: producto, cantidad (o contada) en milésimas o null si está vacía, y costo escrito. */
export interface NewLine {
  readonly product: ProductView;
  readonly value: number | null;
  readonly unitCost: string;
}

/**
 * Estado del asistente de nuevo documento: tipo y motivo, líneas y la clave de idempotencia. Vive en
 * la pantalla (no es global), así cada documento nuevo empieza limpio y los pasos comparten lo que
 * se escribe. El saldo actual de cada línea de ajuste se pide al servidor al agregarla y cuando
 * cambia el tipo o la sucursal.
 */
@Injectable()
export class DocumentDraftStore {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(InventoryApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central elige sucursal; una tienda documenta en la suya. */
  readonly isCentral = this.systemInfo.isCentral;

  /** Clave de idempotencia: se crea una vez por documento y se reusa en los reintentos. */
  readonly idempotencyKey = randomUuid();

  readonly form = this.fb.group({
    type: this.fb.control<InventoryDocumentType>('ENTRY', [Validators.required]),
    branchId: this.fb.control<number | null>(null),
    reason: this.fb.control('', [Validators.maxLength(REASON_MAX)]),
    notes: this.fb.control(''),
  });

  /** Cuenta las líneas válidas; el paso de líneas exige al menos una. Su estado lo lee el asistente. */
  readonly linesControl = new FormControl(0, { nonNullable: true, validators: [Validators.min(1)] });

  readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: 'ENTRY' as InventoryDocumentType });
  readonly branchId = toSignal(this.form.controls.branchId.valueChanges, { initialValue: null as number | null });

  readonly branches = signal<readonly BranchView[]>([]);
  readonly lines = signal<readonly DocumentLine[]>([]);
  readonly lookupError = signal<unknown>(null);

  /** Sucursal que se documenta: la elegida en la central, o la única de la tienda. */
  readonly effectiveBranchId = computed(() =>
    this.isCentral() ? this.branchId() : (this.branches()[0]?.id ?? null),
  );

  readonly branchName = computed(() => {
    const id = this.effectiveBranchId();
    if (id === null) {
      return null;
    }
    const map = new Map(this.branches().map((branch) => [branch.id, branch] as const));
    return branchLabel(map, id);
  });

  private nextKey = 1;

  constructor() {
    // Las reglas dependen del tipo y del nodo: la sucursal es obligatoria solo en la central, y el
    // motivo, en salidas y ajustes.
    merge(this.form.controls.type.valueChanges, toObservable(this.isCentral))
      .pipe(startWith(null), takeUntilDestroyed())
      .subscribe(() => this.applyRules());

    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.syncLinesControl();
      this.refreshCurrent();
    });
    this.form.controls.branchId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.refreshCurrent());

    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (branches) => this.branches.set(branches),
      error: (error: unknown) => this.lookupError.set(error),
    });
  }

  /** Verdadero en un ajuste: las líneas llevan cantidad contada, no movimiento. */
  readonly isAdjustment = computed(() => this.type() === 'ADJUSTMENT');

  hasProduct(productId: number): boolean {
    return this.lines().some((line) => line.productId === productId);
  }

  /** Agrega un producto con una unidad; en un ajuste la cantidad contada queda vacía para escribirla. */
  addProduct(product: ProductView): boolean {
    if (this.hasProduct(product.id)) {
      return false;
    }
    this.addLines([{ product, value: this.isAdjustment() ? null : ONE_UNIT, unitCost: '' }]);
    return true;
  }

  /** Agrega varias líneas de una vez y pide su saldo actual si es un ajuste. */
  addLines(rows: readonly NewLine[]): void {
    const added: DocumentLine[] = rows.map((row) => ({
      key: this.nextKey++,
      productId: row.product.id,
      sku: row.product.sku,
      name: row.product.name,
      // Un producto con seriales empieza sin seriales: su cantidad llega con cada uno.
      value: isEquipmentSerial(row.product.serialMode) ? 0 : row.value,
      unitCost: row.unitCost,
      currentQuantity: null,
      tracksSerials: isEquipmentSerial(row.product.serialMode),
      serials: [],
    }));
    this.lines.update((current) => [...current, ...added]);
    this.syncLinesControl();
    for (const line of added) {
      this.loadCurrent(line.key, line.productId);
    }
  }

  /** Cantidad o cantidad contada de una línea, en milésimas (null si se borró el texto). */
  setValue(key: number, value: number | null): void {
    this.updateLine(key, { value });
  }

  /** Agrega un serial a una línea de producto con seriales. La cantidad pasa a ser el número de seriales. */
  addSerial(key: number, serial: string): void {
    this.updateSerials(key, (serials) => [...serials, serial]);
  }

  removeSerial(key: number, serial: string): void {
    this.updateSerials(key, (serials) => serials.filter((item) => item !== serial));
  }

  /** Costo unitario escrito. Devuelve false si el texto no es un monto válido. */
  setUnitCost(key: number, text: string): boolean {
    const value = text.trim();
    if (value !== '' && !AMOUNT_PATTERN.test(value)) {
      return false;
    }
    this.updateLine(key, { unitCost: value });
    return true;
  }

  removeLine(key: number): void {
    this.lines.update((current) => current.filter((line) => line.key !== key));
    this.syncLinesControl();
  }

  /** Una línea tiene cantidad: mayor que cero en entrada y salida; cero o más en un ajuste. */
  isLineValid(line: DocumentLine): boolean {
    if (line.value === null) {
      return false;
    }
    return this.isAdjustment() ? line.value >= 0 : line.value > 0;
  }

  /** Cuerpo de POST /inventory/documents. En una tienda no se envía sucursal: el servidor usa la suya. */
  buildRequest(): InventoryDocumentRequest {
    const raw = this.form.getRawValue();
    const adjustment = raw.type === 'ADJUSTMENT';
    return {
      type: raw.type,
      branchId: this.isCentral() ? raw.branchId : null,
      reason: blankToNull(raw.reason),
      notes: blankToNull(raw.notes),
      lines: this.lines().map((line) => {
        const quantity = thousandthsToQuantity(line.value ?? 0);
        return {
          productId: line.productId,
          quantity: adjustment ? null : quantity,
          countedQuantity: adjustment ? quantity : null,
          unitCost: raw.type === 'ENTRY' ? blankToNull(line.unitCost) : null,
          // Un serial por unidad: solo los productos de serie de lista (equipos) lo envían.
          ...(line.tracksSerials ? { serialNumbers: [...line.serials] } : {}),
        };
      }),
      idempotencyKey: this.idempotencyKey,
    };
  }

  private applyRules(): void {
    const raw = this.form.getRawValue();
    const branch = this.form.controls.branchId;
    branch.setValidators(this.isCentral() ? [Validators.required] : []);
    branch.updateValueAndValidity();

    const reason = this.form.controls.reason;
    reason.setValidators(
      raw.type === 'ENTRY'
        ? [Validators.maxLength(REASON_MAX)]
        : [Validators.required, Validators.maxLength(REASON_MAX)],
    );
    reason.updateValueAndValidity();
  }

  private updateLine(key: number, patch: Partial<Pick<DocumentLine, 'value' | 'unitCost'>>): void {
    this.lines.update((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    this.syncLinesControl();
  }

  /** Cambia los seriales de una línea y deja su cantidad igual a su número. */
  private updateSerials(key: number, change: (serials: readonly string[]) => readonly string[]): void {
    this.lines.update((current) =>
      current.map((line) => {
        if (line.key !== key) {
          return line;
        }
        const serials = change(line.serials);
        return { ...line, serials, value: serials.length * ONE_UNIT };
      }),
    );
    this.syncLinesControl();
  }

  /** El control del paso de líneas vale el número de líneas si todas son válidas; si no, 0. */
  private syncLinesControl(): void {
    const current = this.lines();
    const allValid = current.length > 0 && current.every((line) => this.isLineValid(line));
    this.linesControl.setValue(allValid ? current.length : 0);
  }

  /** En un ajuste, pide el saldo actual de todas las líneas en la sucursal que se documenta. */
  private refreshCurrent(): void {
    if (!this.isAdjustment()) {
      return;
    }
    for (const line of this.lines()) {
      this.loadCurrent(line.key, line.productId);
    }
  }

  /** Saldo actual de un producto en la sucursal. Sin existencia (404) el saldo es cero. */
  private loadCurrent(key: number, productId: number): void {
    const branchId = this.effectiveBranchId();
    if (!this.isAdjustment() || branchId === null) {
      return;
    }
    this.api
      .item(productId, branchId)
      .pipe(
        map((item) => item.quantity),
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 404 ? of(0) : throwError(() => error),
        ),
      )
      .subscribe({
        next: (quantity) => {
          // Solo se aplica si la línea sigue ahí y la sucursal no cambió mientras se consultaba.
          if (this.effectiveBranchId() !== branchId) {
            return;
          }
          this.lines.update((current) =>
            current.map((line) =>
              line.key === key ? { ...line, currentQuantity: numberToThousandths(quantity) } : line,
            ),
          );
        },
        error: (error: unknown) => this.lookupError.set(error),
      });
  }
}
