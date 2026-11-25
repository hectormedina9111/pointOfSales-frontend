import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { CategoriesApi, CategoryView } from '../../../core/api/categories-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TreeRow, flattenTree } from '../../../shared/tree/tree';
import { CategoryFormComponent } from './category-form';

/**
 * Categorías en árbol: cada subcategoría se sangra bajo su padre. Se carga la lista completa
 * (sin paginar) para poder armar el árbol. Desactivar pide confirmación.
 */
@Component({
  selector: 'app-categories',
  imports: [TranslatePipe, ProblemAlertComponent, IfPrivilegeDirective],
  templateUrl: './categories.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesComponent implements OnInit {
  private readonly api = inject(CategoriesApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly rows = signal<readonly TreeRow<CategoryView>[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  /** Clave de traducción del aviso de la última operación completada. */
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected create(): void {
    const ref = this.modal.open(CategoryFormComponent, { size: 'lg' });
    ref.componentInstance.category = null;
    this.afterClose(ref.result, 'catalog.categories.saved');
  }

  protected edit(category: CategoryView): void {
    const ref = this.modal.open(CategoryFormComponent, { size: 'lg' });
    ref.componentInstance.category = category;
    this.afterClose(ref.result, 'catalog.categories.saved');
  }

  protected async deactivate(category: CategoryView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'catalog.categories.deactivate.title',
      messageKey: 'catalog.categories.deactivate.message',
      messageParams: { name: category.name },
      confirmKey: 'common.deactivate',
    });
    if (!confirmed) {
      return;
    }
    this.api.deactivate(category.id).subscribe({
      next: () => {
        this.notice.set('catalog.categories.deactivated');
        this.load();
      },
      error: (error: unknown) => this.error.set(error),
    });
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    listAllPages((request) => this.api.list(request), 'name').subscribe({
      next: (categories) => {
        this.rows.set(flattenTree(categories, (c) => c.id, (c) => c.parentId));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga el árbol; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.load();
      },
      () => undefined,
    );
  }
}
