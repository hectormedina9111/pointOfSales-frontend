import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { PrivilegesService } from '../../core/auth/privileges.service';

/**
 * Muestra el elemento solo si el usuario tiene el privilegio: *appIfPrivilege="'POST_PRODUCTS'".
 * Se vuelve a evaluar cuando cambian los privilegios de la sesión.
 */
@Directive({
  selector: '[appIfPrivilege]',
})
export class IfPrivilegeDirective {
  private readonly privileges = inject(PrivilegesService);
  private readonly template = inject(TemplateRef);
  private readonly container = inject(ViewContainerRef);

  /** Código del privilegio requerido, por ejemplo POST_PRODUCTS. */
  readonly appIfPrivilege = input.required<string>();

  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.privileges.has(this.appIfPrivilege());
      if (allowed === this.shown) {
        return;
      }
      this.shown = allowed;
      this.container.clear();
      if (allowed) {
        this.container.createEmbeddedView(this.template);
      }
    });
  }
}
