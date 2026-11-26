import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AttributeView } from '../../../core/api/categories-api';
import { FieldLabelComponent } from '../field-label/field-label';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Campo de una característica de equipo, según su tipo: texto, número, fecha o lista con sus opciones.
 * El valor viaja como texto; quien lo usa lo convierte y valida. Con showLabel, la etiqueta visible
 * va encima del campo; sin ella (por ejemplo, en la columna de una tabla) el campo se nombra para
 * lectores de pantalla.
 */
@Component({
  selector: 'app-equipment-attribute-field',
  imports: [FieldLabelComponent, TranslatePipe],
  templateUrl: './equipment-attribute-field.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentAttributeFieldComponent {
  readonly inputId = input.required<string>();
  readonly attribute = input.required<AttributeView>();
  /** Valor escrito, como texto. Vacío si todavía no tiene valor. */
  readonly value = input('');
  readonly invalid = input(false);
  readonly showLabel = input(true);

  /** Emite el texto nuevo del campo cada vez que cambia. */
  readonly valueChange = output<string>();

  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      this.valueChange.emit(target.value);
    }
  }
}
