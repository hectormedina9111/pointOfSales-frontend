import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { RoleView, RolesApi } from '../../../core/api/roles-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { RoleFormComponent } from './role-form';
import { RolePrivilegesComponent } from './role-privileges';

/** Listado de roles con alta, edición y privilegios. La lista de roles no está paginada. */
@Component({
  selector: 'app-roles',
  imports: [TranslatePipe, ProblemAlertComponent, IfPrivilegeDirective],
  templateUrl: './roles.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent implements OnInit {
  private readonly api = inject(RolesApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly roles = signal<readonly RoleView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  /** Clave de traducción del aviso de la última operación completada. */
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected create(): void {
    const ref = this.modal.open(RoleFormComponent, { size: 'lg' });
    ref.componentInstance.role = null;
    this.afterClose(ref.result, 'admin.roles.saved');
  }

  protected edit(role: RoleView): void {
    const ref = this.modal.open(RoleFormComponent, { size: 'lg' });
    ref.componentInstance.role = role;
    this.afterClose(ref.result, 'admin.roles.saved');
  }

  protected privileges(role: RoleView): void {
    const ref = this.modal.open(RolePrivilegesComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.role = role;
    this.afterClose(ref.result, 'admin.roles.privileges.saved');
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la lista; si se cancela, no hace nada. */
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
