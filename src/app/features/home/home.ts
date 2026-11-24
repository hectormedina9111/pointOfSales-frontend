import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { readProblemDetail } from '../../core/http/problem-details';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { ServerSelectorService } from '../../core/server-selector.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

/** Respuesta de GET /api/v1/system/info. */
export interface SystemInfo {
  application: string;
  version: string;
  nodeRole: string;
  nodeNumber: number;
}

@Component({
  selector: 'app-home',
  imports: [TranslatePipe],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly http = inject(HttpClient);
  private readonly serverSelector = inject(ServerSelectorService);
  private readonly language = inject(LanguageService);
  private readonly translation = inject(TranslationService);

  protected readonly serverName = computed(() =>
    this.translation.translate(this.serverSelector.selected().labelKey),
  );
  protected readonly info = signal<SystemInfo | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly errorDetail = signal<string | null>(null);

  private readonly reloadCount = signal(0);

  constructor() {
    // Se vuelve a consultar al cambiar de servidor, de idioma o al pulsar "Reintentar".
    effect((onCleanup) => {
      this.serverSelector.selected();
      this.language.current();
      this.reloadCount();

      this.info.set(null);
      this.failed.set(false);
      this.errorDetail.set(null);
      this.loading.set(true);

      const subscription = this.http.get<SystemInfo>('/api/v1/system/info').subscribe({
        next: (info) => {
          this.info.set(info);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errorDetail.set(readProblemDetail(error));
          this.failed.set(true);
          this.loading.set(false);
        },
      });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected reload(): void {
    this.reloadCount.update((count) => count + 1);
  }
}
