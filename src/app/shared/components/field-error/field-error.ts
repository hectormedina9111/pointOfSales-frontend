import { Component, inject, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

import { TranslationParams } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Indica si un campo debe mostrar error: solo después de que la persona lo haya tocado. */
export function isInvalidControl(control: AbstractControl): boolean {
  return control.invalid && control.touched;
}

/**
 * Mensaje de error de un campo. Usa el de la regla que falla (requerido, longitud, rango) y, para
 * cualquier otro patrón, la clave invalidKey (por ejemplo, validation.amount). Usa la detección
 * de cambios por defecto a propósito: el estado del campo cambia dentro del formulario padre,
 * y con OnPush este componente no se volvería a evaluar.
 */
@Component({
  selector: 'app-field-error',
  imports: [TranslatePipe],
  templateUrl: './field-error.html',
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  readonly invalidKey = input<string>('validation.invalid');

  protected error(): { readonly key: string; readonly params?: TranslationParams } | null {
    const control = this.control();
    if (!isInvalidControl(control)) {
      return null;
    }
    const errors = control.errors ?? {};
    if ('required' in errors) {
      return { key: 'form.required' };
    }
    if ('maxlength' in errors) {
      return { key: 'validation.maxLength', params: { max: errors['maxlength'].requiredLength } };
    }
    if ('minlength' in errors) {
      return { key: 'validation.minLength', params: { min: errors['minlength'].requiredLength } };
    }
    if ('email' in errors) {
      return { key: 'validation.email' };
    }
    if ('max' in errors) {
      return { key: 'validation.max', params: { max: errors['max'].max } };
    }
    return { key: this.invalidKey() };
  }
}
