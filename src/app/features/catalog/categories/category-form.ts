import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { CategoriesApi, CategoryRequest, CategoryView } from '../../../core/api/categories-api';
import { listAllPages } from '../../../core/api/page';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TreeRow, descendantIds, flattenTree, indentLabel } from '../../../shared/tree/tree';

/**
 * Alta y edición de categoría. El padre no puede ser la propia categoría ni una de sus
 * subcategorías, así que esas opciones no aparecen. Cierra el diálogo con la categoría guardada.
 */
@Component({
  selector: 'app-category-form',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, TranslatePipe],
  templateUrl: './category-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormComponent implements OnInit {
  private readonly api = inject(CategoriesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Categoría a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  category: CategoryView | null = null;

  protected readonly categories = signal<readonly CategoryView[]>([]);
  protected readonly lookupsLoading = signal(true);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;

  /** Opciones del padre: el árbol sin la propia categoría ni sus descendientes. */
  protected readonly parentOptions = computed<readonly TreeRow<CategoryView>[]>(() => {
    const current = this.category;
    const all = this.categories();
    if (current === null) {
      return flattenTree(all, (c) => c.id, (c) => c.parentId);
    }
    const excluded = descendantIds(all, (c) => c.id, (c) => c.parentId, current.id);
    return flattenTree(all, (c) => c.id, (c) => c.parentId)
      .filter((row) => row.item.id !== current.id && !excluded.has(row.item.id));
  });

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    parentId: this.fb.control<number | null>(null),
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    const category = this.category;
    if (category !== null) {
      this.form.patchValue({ name: category.name, parentId: category.parentId, active: category.active });
    }
    listAllPages((request) => this.api.list(request), 'name').subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.lookupsLoading.set(false);
      },
      error: (error: unknown) => {
        this.lookupError.set(error);
        this.lookupsLoading.set(false);
      },
    });
  }

  /** Sangría de una opción del padre: un guion por nivel. */
  protected indent(row: TreeRow<CategoryView>): string {
    return indentLabel(row.level);
  }

  /** Muestra el padre aunque esté inactivo, para no perder la relación al editar. */
  protected isSelectable(row: TreeRow<CategoryView>): boolean {
    return row.item.active || row.item.id === this.form.getRawValue().parentId;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: CategoryRequest = {
      name: value.name.trim(),
      parentId: value.parentId,
      active: value.active,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.category === null
      ? this.api.create(body)
      : this.api.update(this.category.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }
}
