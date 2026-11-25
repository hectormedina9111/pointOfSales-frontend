import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/**
 * Pantalla provisional de las rutas del menú que aún no existen. Su código del menú llega
 * en data.menuCode de la ruta; el título sale de "menu.<CODE>".
 */
@Component({
  selector: 'app-placeholder',
  imports: [TranslatePipe],
  templateUrl: './placeholder.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  protected readonly titleKey = `menu.${String(inject(ActivatedRoute).snapshot.data['menuCode'])}`;
}
