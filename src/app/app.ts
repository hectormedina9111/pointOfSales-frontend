import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbCollapse, NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap';

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
    RouterLinkActive,
    NgbCollapse,
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

  protected readonly auth = inject(AuthService);
  protected readonly nodeName = inject(SystemInfoService).nodeName;
  protected readonly languages = LANGUAGES;
  protected readonly language = inject(LanguageService).current;
  protected readonly menuCollapsed = signal(true);

  protected readonly userName = computed(() => this.auth.user()?.fullName ?? '');
  /** El menú lateral solo se muestra con la contraseña ya cambiada. */
  protected readonly showSidebar = computed(() => this.auth.isAuthenticated() && !this.auth.mustChangePassword());

  protected toggleMenu(): void {
    this.menuCollapsed.update((collapsed) => !collapsed);
  }

  protected selectLanguage(language: Language): void {
    void this.translation.setLanguage(language);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
