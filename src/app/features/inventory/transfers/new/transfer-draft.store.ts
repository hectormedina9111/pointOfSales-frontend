import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, Validators } from '@angular/forms';
import { catchError, map, of, throwError } from 'rxjs';

import { InventoryApi, TransferBranchView, TransferRequest } from '../../../../core/api/inventory-api';
import { ProductView } from '../../../../core/api/products-api';
import { SystemInfoService } from '../../../../core/system/system-info.service';
import { thousandthsToQuantity } from '../../../../shared/forms/amounts';
import { blankToNull } from '../../../../shared/forms/form-values';
import { randomUuid } from '../../../../shared/ids/random-uuid';
import { isEquipmentSerial } from '../../../../shared/serials/serial-mode';

/** Una unidad en milésimas: la cantidad inicial de una línea sin seriales. */
const ONE_UNIT = 1000;

/**
 * Línea de la transferencia en preparación. value es la cantidad en milésimas (en un producto con
 * seriales, el número de seriales por mil). originStock es la existencia en la sucursal de origen,
 * en unidades; null mientras se consulta.
 */
export interface TransferLine {
  readonly key: number;
  readonly productId: number;
  readonly sku: string;
  readonly name: string;
  readonly value: number | null;
  readonly originStock: number | null;
  /** Producto que controla seriales: su cantidad es el número de seriales y no se escribe a mano. */
  readonly tracksSerials: boolean;
  readonly serials: readonly string[];
}

/**
 * Estado del asistente de nueva transferencia: destino, origen (solo central), notas y líneas. Vive
 * en la pantalla, así cada transferencia empieza limpia. Una tienda envía desde su sucursal; la
 * central elige la de origen. Cambiar el origen quita los seriales ya elegidos, porque pertenecen a
 * esa sucursal, y vuelve a consultar la existencia de cada línea.
 */
@Injectable()
export class TransferDraftStore {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(InventoryApi);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central elige sucursal de origen; una tienda envía desde la suya. */
  readonly isCentral = this.systemInfo.isCentral;

  /** Clave de idempotencia: se crea una vez por transferencia y se reusa en los reintentos. */
  readonly idempotencyKey = randomUuid();

  readonly form = this.fb.group({
    destinationBranchId: this.fb.control<number | null>(null, [Validators.required]),
    originBranchId: this.fb.control<number | null>(null),
    notes: this.fb.control(''),
  });

  /** Cuenta las líneas válidas; el paso de líneas exige al menos una. Su estado lo lee el asistente. */
  readonly linesControl = new FormControl(0, { nonNullable: true, validators: [Validators.min(1)] });

  readonly originBranchId = toSignal(this.form.controls.originBranchId.valueChanges, {
    initialValue: null as number | null,
  });
  readonly destinationBranchId = toSignal(this.form.controls.destinationBranchId.valueChanges, {
    initialValue: null as number | null,
  });

  readonly branches = signal<readonly TransferBranchView[]>([]);

  /** Orígenes posibles: las sucursales que opera este nodo. */
  readonly originOptions = computed(() => this.branches().filter((branch) => branch.operatedHere));
  readonly lines = signal<readonly TransferLine[]>([]);
  readonly lookupError = signal<unknown>(null);

  /** Sucursal de origen: la elegida en la central, o la única de la tienda. */
  readonly effectiveOriginId = computed(() =>
    this.isCentral() ? this.originBranchId() : (this.originOptions()[0]?.id ?? null),
  );

  /** Destinos posibles: sucursales activas distintas del origen. */
  readonly destinationOptions = computed(() => {
    const origin = this.effectiveOriginId();
    return this.branches().filter((branch) => branch.id !== origin);
  });

  readonly originName = computed(() => this.branchName(this.effectiveOriginId()));
  readonly destinationName = computed(() => this.branchName(this.destinationBranchId()));

  private nextKey = 1;

  constructor() {
    if (this.isCentral()) {
      this.form.controls.originBranchId.setValidators([Validators.required]);
      this.form.controls.originBranchId.updateValueAndValidity({ emitEvent: false });
    }

    this.form.controls.originBranchId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.onOriginChanged());

