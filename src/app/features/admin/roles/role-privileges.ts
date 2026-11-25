import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { PrivilegeType, PrivilegesApi, PrivilegeView } from '../../../core/api/privileges-api';
import { RoleView, RolesApi } from '../../../core/api/roles-api';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { checkedValue } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Privilegios de un módulo (por ejemplo "users"), en el orden que entrega el backend. */
export interface PrivilegeModule {
  readonly name: string;
  readonly privileges: readonly PrivilegeView[];
}

/** Privilegios de un tipo, agrupados por módulo. */
export interface PrivilegeGroup {
  readonly type: PrivilegeType;
  readonly modules: readonly PrivilegeModule[];
}

const TYPE_ORDER: readonly PrivilegeType[] = ['ENDPOINT', 'MENU', 'ACTION'];

/** Agrupa por tipo (ENDPOINT, MENU, ACTION) y luego por módulo. Omite los tipos sin privilegios. */
export function groupPrivileges(privileges: readonly PrivilegeView[]): PrivilegeGroup[] {
  return TYPE_ORDER.map((type) => {
    const modules = new Map<string, PrivilegeView[]>();
    for (const privilege of privileges) {
      if (privilege.type !== type) {
        continue;
      }
      const list = modules.get(privilege.module) ?? [];
      list.push(privilege);
      modules.set(privilege.module, list);
    }
    return {
      type,
      modules: [...modules].map(([name, items]) => ({ name, privileges: items })),
    };
  }).filter((group) => group.modules.length > 0);
}

/**
 * Privilegios de un rol con casillas, agrupados por tipo y módulo. Solo se ofrecen los activos;
 * los que el rol ya tiene se conservan aunque estén inactivos.
 */
@Component({
  selector: 'app-role-privileges',
  imports: [ProblemAlertComponent, TranslatePipe],
  templateUrl: './role-privileges.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolePrivilegesComponent implements OnInit {
  private readonly rolesApi = inject(RolesApi);
  private readonly privilegesApi = inject(PrivilegesApi);
  private readonly modal = inject(NgbModal);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Rol al que se asignan los privilegios; lo asigna quien abre el diálogo antes de mostrarlo. */
  role!: RoleView;

  protected readonly groups = signal<readonly PrivilegeGroup[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<unknown>(null);

  protected readonly checkedValue = checkedValue;

  ngOnInit(): void {
    forkJoin({
      all: this.privilegesApi.list(),
      current: this.rolesApi.privileges(this.role.id),
    }).subscribe({
      next: ({ all, current }) => {
        this.groups.set(groupPrivileges(all.filter((privilege) => privilege.active)));
        this.selected.set(new Set(current.map((privilege) => privilege.code)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected isSelected(code: string): boolean {
    return this.selected().has(code);
  }

  protected toggle(code: string, checked: boolean): void {
    this.selected.update((codes) => {
      const next = new Set(codes);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  /** Los privilegios cambian a todos los usuarios del rol, así que se pide confirmación antes. */
  protected save(): void {
    openConfirmDialog(this.modal, {
      titleKey: 'admin.roles.privileges.confirmTitle',
      messageKey: 'admin.roles.privileges.confirmMessage',
      messageParams: { name: this.role.name },
      confirmKey: 'common.save',
    }).then((confirmed) => {
      if (confirmed) {
        this.saveConfirmed();
      }
    });
  }

  private saveConfirmed(): void {
    this.submitting.set(true);
    this.saveError.set(null);
    this.rolesApi.replacePrivileges(this.role.id, [...this.selected()]).subscribe({
      next: () => this.activeModal.close(true),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.saveError.set(error);
      },
    });
  }
}
