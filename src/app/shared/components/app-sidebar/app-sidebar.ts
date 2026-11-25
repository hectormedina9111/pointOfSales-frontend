import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { MenuItem } from '../../../core/api/me-api';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Entradas del menú que solo existen en la central: una tienda no las muestra. */
const CENTRAL_ONLY_MENU_CODES: ReadonlySet<string> = new Set(['MENU_ORGANIZATION_COUNTRIES']);

/**
 * Menú lateral con el árbol que entrega el backend. Los grupos (con hijos) son títulos y sus
 * hijos son enlaces. Se muestra fijo en pantallas grandes y dentro de un panel en las pequeñas.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './app-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSidebarComponent {
  private readonly translation = inject(TranslationService);
  private readonly systemInfo = inject(SystemInfoService);

  readonly items = input.required<readonly MenuItem[]>();

  /** Menú sin las entradas que solo administra la central, si el nodo es una tienda. Un grupo sin hijos visibles se oculta. */
  protected readonly visibleItems = computed(() => {
    const storeNode = this.systemInfo.isStore();
    const visible = (code: string): boolean => !(storeNode && CENTRAL_ONLY_MENU_CODES.has(code));
    return this.items().flatMap((item): MenuItem[] => {
      if (item.children.length === 0) {
        return visible(item.code) ? [item] : [];
      }
      const children = item.children.filter((child) => visible(child.code));
      return children.length > 0 ? [{ ...item, children }] : [];
    });
  });

  /** Usa el texto traducido de "menu.<CODE>" y, si no existe, el nombre que trae el backend. */
  protected label(item: MenuItem): string {
    const key = `menu.${item.code}`;
    return this.translation.has(key) ? this.translation.translate(key) : item.name;
  }
}
