import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { TranslationParams } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Textos del diálogo: son claves de traducción, no texto final. */
export interface ConfirmOptions {
  readonly titleKey: string;
  readonly messageKey: string;
  readonly messageParams?: TranslationParams;
  /** Por defecto, "common.confirm". */
  readonly confirmKey?: string;
}

/** Contenido del diálogo. Lo usa ConfirmDialogService, que le asigna options antes de mostrarlo. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslatePipe],
  templateUrl: './confirm-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly activeModal = inject(NgbActiveModal);

  options: ConfirmOptions | null = null;
}

/**
 * Pide confirmación con un diálogo modal. Resuelve true si el usuario confirma y false si
 * cancela o cierra el diálogo.
 */
export function openConfirmDialog(modal: NgbModal, options: ConfirmOptions): Promise<boolean> {
  const ref = modal.open(ConfirmDialogComponent, { centered: true });
  ref.componentInstance.options = options;
  return ref.result.then(
    () => true,
    () => false,
  );
}
