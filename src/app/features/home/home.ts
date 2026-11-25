import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AppConfigService } from '../../core/config/app-config.service';
import { SystemInfoService } from '../../core/system/system-info.service';
import { IfPrivilegeDirective } from '../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BelowMinStockWidgetComponent } from './below-min-stock-widget';
import { StoresWidgetComponent } from './stores-widget';
import { SalesTodayByBranchWidgetComponent } from './sales-today-by-branch-widget';
import { SalesTodayWidgetComponent } from './sales-today-widget';
import { SyncSummaryWidgetComponent } from './sync-summary-widget';

@Component({
  selector: 'app-home',
  imports: [
    TranslatePipe,
    IfPrivilegeDirective,
    StoresWidgetComponent,
    SyncSummaryWidgetComponent,
    SalesTodayWidgetComponent,
    SalesTodayByBranchWidgetComponent,
    BelowMinStockWidgetComponent,
  ],
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
  /** Según el nodo, el inicio muestra el widget de tiendas (central) o el resumen de sincronización (tienda). */
  protected readonly isCentral = computed(() => this.info()?.nodeRole === 'CENTRAL');
  protected readonly isStore = computed(() => this.info()?.nodeRole === 'STORE');
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