    this.api.transferBranches().subscribe({
      next: (branches) => this.branches.set(branches),
      error: (error: unknown) => this.lookupError.set(error),
    });
  }

  hasProduct(productId: number): boolean {
    return this.lines().some((line) => line.productId === productId);
  }

  /** Agrega un producto con una unidad, o vacío si controla seriales. Devuelve false si ya está. */
  addProduct(product: ProductView): boolean {
    if (this.hasProduct(product.id)) {
      return false;
    }
    const line: TransferLine = {
      key: this.nextKey++,
      productId: product.id,
      sku: product.sku,
      name: product.name,
      value: isEquipmentSerial(product.serialMode) ? 0 : ONE_UNIT,
      originStock: null,
      tracksSerials: isEquipmentSerial(product.serialMode),
      serials: [],
    };
    this.lines.update((current) => [...current, line]);
    this.syncLinesControl();
    this.loadStock(line.key, line.productId);
    return true;
  }

  /** Cantidad escrita a mano, en milésimas (null si se borró el texto). */
  setValue(key: number, value: number | null): void {
    this.lines.update((current) => current.map((line) => (line.key === key ? { ...line, value } : line)));
    this.syncLinesControl();
  }

  /** Agrega una serial a una línea con seriales. La cantidad pasa a ser el número de seriales. */
  addSerial(key: number, serial: string): void {
    this.updateSerials(key, (serials) => [...serials, serial]);
  }

  removeSerial(key: number, serial: string): void {
    this.updateSerials(key, (serials) => serials.filter((item) => item !== serial));
  }

  removeLine(key: number): void {
    this.lines.update((current) => current.filter((line) => line.key !== key));
    this.syncLinesControl();
  }

  /** Una línea vale si tiene cantidad mayor que cero. */
  isLineValid(line: TransferLine): boolean {
    return line.value !== null && line.value > 0;
  }

  /** Texto de la existencia en el origen para mostrar; guion mientras se consulta. */
  stockText(line: TransferLine): string {
    return line.originStock === null ? '—' : line.originStock.toFixed(3);
  }

  /**
   * Cuerpo de POST /inventory/transfers. Devuelve null si falta el destino (el asistente no lo
   * permite al guardar). En una tienda no se envía el origen: el servidor usa el suyo.
   */
  buildRequest(): TransferRequest | null {
    const raw = this.form.getRawValue();
    if (raw.destinationBranchId === null) {
      return null;
    }
    return {
      destinationBranchId: raw.destinationBranchId,
      originBranchId: this.isCentral() ? raw.originBranchId : null,
      notes: blankToNull(raw.notes),
      lines: this.lines().map((line) => ({
        productId: line.productId,
        quantity: thousandthsToQuantity(line.value ?? 0),
        // Un serial por unidad: solo los productos que controlan seriales lo envían.
        ...(line.tracksSerials ? { serialNumbers: [...line.serials] } : {}),
      })),
      idempotencyKey: this.idempotencyKey,
    };
  }

  /** El origen cambió: el destino no puede ser el mismo, los seriales son de la sucursal anterior y el stock se vuelve a consultar. */
  private onOriginChanged(): void {
    if (this.form.controls.destinationBranchId.value === this.form.controls.originBranchId.value) {
      this.form.controls.destinationBranchId.setValue(null);
    }
    this.lines.update((current) =>
      current.map((line) => (line.tracksSerials ? { ...line, serials: [], value: 0 } : line)),
    );
    this.syncLinesControl();
    for (const line of this.lines()) {
      this.loadStock(line.key, line.productId);
    }
  }

  private branchName(id: number | null): string | null {
    const branch = this.branches().find((item) => item.id === id);
    return branch ? `${branch.code} · ${branch.name}` : null;
  }

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

  /** Existencia de un producto en la sucursal de origen. Sin existencia (404) es cero. */
  private loadStock(key: number, productId: number): void {
    const originId = this.effectiveOriginId();
    if (originId === null) {
      return;
    }
    this.api
      .availability([productId], originId)
      .pipe(
        map((rows) => rows[0]?.quantity ?? 0),
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 404 ? of(0) : throwError(() => error),
        ),
      )
      .subscribe({
        next: (quantity) => {
          // Solo se aplica si la línea sigue ahí y el origen no cambió mientras se consultaba.
          if (this.effectiveOriginId() !== originId) {
            return;
          }
          this.lines.update((current) =>
            current.map((line) => (line.key === key ? { ...line, originStock: quantity } : line)),
          );
        },
        error: (error: unknown) => this.lookupError.set(error),
      });
  }
}
