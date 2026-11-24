import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ActivationCodeView } from '../../../core/api/store-nodes-api';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Muestra el código de activación una sola vez, con botón para copiarlo. La central no lo guarda:
 * si se cierra el diálogo y no se copió, hay que generar otro.
 */
@Component({
  selector: 'app-activation-code-dialog',
  imports: [TranslatePipe, LocalDateTimePipe],
  templateUrl: './activation-code-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivationCodeDialogComponent {
  protected readonly activeModal = inject(NgbActiveModal);

  /** Código recién generado y número de la tienda. Los asigna quien abre el diálogo. */
  view: ActivationCodeView | null = null;
  nodeNumber = 0;

  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  /**
   * Copia con la API del portapapeles. Sin ella (la web se sirve por http en la red local) se
   * selecciona el texto para que la persona lo copie con el teclado.
   */
  protected async copy(input: HTMLInputElement): Promise<void> {
    const code = this.view?.code ?? '';
    try {
      await navigator.clipboard.writeText(code);
      this.copyState.set('copied');
    } catch {
      input.select();
      this.copyState.set(document.execCommand('copy') ? 'copied' : 'failed');
    }
  }
}
