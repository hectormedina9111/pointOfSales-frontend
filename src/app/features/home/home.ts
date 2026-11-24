import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AppConfigService } from '../../core/config/app-config.service';
import { SystemInfoService } from '../../core/system/system-info.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-home',
  imports: [TranslatePipe],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly systemInfo = inject(SystemInfoService);

  /** Dirección del backend que usa esta web; vacía significa mismo origen. */
  protected readonly apiBaseUrl = inject(AppConfigService).apiBaseUrl;
  protected readonly info = computed(() => {
    const state = this.systemInfo.state();
    return state.status === 'ready' ? state.info : null;
  });
  protected readonly loading = computed(() => this.systemInfo.state().status === 'loading');
  protected readonly failed = computed(() => this.systemInfo.state().status === 'error');
  protected readonly errorDetail = computed(() => {
    const state = this.systemInfo.state();
    return state.status === 'error' ? state.errorDetail : null;
  });

  protected reload(): void {
    this.systemInfo.load();
  }
}
