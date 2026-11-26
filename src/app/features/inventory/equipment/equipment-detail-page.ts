import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AttributeValues, AttributeView } from '../../../core/api/categories-api';
import { EquipmentApi, EquipmentDetailView, EquipmentUpdateRequest } from '../../../core/api/equipment-api';
import { SerialMovementView, SerialStatus } from '../../../core/api/serials-api';
import { EquipmentAttributeFieldComponent } from '../../../shared/components/equipment-attribute-field/equipment-attribute-field';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { blankToNull } from '../../../shared/forms/form-values';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { attributeIssues, attributeTexts, attributeValues } from '../shared/equipment-attributes';
import { movementReferenceLink } from '../shared/movement-link';

/** Destino del botón "Volver": el listado de equipos con los filtros con que llegó el usuario. */
const LIST_URL = /^\/inventory\/equipment(\?|$)/;

/** Clase del badge de cada estado del equipo. */
const STATUS_CLASS: Readonly<Record<SerialStatus, string>> = {
  AVAILABLE: 'text-bg-success',
  SOLD: 'text-bg-secondary',
  IN_TRANSIT: 'text-bg-info',
  REMOVED: 'text-bg-dark',
};

/** Número de id de la ruta, o null si no es un id válido. */
function routeId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Una característica para mostrar: nombre de la plantilla y su texto en el equipo. */
interface CharacteristicView {
  readonly id: number;
  readonly name: string;
  readonly text: string;
}

/** Valores de una característica que el equipo ya tiene y que la plantilla desactivó: no se editan, pero se conservan. */
function keptValues(values: AttributeValues, activeCodes: ReadonlySet<string>): Record<string, string | number> {
  const kept: Record<string, string | number> = {};
  for (const [code, value] of Object.entries(values)) {
    if (!activeCodes.has(code)) {
      kept[code] = value;
    }
  }
  return kept;
}

/**
 * Detalle de un equipo: su serie, código externo, estado, sucursal y fechas; sus características con el nombre
 * de la plantilla; la venta, si la hay, y la bitácora. Quien tiene el privilegio de corrección edita el código
 * externo y las características en línea, con los mismos campos que la carga. Las características desactivadas
 * que el equipo ya tiene se muestran y se conservan, sin editarse.
 */
@Component({
  selector: 'app-equipment-detail-page',
  imports: [
    RouterLink,
    EquipmentAttributeFieldComponent,
    FieldLabelComponent,
    ProblemAlertComponent,
    IfPrivilegeDirective,
    LocalDateTimePipe,
    TranslatePipe,
  ],
  templateUrl: './equipment-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentDetailPageComponent implements OnInit {
  private readonly api = inject(EquipmentApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly equipmentId = routeId(this.route.snapshot.paramMap.get('id'));
  protected readonly backUrl = this.listUrlFromState();

  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly equipment = signal<EquipmentDetailView | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<unknown>(null);
  /** Valores en edición: código externo y texto de cada característica activa. */
  protected readonly draftCode = signal('');
  protected readonly draftTexts = signal<Readonly<Record<string, string>>>({});

  /** Características activas de la plantilla: las que se editan. */
  protected readonly activeDefinitions = computed<readonly AttributeView[]>(
    () => (this.equipment()?.attributeDefinitions ?? []).filter((attribute) => attribute.active),
  );

  /** Errores de las características en edición, por código. Un mapa vacío si todas son válidas. */
  protected readonly draftIssues = computed(() => attributeIssues(this.activeDefinitions(), this.draftTexts()));
  protected readonly canSave = computed(() => Object.keys(this.draftIssues()).length === 0);

  /** Características para mostrar: las activas y las desactivadas que el equipo todavía tiene. */
  protected readonly characteristics = computed<readonly CharacteristicView[]>(() => {
    const current = this.equipment();
    if (current === null) {
      return [];
    }
    const texts = attributeTexts(current.attributeDefinitions, current.attributes);
    return current.attributeDefinitions
      .filter((attribute) => attribute.active || texts[attribute.code] !== '')
      .map((attribute) => ({ id: attribute.id, name: attribute.name, text: texts[attribute.code] }));
  });

  /** El movimiento de venta del equipo, si lo tiene: el enlace de la venta sale de aquí. */
  protected readonly saleMovement = computed<SerialMovementView | null>(
    () => this.equipment()?.movements.find((movement) => movement.type === 'SALE_OUT') ?? null,
  );

  ngOnInit(): void {
    if (this.equipmentId === null) {
      this.loading.set(false);
      return;
    }
    this.load();
  }

  protected startEdit(): void {
    const current = this.equipment();
    if (current === null) {
      return;
    }
    this.draftCode.set(current.externalCode ?? '');
    this.draftTexts.set(attributeTexts(this.activeDefinitions(), current.attributes));
    this.notice.set(null);
    this.saveError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.saveError.set(null);
  }

  protected setDraftCode(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.draftCode.set(input.value);
    }
  }

  protected setDraftText(code: string, text: string): void {
    this.draftTexts.update((current) => ({ ...current, [code]: text }));
  }

  protected draftText(code: string): string {
    return this.draftTexts()[code] ?? '';
  }

  /** Clave de traducción del error de una característica en edición, o null. */
  protected issueKey(code: string): string | null {
    return this.draftIssues()[code] ?? null;
  }

  protected statusClass(status: SerialStatus): string {
    return STATUS_CLASS[status];
  }

  /**
   * Guarda el código externo y las características. Las características desactivadas que el equipo ya tiene
   * se envían tal como estaban, así la corrección no las borra.
   */
  protected save(): void {
    const current = this.equipment();
    if (current === null || !this.canSave() || this.saving()) {
      return;
    }
    const activeCodes = new Set(this.activeDefinitions().map((attribute) => attribute.code));
    const body: EquipmentUpdateRequest = {
      externalCode: blankToNull(this.draftCode()),
      attributes: {
        ...keptValues(current.attributes, activeCodes),
        ...attributeValues(this.activeDefinitions(), this.draftTexts()),
      },
    };
    this.saving.set(true);
    this.saveError.set(null);
    this.api.update(current.id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.notice.set('inventory.equipment.detail.saved');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(error);
      },
    });
  }

  protected linkOf(movement: SerialMovementView): readonly string[] | null {
    return movementReferenceLink(movement.referenceType, movement.referenceId);
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  private load(): void {
    const id = this.equipmentId;
    if (id === null) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.api.get(id).subscribe({
      next: (equipment) => {
        this.equipment.set(equipment);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  /** Vuelve al listado de equipos con los filtros con que llegó el usuario, o al listado sin ellos. */
  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/inventory/equipment';
  }
}
