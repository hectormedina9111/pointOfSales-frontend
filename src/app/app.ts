import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  NgbCollapse,
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
} from '@ng-bootstrap/ng-bootstrap';

import { SERVERS, ServerId } from './core/config/servers';
import { ServerSelectorService } from './core/server-selector.service';
import { LANGUAGES, Language, LanguageService } from './core/i18n/language.service';
import { TranslationService } from './core/i18n/translation.service';
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
    TranslatePipe,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly serverSelector = inject(ServerSelectorService);
  private readonly translation = inject(TranslationService);

  protected readonly servers = SERVERS;
  protected readonly languages = LANGUAGES;
  protected readonly selectedServer = this.serverSelector.selected;
  protected readonly language = inject(LanguageService).current;
  protected readonly menuCollapsed = signal(true);

  protected toggleMenu(): void {
    this.menuCollapsed.update((collapsed) => !collapsed);
  }

  protected selectServer(id: ServerId): void {
    this.serverSelector.select(id);
  }

  protected selectLanguage(language: Language): void {
    void this.translation.setLanguage(language);
  }
}
