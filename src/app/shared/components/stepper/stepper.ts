import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  contentChildren,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { merge } from 'rxjs';

import { TranslatePipe } from '../../pipes/translate.pipe';

/** Estado de un paso en la cabecera: ya completado, el actual o pendiente. */
export type StepState = 'done' | 'current' | 'pending';

/**
 * Asistente por pasos con Bootstrap. Cada <app-step> recibe su etiqueta y los controles que debe
 * validar; el asistente no avanza mientras el paso actual tiene errores, marca sus campos y lleva
 * el foco al primero con error. El último paso es el resumen y muestra el botón de guardar.
 * Los pasos ya completados se pueden volver a abrir desde la cabecera. Intro en un campo avanza
 * al paso siguiente y nunca envía el formulario. Va dentro de un <form> si el padre lo necesita.
 */
@Component({
  selector: 'app-stepper',
  imports: [TranslatePipe],
  templateUrl: './stepper.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepperComponent {
  private readonly injector = inject(Injector);

  /** Mientras se guarda, el botón del último paso se deshabilita. */
  readonly saving = input(false);
  /** Clave de traducción del botón de guardar del último paso. */
  readonly saveLabelKey = input('common.save');

  /** Se emite al guardar, solo si todos los pasos son válidos. */
  readonly finish = output<void>();
  /** Se emite al cancelar desde el botón de la barra. */
  readonly cancel = output<void>();

  readonly steps = contentChildren(StepComponent, { descendants: true });
  readonly current = signal(0);
  readonly isLast = computed(() => this.current() === this.steps().length - 1);
  readonly currentValid = computed(() => this.steps()[this.current()]?.valid() ?? false);
  /** Cuántas veces se intentó avanzar con errores en el paso actual. Se reinicia al cambiar de paso. */
  readonly invalidAttempts = signal(0);

  protected stateOf(index: number): StepState {
    const current = this.current();
    if (index < current) {
      return 'done';
    }
    return index === current ? 'current' : 'pending';
  }

  next(): void {
    const step = this.steps()[this.current()];
    if (!step) {
      return;
    }
    if (!step.valid()) {
      this.reportInvalid(step);
      return;
    }
    this.show(this.current() + 1);
  }

  back(): void {
    if (this.current() > 0) {
      this.show(this.current() - 1);
    }
  }

  /** Vuelve a un paso anterior desde la cabecera. No deja saltar hacia adelante. */
  goTo(index: number): void {
    if (index < this.current()) {
      this.show(index);
    }
  }

  /** Guarda solo si todos los pasos son válidos; si no, lleva al primero con errores. */
  save(): void {
    const invalidIndex = this.steps().findIndex((step) => !step.valid());
    if (invalidIndex >= 0) {
      const step = this.steps()[invalidIndex];
      this.show(invalidIndex);
      this.reportInvalid(step);
      return;
    }
    this.finish.emit();
  }

  /** Intro en un campo de texto avanza al siguiente paso. Nunca envía el formulario desde un campo. */
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.key !== 'Enter' || event.isComposing || !(target instanceof HTMLInputElement)) {
      return;
    }
    if (['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type)) {
      return;
    }
    event.preventDefault();
    if (!this.isLast()) {
      this.next();
    }
  }

  private show(index: number): void {
    this.current.set(index);
    this.invalidAttempts.set(0);
    afterNextRender(() => this.steps()[index]?.focusHeading(), { injector: this.injector });
  }

  private reportInvalid(step: StepComponent): void {
    step.markTouched();
    // update() siempre cambia la señal, así que la vista se vuelve a pintar aunque ya hubiera un intento.
    this.invalidAttempts.update((count) => count + 1);
    afterNextRender(() => step.focusFirstInvalid(), { injector: this.injector });
  }
}

/**
 * Un paso del asistente. Sus controles deben ser siempre los mismos durante la vida del paso.
 * Solo se muestra el paso actual; el contenido se proyecta con <ng-content>.
 */
@Component({
  selector: 'app-step',
  imports: [TranslatePipe],
  templateUrl: './step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepComponent implements OnInit {
  private readonly stepper = inject(StepperComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  /** Se incrementa con cada cambio de estado de los controles; así valid se recalcula sin escribir durante la detección de cambios. */
  private readonly statusVersion = signal(0);

  /** Clave de traducción del título del paso (cabecera y encabezado del paso). */
  readonly labelKey = input.required<string>();
  /** Controles que el paso debe tener válidos para avanzar. */
  readonly controls = input<readonly AbstractControl[]>([]);

  protected readonly index = computed(() => this.stepper.steps().indexOf(this));
  protected readonly active = computed(() => this.index() === this.stepper.current());
  readonly valid = computed(() => {
    this.statusVersion();
    return this.controls().every((control) => !control.invalid);
  });

  ngOnInit(): void {
    merge(...this.controls().map((control) => control.statusChanges))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.statusVersion.update((version) => version + 1));
  }

  /** Marca los controles del paso como tocados para que muestren sus errores. */
  markTouched(): void {
    this.controls().forEach((control) => control.markAsTouched());
  }

  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }

  focusFirstInvalid(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.is-invalid')?.focus();
  }
}
