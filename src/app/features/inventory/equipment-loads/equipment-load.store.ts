import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, Validators } from '@angular/forms';
import { startWith } from 'rxjs';

import { AttributeView, CategoriesApi } from '../../../core/api/categories-api';
import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { EquipmentLoadRequest } from '../../../core/api/equipment-api';
import { ProductView } from '../../../core/api/products-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { AMOUNT_PATTERN } from '../../../shared/forms/amounts';
import { blankToNull } from '../../../shared/forms/form-values';
import { randomUuid } from '../../../shared/ids/random-uuid';
import { branchLabel } from '../../../shared/stores/branch-label';
import {
  AttributeIssues,
  attributeIssues,
  attributeReadableText,
  attributeValues,
} from '../shared/equipment-attributes';
import { EquipmentCsvRow } from './equipment-csv';

/** Largo máximo de las notas, igual que en el backend. */
const NOTES_MAX = 200;

/**
 * Un equipo de la carga: su serie, su código externo (vacío si no tiene) y el texto de cada
 * característica por código. key identifica la fila en la pantalla.
 */
export interface EquipmentRow {
  readonly key: number;
  readonly serialNumber: string;
  readonly externalCode: string;
  readonly texts: Readonly<Record<string, string>>;
}

/** Errores de una fila: clave de traducción por campo, o null. valid es verdadero si no tiene ninguno. */
export interface RowIssues {
  readonly serial: string | null;
  readonly externalCode: string | null;
  readonly attributes: AttributeIssues;
  readonly valid: boolean;
}

/** Resultado de agregar filas del archivo: cuántas entraron y, por línea, las que se rechazaron. */
export interface ImportResult {
  readonly added: number;
  readonly rejected: readonly { readonly line: number; readonly key: string }[];
}

/**
 * Estado del asistente de carga de equipos: encabezado (sucursal, producto, costo y notas), la plantilla
 * de características del producto y las filas de equipos. Vive en la pantalla, así cada carga empieza
 * limpia y los pasos comparten lo que se escribe. La carga es la entrada de inventario, así que la
 * sucursal es obligatoria solo en la central, igual que en un documento.
 */
@Injectable()
export class EquipmentLoadStore {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly systemInfo = inject(SystemInfoService);

  /** Solo la central elige sucursal; una tienda carga en la suya. */
  readonly isCentral = this.systemInfo.isCentral;

  /** Clave de idempotencia: se crea una vez por carga y se reusa en los reintentos. */
  readonly idempotencyKey = randomUuid();

  readonly form = this.fb.group({
    branchId: this.fb.control<number | null>(null),
    unitCost: this.fb.control('', [Validators.required, Validators.pattern(AMOUNT_PATTERN)]),
    notes: this.fb.control('', [Validators.maxLength(NOTES_MAX)]),
  });

  /** Producto con serie elegido. El control vale el producto cuando es válido; lo usa el paso de encabezado. */
  readonly productControl = new FormControl<ProductView | null>(null, [Validators.required]);

  /** Cuenta las filas válidas; el paso de equipos exige al menos una y que todas lo sean. */
  readonly lineControl = new FormControl(0, { nonNullable: true, validators: [Validators.min(1)] });

  /** Controles del paso de encabezado: sucursal (en la central), producto y costo. */
  readonly headerControls = [this.form.controls.branchId, this.productControl, this.form.controls.unitCost];

  readonly branchId = toSignal(this.form.controls.branchId.valueChanges, { initialValue: null as number | null });
  readonly branches = signal<readonly BranchView[]>([]);
  readonly lookupError = signal<unknown>(null);

  readonly product = signal<ProductView | null>(null);
  /** Plantilla completa de la categoría del producto; solo las activas se piden en la carga. */
  readonly attributes = signal<readonly AttributeView[]>([]);
  readonly attributesLoading = signal(false);
  readonly attributesError = signal<unknown>(null);
  readonly activeAttributes = computed(() => this.attributes().filter((attribute) => attribute.active));

  readonly rows = signal<readonly EquipmentRow[]>([]);

  /** Sucursal que se carga: la elegida en la central, o la única de la tienda. */
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

  /** Errores de cada fila, por clave de fila. Se recalcula al cambiar cualquier fila. */
  readonly issues = computed(() => {
    const rows = this.rows();
    const attributes = this.activeAttributes();
    const serialCount = countBy(rows, (row) => row.serialNumber);
    const codeCount = countBy(rows, (row) => row.externalCode, true);
    const result = new Map<number, RowIssues>();
    for (const row of rows) {
      const serial = row.serialNumber === ''
        ? 'equipment.load.serialRequired'
        : (serialCount.get(row.serialNumber) ?? 0) > 1 ? 'equipment.load.duplicateSerial' : null;
      const externalCode = row.externalCode !== '' && (codeCount.get(row.externalCode) ?? 0) > 1
        ? 'equipment.load.duplicateExternalCode'
        : null;
      const found = attributeIssues(attributes, row.texts);
      result.set(row.key, {
        serial,
        externalCode,
        attributes: found,
        valid: serial === null && externalCode === null && Object.keys(found).length === 0,
      });
    }
    return result;
  });

  private nextKey = 1;

