import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { MenuItem } from '../../../core/api/me-api';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Menú lateral con el árbol que entrega el backend. Los grupos (con hijos) son títulos y sus
 * hijos son enlaces. En pantallas pequeñas se despliega con un botón.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './app-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSidebarComponent {
  private readonly translation = inject(TranslationService);

  readonly items = input.required<readonly MenuItem[]>();

  protected readonly expanded = signal(false);

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  /** Usa el texto traducido de "menu.<CODE>" y, si no existe, el nombre que trae el backend. */
  protected label(item: MenuItem): string {
    const key = `menu.${item.code}`;
    return this.translation.has(key) ? this.translation.translate(key) : item.name;
  }
}
