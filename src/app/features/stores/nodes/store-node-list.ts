import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { tap } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { listAllPages } from '../../../core/api/page';
import { StoreNodesApi, StoreNodeView } from '../../../core/api/store-nodes-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StoreNodeCardComponent } from '../../../shared/components/store-node-card/store-node-card';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { checkedValue } from '../../../shared/forms/form-values';
import { PagedList } from '../../../shared/paging/paged-list';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { autoRefresh } from '../../../shared/polling/auto-refresh';
import { CaughtUpTracker } from '../../../shared/stores/caught-up-tracker';
import { branchLabel } from '../../../shared/stores/branch-label';
import { ActivationCodeDialogComponent } from './activation-code-dialog';
import { StoreNodeFormComponent } from './store-node-form';
import { StoreBranchDialogComponent } from './store-branch-dialog';

/** Tiendas por página: el panel muestra muchas a la vez. */
const PANEL_PAGE_SIZE = 50;

/** Aviso de éxito: clave de traducción y sus parámetros. */
interface Notice {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * Panel de la central: una tarjeta por tienda que se refresca sola cada pocos segundos. Cuando los
 * cambios pendientes de una tienda bajan a cero, su tarjeta se resalta un momento.
 * Solo se monta en la central; las acciones de escritura exigen su privilegio.
 */
@Component({
  selector: 'app-store-node-list',
  imports: [
    TranslatePipe,
    LocalDateTimePipe,
    ProblemAlertComponent,
    PaginationComponent,
    IfPrivilegeDirective,
    StoreNodeCardComponent,
  ],
  templateUrl: './store-node-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreNodeListComponent {
  private readonly api = inject(StoreNodesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly modal = inject(NgbModal);
  protected readonly isCentral = inject(SystemInfoService).isCentral;

  protected readonly autoRefreshOn = signal(true);
  protected readonly lastUpdated = signal<Date | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly actionError = signal<unknown>(null);
  protected readonly branches = signal<ReadonlyMap<number, BranchView>>(new Map());
  protected readonly branchesError = signal<unknown>(null);
  protected readonly caughtUp = new CaughtUpTracker();

  protected readonly nodes = new PagedList<StoreNodeView>(
    (request) => this.api.list(request).pipe(tap((page) => this.onLoaded(page.content))),
    'nodeNumber,asc',
    PANEL_PAGE_SIZE,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.caughtUp.dispose());
    // La primera carga la hace el refresco automático al activarse; después, cada 5 s con la pestaña visible.
    autoRefresh(this.autoRefreshOn, () => this.nodes.load());
    listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
      next: (list) => this.branches.set(new Map(list.map((branch) => [branch.id, branch] as const))),
      error: (error: unknown) => this.branchesError.set(error),
    });
  }

  protected toggleAutoRefresh(event: Event): void {
    this.autoRefreshOn.set(checkedValue(event));
  }

  /** Nombre de la sucursal. Si el usuario no la ve, muestra su id para no perder la referencia. */
  protected branchName(node: StoreNodeView): string | null {
    if (node.branchId === null) {
      return null;
    }
    return branchLabel(this.branches(), node.branchId);
  }

  protected register(): void {
    const ref = this.modal.open(StoreNodeFormComponent, { size: 'lg' });
    ref.result.then(
      (created: StoreNodeView) => {
        this.notice.set({ key: 'stores.nodes.registered', params: { number: created.nodeNumber } });
        this.nodes.load();
      },
      () => undefined,
    );
  }

  protected assignBranch(node: StoreNodeView): void {
    const ref = this.modal.open(StoreBranchDialogComponent, { centered: true });
    ref.componentInstance.node = node;
    ref.result.then(
      (updated: StoreNodeView) => {
        this.notice.set({ key: 'stores.nodes.branch.assigned', params: { number: updated.nodeNumber } });
        this.nodes.load();
      },
      () => undefined,
    );
  }

  protected generateCode(node: StoreNodeView): void {
    this.actionError.set(null);
    this.api.activationCode(node.id).subscribe({
      next: (view) => {
        const ref = this.modal.open(ActivationCodeDialogComponent, { centered: true });
        ref.componentInstance.view = view;
        ref.componentInstance.nodeNumber = node.nodeNumber;
        // Cerrar el diálogo rechaza su resultado; no es un error que mostrar.
        ref.result.catch(() => undefined);
      },
      error: (error: unknown) => this.actionError.set(error),
    });
  }

  protected async revoke(node: StoreNodeView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'stores.nodes.revoke.title',
      messageKey: 'stores.nodes.revoke.message',
      messageParams: { number: node.nodeNumber },
      confirmKey: 'stores.nodes.revoke.confirm',
    });
    if (!confirmed) {
      return;
    }
    this.actionError.set(null);
    this.api.revoke(node.id).subscribe({
      next: () => {
        this.notice.set({ key: 'stores.nodes.revoked', params: { number: node.nodeNumber } });
        this.nodes.load();
      },
      error: (error: unknown) => this.actionError.set(error),
    });
  }

  private onLoaded(nodes: readonly StoreNodeView[]): void {
    this.lastUpdated.set(new Date());
    this.caughtUp.observe(nodes);
  }
}
