import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';

import { BranchView, BranchesApi } from '../../../core/api/branches-api';
import { UserView, UsersApi } from '../../../core/api/users-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { checkedValue } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Número máximo de sucursales que se piden para el diálogo (una sola página). */
const BRANCH_LIMIT = 200;

/**
 * Sucursales a las que puede entrar un usuario. Solo aparecen las que ve quien administra
 * (el backend filtra por sus propias sucursales), así que la lista puede estar vacía.
 */
@Component({
  selector: 'app-user-branches',
  imports: [ProblemAlertComponent, TranslatePipe],
  templateUrl: './user-branches.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserBranchesComponent implements OnInit {
  private readonly usersApi = inject(UsersApi);
  private readonly branchesApi = inject(BranchesApi);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Usuario al que se asignan las sucursales; lo asigna quien abre el diálogo antes de mostrarlo. */
  user!: UserView;

  protected readonly branches = signal<readonly BranchView[]>([]);
  protected readonly selected = signal<readonly number[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly saveError = signal<unknown>(null);

  protected readonly checkedValue = checkedValue;

  ngOnInit(): void {
    forkJoin({
      branches: this.branchesApi.list({ page: 0, size: BRANCH_LIMIT, sort: 'code' }),
      selected: this.usersApi.branchIds(this.user.id),
    }).subscribe({
      next: ({ branches, selected }) => {
        this.branches.set(branches.content);
        this.selected.set(selected);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: number, checked: boolean): void {
    this.selected.update((ids) => {
      const others = ids.filter((current) => current !== id);
      return checked ? [...others, id] : others;
    });
  }

  protected save(): void {
    this.submitting.set(true);
    this.saveError.set(null);
    this.usersApi.replaceBranches(this.user.id, this.selected()).subscribe({
      next: () => this.activeModal.close(true),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.saveError.set(error);
      },
    });
  }
}
