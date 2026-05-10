import { Component, OnInit, signal } from '@angular/core';
import { CordovaService } from './cordova.service';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly ready = signal(false);

  constructor(private cordova: CordovaService) {}

  ngOnInit(): void {
    this.cordova.deviceReady$.subscribe(() => {
      console.log('Running ' + this.cordova.platformInfo);
      this.ready.set(true);
    });
  }
}

