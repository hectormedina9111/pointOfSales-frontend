import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  ProblemFieldError,
  readProblem,
  resolveErrorCode,
} from '../../../core/http/problem-details';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

interface ProblemView {
  readonly message: string;
  readonly detail: string | null;
  readonly fieldErrors: readonly ProblemFieldError[];
}

/**
 * Muestra un error de la API con el texto traducido de su código ("error.<CODE>").
 * Si el código no tiene texto, muestra el genérico y, como detalle, el "detail" del backend.
 * Acepta cualquier valor: lo que no sea una respuesta HTTP se muestra como error genérico.
 */
@Component({
  selector: 'app-problem-alert',
  imports: [TranslatePipe],
  templateUrl: './problem-alert.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProblemAlertComponent {
  private readonly translation = inject(TranslationService);

  readonly error = input<unknown>(null);

  /** Código que sustituye al deducido del error, cuando la pantalla sabe más (por ejemplo, login). */
  readonly code = input<string | null>(null);

  protected readonly view = computed<ProblemView | null>(() => {
    const error = this.error();
    if (error === null || error === undefined) {
      return null;
    }
    const code = this.code() ?? (error instanceof HttpErrorResponse ? resolveErrorCode(error) : 'generic');
    const key = `error.${code}`;
    const hasText = this.translation.has(key);
    const problem = readProblem(error);

    return {
      message: hasText ? this.translation.translate(key) : this.translation.translate('error.generic'),
      detail: hasText ? null : (problem?.detail ?? null),
      fieldErrors: problem?.errors ?? [],
    };
  });
}