  constructor() {
    // La sucursal es obligatoria solo en la central; se aplica cuando el nodo ya es conocido.
    toObservable(this.isCentral)
      .pipe(startWith(null), takeUntilDestroyed())
      .subscribe(() => this.applyBranchRule());

    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (branches) => this.branches.set(branches),
      error: (error: unknown) => this.lookupError.set(error),
    });
  }

  /**
   * Elige el producto de la carga. Devuelve la clave del aviso si no se puede: el producto no controla
   * seriales, o ya hay equipos cargados de otro producto (cada plantilla es distinta).
   */
  chooseProduct(product: ProductView): string | null {
    if (!product.tracksSerials) {
      return 'equipment.load.product.notSerialized';
    }
    if (this.product()?.id === product.id) {
      return null;
    }
    if (this.rows().length > 0) {
      return 'equipment.load.product.locked';
    }
    this.product.set(product);
    this.productControl.setValue(product);
    this.loadAttributes(product);
    return null;
  }

  /** Agrega una fila con la serie escrita o escaneada. Devuelve la clave del aviso si la serie ya está. */
  addSerial(serial: string): string | null {
    const value = serial.trim();
    if (value === '') {
      return null;
    }
    if (this.rows().some((row) => row.serialNumber === value)) {
      return 'equipment.load.scan.duplicate';
    }
    this.rows.update((current) => [
      ...current,
      { key: this.nextKey++, serialNumber: value, externalCode: '', texts: {} },
    ]);
    this.syncLineControl();
    return null;
  }

  /**
   * Agrega las filas del archivo que no repiten serie ni código externo de la carga. Las demás se
   * devuelven con su línea y su motivo.
   */
  importRows(parsed: readonly EquipmentCsvRow[]): ImportResult {
    const serials = new Set(this.rows().map((row) => row.serialNumber));
    const codes = new Set(this.rows().map((row) => row.externalCode).filter((code) => code !== ''));
    const added: EquipmentRow[] = [];
    const rejected: { line: number; key: string }[] = [];
    for (const row of parsed) {
      if (serials.has(row.serialNumber)) {
        rejected.push({ line: row.line, key: 'equipment.load.duplicateSerial' });
        continue;
      }
      if (row.externalCode !== null && codes.has(row.externalCode)) {
        rejected.push({ line: row.line, key: 'equipment.load.duplicateExternalCode' });
        continue;
      }
      serials.add(row.serialNumber);
      if (row.externalCode !== null) {
        codes.add(row.externalCode);
      }
      added.push({
        key: this.nextKey++,
        serialNumber: row.serialNumber,
        externalCode: row.externalCode ?? '',
        texts: row.texts,
      });
    }
    this.rows.update((current) => [...current, ...added]);
    this.syncLineControl();
    return { added: added.length, rejected };
  }

  updateSerial(key: number, serial: string): void {
    this.updateRow(key, (row) => ({ ...row, serialNumber: serial.trim() }));
  }

  updateExternalCode(key: number, code: string): void {
    this.updateRow(key, (row) => ({ ...row, externalCode: code.trim() }));
  }

  updateAttribute(key: number, code: string, text: string): void {
    this.updateRow(key, (row) => ({ ...row, texts: { ...row.texts, [code]: text } }));
  }

  removeRow(key: number): void {
    this.rows.update((current) => current.filter((row) => row.key !== key));
    this.syncLineControl();
  }

  /** Texto de una característica de la fila; vacío si todavía no tiene valor. */
  textOf(row: EquipmentRow, code: string): string {
    return row.texts[code] ?? '';
  }

  /** Resumen de características de una fila, en el orden de la plantilla. */
  summaryOf(row: EquipmentRow): string {
    return attributeReadableText(this.activeAttributes(), row.texts);
  }

  /** Cuerpo de POST /inventory/equipment-loads, o null si todavía no hay producto. */
  buildRequest(): EquipmentLoadRequest | null {
    const product = this.product();
    if (product === null) {
      return null;
    }
    const raw = this.form.getRawValue();
    const attributes = this.activeAttributes();
    return {
      branchId: this.isCentral() ? raw.branchId : null,
      productId: product.id,
      unitCost: raw.unitCost.trim(),
      notes: blankToNull(raw.notes),
      equipment: this.rows().map((row) => ({
        serialNumber: row.serialNumber,
        externalCode: blankToNull(row.externalCode),
        attributes: attributeValues(attributes, row.texts),
      })),
      idempotencyKey: this.idempotencyKey,
    };
  }

  private applyBranchRule(): void {
    this.form.controls.branchId.setValidators(this.isCentral() ? [Validators.required] : []);
    this.form.controls.branchId.updateValueAndValidity();
  }

  private loadAttributes(product: ProductView): void {
    if (product.categoryId === null) {
      this.attributes.set([]);
      this.attributesError.set(null);
      return;
    }
    this.attributesLoading.set(true);
    this.attributesError.set(null);
    this.categoriesApi.attributes(product.categoryId).subscribe({
      next: (attributes) => {
        this.attributes.set(attributes);
        this.attributesLoading.set(false);
      },
      error: (error: unknown) => {
        this.attributes.set([]);
        this.attributesError.set(error);
        this.attributesLoading.set(false);
      },
    });
  }

  private updateRow(key: number, change: (row: EquipmentRow) => EquipmentRow): void {
    this.rows.update((current) => current.map((row) => (row.key === key ? change(row) : row)));
    this.syncLineControl();
  }

  /** El control del paso de equipos vale el número de filas si todas son válidas; si no, 0. */
  private syncLineControl(): void {
    const rows = this.rows();
    const issues = this.issues();
    const allValid = rows.length > 0 && rows.every((row) => issues.get(row.key)?.valid === true);
    this.lineControl.setValue(allValid ? rows.length : 0);
  }
}

/**
 * Cuenta las apariciones de cada valor. Con ignoreEmpty, un valor vacío no cuenta (los códigos externos
 * vacíos no son duplicados).
 */
function countBy<T>(items: readonly T[], value: (item: T) => string, ignoreEmpty = false): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = value(item);
    if (ignoreEmpty && key === '') {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
