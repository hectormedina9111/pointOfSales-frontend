import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import {
  CustomerDocumentType,
  CustomerRequest,
  CustomerType,
  CustomerView,
  CustomersApi,
} from '../../../core/api/customers-api';
import { listAllPages } from '../../../core/api/page';
import { PriceListView, PriceListsApi } from '../../../core/api/price-lists-api';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { StepComponent, StepperComponent } from '../../../shared/components/stepper/stepper';
import { blankToNull } from '../../../shared/forms/form-values';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Fila del resumen del último paso: etiqueta (clave de traducción) y valor ya en texto. */
interface SummaryRow {
  readonly labelKey: string;
  readonly value: string;
}

/** Largo máximo del número de documento, igual que en el backend. */
const DOCUMENT_NUMBER_MAX = 20;

/**
 * Alta y edición de cliente, en un asistente de cuatro pasos y un resumen. Reutilizable: también
 * se abre desde el punto de venta para dar de alta un cliente rápido. Según el tipo, un cliente
 * persona pide nombres y un cliente empresa, razón social. Un documento NONE no lleva número. Cierra
 * el diálogo con el cliente guardado.
 */
@Component({
  selector: 'app-customer-form',
  imports: [
    ReactiveFormsModule,
    ProblemAlertComponent,
    FieldErrorComponent,
    FieldLabelComponent,
    StepperComponent,
    StepComponent,
    TranslatePipe,
  ],
  templateUrl: './customer-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFormComponent implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly priceListsApi = inject(PriceListsApi);
  private readonly translation = inject(TranslationService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly activeModal = inject(NgbActiveModal);

  /** Cliente a editar, o null para dar de alta. Lo asigna quien abre el diálogo antes de mostrarlo. */
  customer: CustomerView | null = null;

  protected readonly priceLists = signal<readonly PriceListView[]>([]);
  protected readonly lookupError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly isInvalid = isInvalidControl;
  protected readonly customerTypes: readonly CustomerType[] = ['PERSON', 'COMPANY'];
  protected readonly documentTypes: readonly CustomerDocumentType[] = ['RTN', 'DNI', 'PASSPORT', 'NONE'];

  protected readonly form = this.fb.group({
    customerType: this.fb.control<CustomerType>('PERSON', [Validators.required]),
    documentType: this.fb.control<CustomerDocumentType | null>(null, [Validators.required]),
    documentNumber: this.fb.control('', [Validators.maxLength(DOCUMENT_NUMBER_MAX)]),
    firstName: this.fb.control(''),
    middleName: this.fb.control('', [Validators.maxLength(60)]),
    lastName: this.fb.control(''),
    secondLastName: this.fb.control('', [Validators.maxLength(60)]),
    businessName: this.fb.control('', [Validators.maxLength(200)]),
    phone: this.fb.control('', [Validators.maxLength(20)]),
    email: this.fb.control('', [Validators.email, Validators.maxLength(150)]),
    address: this.fb.control('', [Validators.maxLength(300)]),
    externalCode: this.fb.control('', [Validators.maxLength(50)]),
    priceListId: this.fb.control<number | null>(null),
  });

  /** Controles de cada paso: el asistente no avanza mientras alguno tenga error. */
  protected readonly typeControls: readonly AbstractControl[] = [
    this.form.controls.customerType,
    this.form.controls.documentType,
    this.form.controls.documentNumber,
  ];
  protected readonly nameControls: readonly AbstractControl[] = [
    this.form.controls.firstName,
    this.form.controls.middleName,
    this.form.controls.lastName,
    this.form.controls.secondLastName,
    this.form.controls.businessName,
  ];
  protected readonly contactControls: readonly AbstractControl[] = [
    this.form.controls.phone,
    this.form.controls.email,
    this.form.controls.address,
  ];
  protected readonly commercialControls: readonly AbstractControl[] = [
    this.form.controls.externalCode,
    this.form.controls.priceListId,
  ];
  /** El resumen no tiene campos propios. */
  protected readonly noControls: readonly AbstractControl[] = [];

  constructor() {
    this.form.controls.customerType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyRules());
    this.form.controls.documentType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyRules());
  }

  ngOnInit(): void {
    this.fillForm();
    this.applyRules();
    listAllPages((request) => this.priceListsApi.list(request), 'code').subscribe({
      next: (lists) => this.priceLists.set(lists),
      error: (error: unknown) => this.lookupError.set(error),
    });
  }

  /** Listas activas, más la del cliente aunque esté inactiva. */
  protected priceListOptions(): readonly PriceListView[] {
    const current = this.form.getRawValue().priceListId;
    return this.priceLists().filter((list) => list.active || list.id === current);
  }

  /** Filas del resumen del último paso, con los valores actuales del formulario. */
  protected summaryRows(): readonly SummaryRow[] {
    const raw = this.form.getRawValue();
    const none = this.t('common.none');
    const text = (value: string): string => (value.trim() === '' ? none : value.trim());
    const isPerson = raw.customerType === 'PERSON';
    const documentNumber = raw.documentType === 'NONE' ? none : text(raw.documentNumber);
    const priceList = this.priceLists().find((list) => list.id === raw.priceListId);

    return [
      { labelKey: 'customers.field.customerType', value: this.t(`customers.customerType.${raw.customerType}`) },
      {
        labelKey: 'customers.field.documentType',
        value: raw.documentType === null ? none : this.t(`customers.documentType.${raw.documentType}`),
      },
      { labelKey: 'customers.field.documentNumber', value: documentNumber },
      ...(isPerson
        ? [
            { labelKey: 'customers.field.firstName', value: text(raw.firstName) },
            { labelKey: 'customers.field.middleName', value: text(raw.middleName) },
            { labelKey: 'customers.field.lastName', value: text(raw.lastName) },
            { labelKey: 'customers.field.secondLastName', value: text(raw.secondLastName) },
          ]
        : [{ labelKey: 'customers.field.businessName', value: text(raw.businessName) }]),
      { labelKey: 'customers.field.phone', value: text(raw.phone) },
      { labelKey: 'customers.field.email', value: text(raw.email) },
      { labelKey: 'customers.field.address', value: text(raw.address) },
      { labelKey: 'customers.field.externalCode', value: text(raw.externalCode) },
      {
        labelKey: 'customers.field.priceList',
        value: priceList ? `${priceList.code} - ${priceList.name}` : none,
      },
    ];
  }

  protected t(key: string): string {
    return this.translation.translate(key);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.documentType === null) {
      return;
    }
    // Los campos de la otra clase de cliente se envían vacíos, aunque el usuario los haya escrito antes.
    const isPerson = value.customerType === 'PERSON';
    const body: CustomerRequest = {
      externalCode: blankToNull(value.externalCode),
      customerType: value.customerType,
      documentType: value.documentType,
      documentNumber: value.documentType === 'NONE' ? null : blankToNull(value.documentNumber),
      firstName: isPerson ? blankToNull(value.firstName) : null,
      middleName: isPerson ? blankToNull(value.middleName) : null,
      lastName: isPerson ? blankToNull(value.lastName) : null,
      secondLastName: isPerson ? blankToNull(value.secondLastName) : null,
      businessName: isPerson ? null : blankToNull(value.businessName),
      phone: blankToNull(value.phone),
      email: blankToNull(value.email),
      address: blankToNull(value.address),
      priceListId: value.priceListId,
    };

    this.submitting.set(true);
    this.error.set(null);
    const request = this.customer === null
      ? this.api.create(body)
      : this.api.update(this.customer.id, body);

    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(error);
      },
    });
  }

  /**
   * Aplica las reglas que dependen del tipo de cliente y del tipo de documento. Cambia validadores
   * y no valores: los campos ocultos se vacían al guardar, no aquí.
   */
  private applyRules(): void {
    const raw = this.form.getRawValue();
    const controls = this.form.controls;
    const isPerson = raw.customerType === 'PERSON';
    const documentRequired = raw.documentType !== 'NONE';

    setRules(controls.documentNumber, [
      ...(documentRequired ? [Validators.required] : []),
      Validators.maxLength(DOCUMENT_NUMBER_MAX),
    ]);
    setRules(controls.firstName, isPerson ? [Validators.required, Validators.maxLength(60)] : []);
    setRules(controls.middleName, isPerson ? [Validators.maxLength(60)] : []);
    setRules(controls.lastName, isPerson ? [Validators.required, Validators.maxLength(60)] : []);
    setRules(controls.secondLastName, isPerson ? [Validators.maxLength(60)] : []);
    setRules(controls.businessName, isPerson ? [] : [Validators.required, Validators.maxLength(200)]);
  }

  private fillForm(): void {
    const customer = this.customer;
    if (customer !== null) {
      this.form.patchValue({
        customerType: customer.customerType,
        documentType: customer.documentType,
        documentNumber: customer.documentNumber ?? '',
        firstName: customer.firstName ?? '',
        middleName: customer.middleName ?? '',
        lastName: customer.lastName ?? '',
        secondLastName: customer.secondLastName ?? '',
        businessName: customer.businessName ?? '',
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        address: customer.address ?? '',
        externalCode: customer.externalCode ?? '',
        priceListId: customer.priceListId,
      });
    }
  }
}

/** Cambia los validadores de un control y recalcula su estado para que el paso lo vea. */
function setRules(control: AbstractControl, validators: readonly ValidatorFn[]): void {
  control.setValidators([...validators]);
  control.updateValueAndValidity();
}
