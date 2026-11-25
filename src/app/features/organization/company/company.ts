import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CompanyApi, CompanyRequest } from '../../../core/api/company-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { blankToNull } from '../../../shared/forms/form-values';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Datos fiscales de la empresa: un solo formulario. Mientras no hay empresa, la API responde 404
 * y el formulario se muestra vacío. Solo la central la guarda; en una tienda se ve de solo lectura.
 */
@Component({
  selector: 'app-company',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldErrorComponent, IfPrivilegeDirective, TranslatePipe],
  templateUrl: './company.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyComponent implements OnInit {
  private readonly api = inject(CompanyApi);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Solo la central escribe: en una tienda el formulario queda de solo lectura. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;
  protected readonly loading = signal(true);
  protected readonly configured = signal(false);
  protected readonly loadError = signal<unknown>(null);
  protected readonly saveError = signal<unknown>(null);
  protected readonly submitting = signal(false);
  protected readonly saved = signal(false);
  protected readonly isInvalid = isInvalidControl;

  protected readonly form = this.fb.group({
    legalName: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    tradeName: this.fb.control('', [Validators.maxLength(200)]),
    taxId: this.fb.control('', [Validators.required, Validators.maxLength(14)]),
    address: this.fb.control('', [Validators.maxLength(300)]),
    phone: this.fb.control('', [Validators.maxLength(20)]),
    email: this.fb.control('', [Validators.email, Validators.maxLength(150)]),
    currency: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]),
    timeZone: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
  });

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (company) => {
        this.configured.set(true);
        this.form.patchValue({
          legalName: company.legalName,
          tradeName: company.tradeName ?? '',
          taxId: company.taxId,
          address: company.address ?? '',
          phone: company.phone ?? '',
          email: company.email ?? '',
          currency: company.currency,
          timeZone: company.timeZone,
        });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        // 404: la empresa todavía no está configurada. Es un estado normal, no un error.
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.configured.set(false);
          return;
        }
        this.loadError.set(error);
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: CompanyRequest = {
      legalName: value.legalName.trim(),
      tradeName: blankToNull(value.tradeName),
      taxId: value.taxId.trim(),
      address: blankToNull(value.address),
      phone: blankToNull(value.phone),
      email: blankToNull(value.email),
      currency: value.currency,
      timeZone: value.timeZone.trim(),
    };

    this.submitting.set(true);
    this.saveError.set(null);
    this.saved.set(false);
    this.api.configure(body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.configured.set(true);
        this.saved.set(true);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.saveError.set(error);
      },
    });
  }
}
