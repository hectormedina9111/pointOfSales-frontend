import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { UserView, UsersApi } from '../../../core/api/users-api';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { PagedList } from '../../../shared/paging/paged-list';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { UserBranchesComponent } from './user-branches';
import { UserFormComponent } from './user-form';
import { UserPasswordResetComponent } from './user-password-reset';

/** Listado de usuarios con alta, edición, sucursales y cambio de contraseña. */
@Component({
  selector: 'app-users',
  imports: [TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './users.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly modal = inject(NgbModal);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  // La API no tiene búsqueda de usuarios: el listado solo se pagina y se ordena por usuario.
  protected readonly users = new PagedList<UserView>((request) => this.api.list(request), 'username');
  /** Clave de traducción del aviso de la última operación completada. */
  protected readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.users.load();
  }

  protected create(): void {
    const ref = this.modal.open(UserFormComponent, { size: 'lg' });
    ref.componentInstance.user = null;
    this.afterClose(ref.result, 'admin.users.saved');
  }

  protected edit(user: UserView): void {
    const ref = this.modal.open(UserFormComponent, { size: 'lg' });
    ref.componentInstance.user = user;
    this.afterClose(ref.result, 'admin.users.saved');
  }

  protected branches(user: UserView): void {
    const ref = this.modal.open(UserBranchesComponent, { size: 'lg' });
    ref.componentInstance.user = user;
    this.afterClose(ref.result, 'admin.users.branches.saved');
  }

  protected resetPassword(user: UserView): void {
    const ref = this.modal.open(UserPasswordResetComponent);
    ref.componentInstance.user = user;
    this.afterClose(ref.result, 'admin.users.passwordReset');
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.users.load();
      },
      () => undefined,
    );
  }
}
