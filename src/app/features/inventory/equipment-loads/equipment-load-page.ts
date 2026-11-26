import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { EquipmentApi } from '../../../core/api/equipment-api';
import { ProductsApi } from '../../../core/api/products-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { idOf } from '../shared/inventory-query';
import { EquipmentLoadStore } from './equipment-load.store';
import { LoadEquipmentStepComponent } from './load-equipment-step';
import { LoadHeaderStepComponent } from './load-header-step';
import { LoadSummaryStepComponent } from './load-summary-step';

/**
 * Carga de equipos, en tres pasos: encabezado (sucursal, producto, costo), equipos y resumen. Registrar
 * crea la entrada de inventario con todas las unidades y abre su documento. Se puede llegar con
 * ?productId= (desde la entrada general de un producto con serie).
 */
@Component({
  selector: 'app-equipment-load-page',
  imports: [
    ProblemAlertComponent,
    StepperComponent,
    StepComponent,
    LoadHeaderStepComponent,
    LoadEquipmentStepComponent,
    LoadSummaryStepComponent,
    TranslatePipe,
  ],
  templateUrl: './equipment-load-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EquipmentLoadStore],
})
export class EquipmentLoadPageComponent implements OnInit {
  private readonly api = inject(EquipmentApi);
  private readonly products = inject(ProductsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(EquipmentLoadStore);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<unknown>(null);
  /** Aviso de la llegada con ?productId= (clave de traducción), o null. */
  protected readonly notice = signal<string | null>(null);
  protected readonly prefillError = signal<unknown>(null);

  protected readonly headerControls: readonly AbstractControl[] = this.store.headerControls;
  protected readonly lineControls: readonly AbstractControl[] = [this.store.lineControl];
  /** El resumen no tiene campos propios. */
  protected readonly noControls: readonly AbstractControl[] = [];

  ngOnInit(): void {
    const productId = idOf(this.route.snapshot.queryParamMap.get('productId'));
    if (productId === '') {
      return;
    }
    this.products.get(Number(productId)).subscribe({
      next: (product) => this.notice.set(this.store.chooseProduct(product)),
      error: (error: unknown) => this.prefillError.set(error),
    });
  }

  protected save(): void {
    const body = this.store.buildRequest();
    if (body === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.createLoad(body).subscribe({
      next: (document) => void this.router.navigate(['/inventory/documents', document.id]),
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(error);
      },
    });
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/inventory/equipment');
  }
}
