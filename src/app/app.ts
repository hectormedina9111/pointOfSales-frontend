import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbOffcanvas,
  NgbOffcanvasRef,
} from '@ng-bootstrap/ng-bootstrap';
import { filter } from 'rxjs';

import { AuthService } from './core/auth/auth.service';
import { LANGUAGES, Language, LanguageService } from './core/i18n/language.service';
import { TranslationService } from './core/i18n/translation.service';
import { SystemInfoService } from './core/system/system-info.service';
import { AppSidebarComponent } from './shared/components/app-sidebar/app-sidebar';
import { TranslatePipe } from './shared/pipes/translate.pipe';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
    AppSidebarComponent,
    TranslatePipe,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly translation = inject(TranslationService);
  private readonly offcanvas = inject(NgbOffcanvas);

  protected readonly auth = inject(AuthService);
  protected readonly nodeName = inject(SystemInfoService).nodeName;
  protected readonly languages = LANGUAGES;
  protected readonly language = inject(LanguageService).current;

  /** Panel del menú para pantallas pequeñas; está en la plantilla principal. */
  private readonly menuPanel = viewChild.required<TemplateRef<unknown>>('menuPanel');
  private menuRef: NgbOffcanvasRef | null = null;

  protected readonly userName = computed(() => this.auth.user()?.fullName ?? '');
  /** El menú lateral solo se muestra con la contraseña ya cambiada. */
  protected readonly showSidebar = computed(() => this.auth.isAuthenticated() && !this.auth.mustChangePassword());

  constructor() {
    // Al cambiar de pantalla, el menú de las pantallas pequeñas se cierra solo.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMenu());
  }

  protected openMenu(): void {
    if (this.menuRef !== null) {
      return;
    }
    const ref = this.offcanvas.open(this.menuPanel(), { position: 'start' });
    this.menuRef = ref;
    const clear = (): void => {
      this.menuRef = null;
    };
    ref.result.then(clear, clear);
  }

  protected closeMenu(): void {
    this.menuRef?.dismiss();
    this.menuRef = null;
  }

  protected selectLanguage(language: Language): void {
    void this.translation.setLanguage(language);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
