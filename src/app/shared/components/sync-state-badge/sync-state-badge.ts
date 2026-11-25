import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StoreNodeState } from '../../../core/api/store-nodes-api';
import { TranslatePipe } from '../../pipes/translate.pipe';

const BADGE_CLASSES: Readonly<Record<StoreNodeState, string>> = {
  ACTIVE: 'text-bg-success',
  OUT_OF_SYNC: 'text-bg-warning',
  DISABLED: 'text-bg-secondary',
  PENDING: 'text-bg-primary',
};

/** Estado de sincronización de una tienda con su color (verde, ámbar, gris o azul). */
@Component({
  selector: 'app-sync-state-badge',
  imports: [TranslatePipe],
  template: `<span class="badge" [class]="cssClass()">{{ ('stores.syncState.' + state()) | translate }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncStateBadgeComponent {
  readonly state = input.required<StoreNodeState>();

  protected readonly cssClass = computed(() => `badge ${BADGE_CLASSES[this.state()]}`);
}
