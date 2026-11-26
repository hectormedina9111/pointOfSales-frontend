import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { TranslationService } from '../../../core/i18n/translation.service';
import { EquipmentAttributeFieldComponent } from '../../../shared/components/equipment-attribute-field/equipment-attribute-field';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { EquipmentLoadStore, EquipmentRow, RowIssues } from './equipment-load.store';
import { EquipmentCsvMessage, parseEquipmentCsv } from './equipment-csv';

/** Un mensaje del resultado de la carga de archivo, ya traducido y con su línea. */
interface CsvIssueView {
  readonly line: number;
  readonly text: string;
}

/** Resultado visible de la última carga de archivo: error del encabezado o filas agregadas y errores. */
interface CsvResultView {
  readonly header: string | null;
  readonly empty: boolean;
  readonly added: number;
  readonly issues: readonly CsvIssueView[];
}

/**
 * Paso 2 de la carga: los equipos. Escanear o escribir una serie y pulsar Intro agrega una fila; cada fila
 * tiene la serie, el código externo y un campo por característica activa de la plantilla. También se puede
 * importar un CSV: las filas válidas se agregan y las demás se muestran con su línea y su motivo.
 */
@Component({
  selector: 'app-load-equipment-step',
  imports: [EquipmentAttributeFieldComponent, FieldLabelComponent, ProblemAlertComponent, TranslatePipe],
  templateUrl: './load-equipment-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadEquipmentStepComponent {
  private readonly translation = inject(TranslationService);
  protected readonly store = inject(EquipmentLoadStore);

  /** Aviso de la última acción (clave de traducción), o null. */
  protected readonly lineMessage = signal<string | null>(null);
  protected readonly csvBusy = signal(false);
  protected readonly csvResult = signal<CsvResultView | null>(null);

  /** Intro en el campo de escaneo: agrega la serie escrita. Nunca avanza el paso. */
  protected scan(event: Event): void {
    event.preventDefault();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const message = this.store.addSerial(input.value);
    this.lineMessage.set(message);
    if (message === null) {
      input.value = '';
    }
  }

  protected serialChanged(row: EquipmentRow, event: Event): void {
    this.store.updateSerial(row.key, this.valueOf(event));
  }

  protected externalCodeChanged(row: EquipmentRow, event: Event): void {
    this.store.updateExternalCode(row.key, this.valueOf(event));
  }

  protected attributeChanged(row: EquipmentRow, code: string, text: string): void {
    this.store.updateAttribute(row.key, code, text);
  }

  protected issueOf(row: EquipmentRow): RowIssues | null {
    return this.store.issues().get(row.key) ?? null;
  }

  protected textOf(row: EquipmentRow, code: string): string {
    return this.store.textOf(row, code);
  }

  /** Lee el archivo elegido, valida sus filas y agrega las válidas. Al final limpia el campo para repetir. */
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
      .then((text) => this.importText(text))
      .catch(() => this.finishCsv({ header: this.translation.translate('equipment.csv.readError'), empty: false, added: 0, issues: [] }))
      .finally(() => {
        input.value = '';
      });
  }

  private importText(text: string): void {
    const parsed = parseEquipmentCsv(text, this.store.activeAttributes());
    if (parsed.headerError !== null) {
      this.finishCsv({ header: this.message(parsed.headerError), empty: false, added: 0, issues: [] });
      return;
    }
    const result = this.store.importRows(parsed.rows);
    const issues: CsvIssueView[] = [
      ...parsed.errors.map((error) => this.issue(error.line, error)),
      ...result.rejected.map((item) => this.issue(item.line, { key: item.key, params: {} })),
    ].sort((a, b) => a.line - b.line);
    this.finishCsv({
      header: null,
      empty: parsed.rows.length === 0 && parsed.errors.length === 0,
      added: result.added,
      issues,
    });
  }

  private issue(line: number, message: EquipmentCsvMessage): CsvIssueView {
    return {
      line,
      text: this.translation.translate('equipment.csv.rowError', { line, message: this.message(message) }),
    };
  }

  private message(message: EquipmentCsvMessage): string {
    return this.translation.translate(message.key, message.params);
  }

  private valueOf(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  private finishCsv(result: CsvResultView): void {
    this.csvResult.set(result);
    this.csvBusy.set(false);
  }
}
