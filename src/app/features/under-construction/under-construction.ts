import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/**
 * Página para las rutas del menú que todavía no tienen pantalla y para cualquier dirección que no
 * exista (route data variant "notFound"). Se reemplaza por la pantalla real en su etapa.
 */
@Component({
  selector: 'app-under-construction',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './under-construction.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnderConstructionComponent {
  protected readonly notFound = inject(ActivatedRoute).snapshot.data['variant'] === 'notFound';
}
