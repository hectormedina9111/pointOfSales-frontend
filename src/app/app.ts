import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';

import { LANGUAGES, Language, LanguageService } from './core/i18n/language.service';
import { TranslationService } from './core/i18n/translation.service';
import { SystemInfoService } from './core/system/system-info.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgbCollapse, TranslatePipe],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly translation = inject(TranslationService);

  protected readonly nodeName = inject(SystemInfoService).nodeName;
  protected readonly languages = LANGUAGES;
  protected readonly language = inject(LanguageService).current;
  protected readonly menuCollapsed = signal(true);

  protected toggleMenu(): void {
    this.menuCollapsed.update((collapsed) => !collapsed);
  }

  protected selectLanguage(language: Language): void {
    void this.translation.setLanguage(language);
  }
}
