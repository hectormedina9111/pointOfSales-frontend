import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Etiqueta de un campo de formulario. Con required, muestra un asterisco rojo y, para lectores de
 * pantalla, el texto "obligatorio". El texto de la etiqueta se pasa como contenido:
 * <app-field-label targetId="user-name" [required]="true">{{ 'key' | translate }}</app-field-label>
 */
@Component({
  selector: 'app-field-label',
  imports: [TranslatePipe],
  templateUrl: './field-label.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldLabelComponent {
  /** Id del control al que apunta la etiqueta (atributo for). */
  readonly targetId = input.required<string>();

  /** Marca el campo como obligatorio. */
  readonly required = input(false);
}
