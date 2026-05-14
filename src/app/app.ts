import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CordovaService } from './cordova.service';
import { StateService } from './services/state.service';
import { I18nService } from './services/i18n.service';
import { HeaderComponent } from './components/header/header';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly ready = signal(false);
  protected readonly i18nService: I18nService;

  constructor(
    private readonly cordova: CordovaService,
    private readonly state: StateService,
    i18n: I18nService,
  ) {
    this.i18nService = i18n;
  }

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(async () => {
      await this.state.init();
      this.ready.set(true);
    });
  }
}


