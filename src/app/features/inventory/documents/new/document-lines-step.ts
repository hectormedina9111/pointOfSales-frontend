import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { ProductView, ProductsApi } from '../../../../core/api/products-api';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ProblemAlertComponent } from '../../../../shared/components/problem-alert/problem-alert';
import { ProductPickerComponent } from '../../../../shared/components/product-picker/product-picker';
import { FieldLabelComponent } from '../../../../shared/components/field-label/field-label';
import { quantityToThousandths } from '../../../../shared/forms/amounts';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { countToThousandths } from '../../shared/inventory-math';
import { DocumentDraftStore, DocumentLine, NewLine } from './document-draft.store';
import { CsvRow, parseInventoryCsv } from './inventory-csv';
import { currentText, differenceText, valueText } from './document-line-text';

/** Productos que se piden para cada SKU del archivo; el que coincide exacto es el elegido. */
const CSV_SEARCH_SIZE = 10;

/** Un mensaje del resultado de la carga: ya traducido y con el número de línea del archivo. */
interface CsvIssueView {
  readonly line: number;
  readonly text: string;
}

/** Resultado visible de la última carga de archivo. */
interface CsvResultView {
  readonly headerError: boolean;
  readonly empty: boolean;
  readonly added: number;
  readonly issues: readonly CsvIssueView[];
}

/** Búsqueda de un SKU del archivo: la fila, el producto encontrado y si la búsqueda falló. */
interface ResolvedRow {
  readonly row: CsvRow;
  readonly product: ProductView | null;
  readonly failed: boolean;
}

/**
 * Paso 2 del documento: líneas. Busca productos por código de barras, SKU o nombre y agrega cada uno;
 * en entradas y salidas se escribe la cantidad, y en entradas el costo unitario opcional; en un ajuste
 * se escribe la cantidad contada y se ve el saldo actual y la diferencia. En entradas también se puede
 * cargar un archivo CSV: cada SKU se busca en el catálogo y las filas con error se muestran una por una.
 */
@Component({
  selector: 'app-document-lines-step',
  imports: [ProblemAlertComponent, FieldLabelComponent, ProductPickerComponent, TranslatePipe],
  templateUrl: './document-lines-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentLinesStepComponent {
  private readonly products = inject(ProductsApi);
  private readonly translation = inject(TranslationService);
  protected readonly draft = inject(DocumentDraftStore);

  /** Mensaje de aviso de la última acción (clave de traducción), o null. */
  protected readonly lineMessage = signal<string | null>(null);
  protected readonly csvBusy = signal(false);
  protected readonly csvResult = signal<CsvResultView | null>(null);

  protected readonly isEntry = computed(() => this.draft.type() === 'ENTRY');
  protected readonly isAdjustment = this.draft.isAdjustment;

  protected valueText(line: DocumentLine): string {
    return valueText(line);
  }

  protected currentText(line: DocumentLine): string {
    return currentText(line);
  }

  protected differenceText(line: DocumentLine): string {
    return differenceText(line);
  }

  protected addProduct(product: ProductView): void {
    this.lineMessage.set(this.draft.addProduct(product) ? null : 'inventory.lines.duplicate');
  }

  /** Cantidad escrita a mano. Si no es válida, se restaura el texto anterior y se avisa. */
  protected onValueChange(line: DocumentLine, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const text = input.value.trim();
    if (text === '' && this.isAdjustment()) {
      this.lineMessage.set(null);
      this.draft.setValue(line.key, null);
      return;
    }
    const thousandths = this.isAdjustment() ? countToThousandths(text) : quantityToThousandths(text);
    if (thousandths === null || (!this.isAdjustment() && thousandths <= 0)) {
      this.lineMessage.set(this.isAdjustment() ? 'inventory.lines.invalidCount' : 'inventory.lines.invalidQuantity');
      input.value = valueText(line);
      return;
    }
    this.lineMessage.set(null);
    this.draft.setValue(line.key, thousandths);
  }

  protected onUnitCostChange(line: DocumentLine, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!this.draft.setUnitCost(line.key, input.value)) {
      this.lineMessage.set('inventory.lines.invalidCost');
      input.value = line.unitCost;
      return;
    }
    this.lineMessage.set(null);
  }

  /** Lee el archivo elegido, valida sus filas y agrega las válidas. Al final limpia el campo para poder repetir. */
  protected onCsvSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (input === null || file === undefined) {
      return;
    }
    this.csvBusy.set(true);
    this.csvResult.set(null);
    file
      .text()
      .then((text) => this.importRows(text))
      .catch(() => this.finishCsv({ headerError: true, empty: false, added: 0, issues: [] }))
      .finally(() => {
        input.value = '';
      });
  }

  protected removeLine(line: DocumentLine): void {
    this.draft.removeLine(line.key);
  }

  private importRows(text: string): void {
    const parsed = parseInventoryCsv(text);
    if (parsed.headerError) {
      this.finishCsv({ headerError: true, empty: false, added: 0, issues: [] });
      return;
    }
    const issues: CsvIssueView[] = parsed.errors.map((error) => this.issue(error.line, error.key));
    if (parsed.rows.length === 0) {
      this.finishCsv({ headerError: false, empty: issues.length === 0, added: 0, issues });
      return;
    }

    forkJoin(parsed.rows.map((row) => this.resolveRow(row))).subscribe((resolved) => {
      const added: NewLine[] = [];
      const seen = new Set<number>();
      for (const item of resolved) {
        const { row, product } = item;
        if (item.failed) {
          issues.push(this.issue(row.line, 'inventory.csv.error.lookup'));
        } else if (product === null) {
          issues.push(this.issue(row.line, 'inventory.csv.error.unknownSku', { sku: row.sku }));
        } else if (seen.has(product.id) || this.draft.hasProduct(product.id)) {
          issues.push(this.issue(row.line, 'inventory.csv.error.duplicate', { sku: row.sku }));
        } else {
          seen.add(product.id);
          added.push({ product, value: row.quantity, unitCost: row.unitCost ?? '' });
        }
      }
      this.draft.addLines(added);
      this.finishCsv({
        headerError: false,
        empty: false,
        added: added.length,
        issues: [...issues].sort((a, b) => a.line - b.line),
      });
    });
  }

  /** Busca el SKU de una fila. Coincide solo el producto activo con el mismo SKU, sin distinguir mayúsculas. */
  private resolveRow(row: CsvRow): Observable<ResolvedRow> {
    const sku = row.sku.toLowerCase();
    return this.products
      .search({ page: 0, size: CSV_SEARCH_SIZE, sort: 'sku' }, { q: row.sku, categoryId: null, type: null, active: true })
      .pipe(
        map((page) => ({
          row,
          product: page.content.find((product) => product.sku.toLowerCase() === sku) ?? null,
          failed: false,
        })),
        catchError(() => of({ row, product: null, failed: true })),
      );
  }

  private issue(line: number, key: string, params?: Readonly<Record<string, string | number>>): CsvIssueView {
    const message = this.translation.translate(key, params);
    return { line, text: this.translation.translate('inventory.csv.rowError', { line, message }) };
  }

  private finishCsv(result: CsvResultView): void {
    this.csvResult.set(result);
    this.csvBusy.set(false);
  }
}
