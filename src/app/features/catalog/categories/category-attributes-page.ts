import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import {
  AttributeDataType,
  AttributeRequest,
  AttributeView,
  CategoriesApi,
  CategoryView,
} from '../../../core/api/categories-api';
import { listAllPages } from '../../../core/api/page';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Largo máximo del código y del nombre de una característica. */
const CODE_MAX = 50;
const NAME_MAX = 100;

const DATA_TYPES: readonly AttributeDataType[] = ['TEXT', 'NUMBER', 'DATE', 'LIST'];

/** Valores del formulario de una característica, antes de convertirlos al cuerpo de la API. */
interface AttributeFormValue {
  readonly code: string;
  readonly name: string;
  readonly dataType: AttributeDataType;
  readonly options: string;
  readonly required: boolean;
  readonly sortOrder: number | null;
  readonly active: boolean;
}

const EMPTY_FORM: AttributeFormValue = {
  code: '',
  name: '',
  dataType: 'TEXT',
  options: '',
  required: false,
  sortOrder: 0,
  active: true,
};

/** Id de la URL; null si no es un id válido. */
function routeId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Opciones de una lista: separadas por comas, sin espacios sobrantes ni vacías. */
export function parseOptions(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

/**
 * Características de los equipos de una categoría. La edición es en línea: una fila de la tabla se
 * convierte en el formulario, sin diálogo. El código se fija al guardar. Las opciones solo se piden
 * en tipo lista. Solo la central escribe; la tienda ve las características replicadas.
 */
@Component({
  selector: 'app-category-attributes-page',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    FieldLabelComponent,
    FieldErrorComponent,
    ProblemAlertComponent,
    IfPrivilegeDirective,
    TranslatePipe,
  ],
  templateUrl: './category-attributes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryAttributesPageComponent implements OnInit {
  private readonly api = inject(CategoriesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly route = inject(ActivatedRoute);

  /** Solo la central escribe: en una tienda no aparece ningún botón de cambio. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly isInvalid = isInvalidControl;
  protected readonly dataTypes = DATA_TYPES;

  protected readonly categoryId = routeId(this.route.snapshot.paramMap.get('id'));
  protected readonly category = signal<CategoryView | null>(null);
  protected readonly attributes = signal<readonly AttributeView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly saveError = signal<unknown>(null);
  /** Clave de traducción de un aviso del formulario (por ejemplo, lista sin opciones), o null. */
  protected readonly formMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly submitting = signal(false);
  /** null: sin edición. id null: alta de una característica nueva. id con número: edición de esa característica. */
  protected readonly editing = signal<{ readonly id: number | null } | null>(null);

  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.maxLength(CODE_MAX)]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(NAME_MAX)]),
    dataType: this.fb.control<AttributeDataType>('TEXT', [Validators.required]),
    options: this.fb.control(''),
    required: this.fb.control(false),
    sortOrder: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    active: this.fb.control(true),
  });

  /** Tipo elegido en la fila: las opciones solo se muestran en tipo lista. */
  private readonly dataType = toSignal(this.form.controls.dataType.valueChanges, {
    initialValue: 'TEXT' as AttributeDataType,
  });
  protected readonly isList = computed(() => this.dataType() === 'LIST');

  ngOnInit(): void {
    const id = this.categoryId;
    if (id === null) {
      this.loading.set(false);
      return;
    }
    listAllPages((request) => this.api.list(request), 'name').subscribe({
      next: (categories) => this.category.set(categories.find((category) => category.id === id) ?? null),
      error: () => undefined,
    });
    this.load();
  }

  protected optionsText(attribute: AttributeView): string {
    return attribute.options === null ? '—' : attribute.options.join(', ');
  }

  protected startNew(): void {
    this.form.reset(EMPTY_FORM);
    this.form.controls.code.enable();
    this.openEditor(null);
  }

  protected startEdit(attribute: AttributeView): void {
    this.form.reset({
      code: attribute.code,
      name: attribute.name,
      dataType: attribute.dataType,
      options: (attribute.options ?? []).join(', '),
      required: attribute.required,
      sortOrder: attribute.sortOrder,
      active: attribute.active,
    });
    // El código no cambia después de creada la característica: el control queda de solo lectura.
    this.form.controls.code.disable();
    this.openEditor(attribute.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.formMessage.set(null);
    this.saveError.set(null);
    this.form.controls.code.enable();
  }

  protected save(): void {
    const categoryId = this.categoryId;
    const editing = this.editing();
    if (categoryId === null || editing === null) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const options = value.dataType === 'LIST' ? parseOptions(value.options) : [];
    if (value.dataType === 'LIST' && options.length === 0) {
      this.formMessage.set('catalog.attributes.optionsRequired');
      return;
    }
    const body: AttributeRequest = {
      code: value.code.trim(),
      name: value.name.trim(),
      dataType: value.dataType,
      options: value.dataType === 'LIST' ? options : null,
      required: value.required,
      sortOrder: value.sortOrder ?? 0,
      active: value.active,
    };

    this.submitting.set(true);
    this.saveError.set(null);
    const request = editing.id === null
      ? this.api.createAttribute(categoryId, body)
      : this.api.updateAttribute(categoryId, editing.id, body);

    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.cancelEdit();
        this.notice.set('catalog.attributes.saved');
        this.load();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.saveError.set(error);
      },
    });
  }

  /** Desactiva la característica (no la borra), previa confirmación. */
  protected async deactivate(attribute: AttributeView): Promise<void> {
    const categoryId = this.categoryId;
    if (categoryId === null) {
      return;
    }
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'catalog.attributes.deactivate.title',
      messageKey: 'catalog.attributes.deactivate.message',
      messageParams: { name: attribute.name },
      confirmKey: 'common.deactivate',
    });
    if (!confirmed) {
      return;
    }
    this.api.deactivateAttribute(categoryId, attribute.id).subscribe({
      next: () => {
        this.notice.set('catalog.attributes.deactivated');
        this.load();
      },
      error: (error: unknown) => this.loadError.set(error),
    });
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private openEditor(id: number | null): void {
    this.editing.set({ id });
    this.formMessage.set(null);
    this.saveError.set(null);
    this.notice.set(null);
  }

  private load(): void {
    const id = this.categoryId;
    if (id === null) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.api.attributes(id).subscribe({
      next: (attributes) => {
        this.attributes.set(attributes);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }
}
