import { Injectable } from '@angular/core';
import { Observable, fromEvent, of } from 'rxjs';
import { take, map } from 'rxjs/operators';

declare const cordova: { platformId: string; version: string } | undefined;

@Injectable({ providedIn: 'root' })
export class CordovaService {
  /**
   * Emits once when the Cordova `deviceready` event fires (or immediately
   * if the event already fired before this service was instantiated).
   */
  readonly deviceReady$: Observable<void> = new Observable<void>((observer) => {
    if (typeof cordova !== 'undefined' && (document as any)['cordovaReady']) {
      observer.next();
      observer.complete();
      return;
    }

    const handler = () => {
      observer.next();
      observer.complete();
    };

    document.addEventListener('deviceready', handler, { once: true });
    return () => document.removeEventListener('deviceready', handler);
  });

  get platformInfo(): string {
    if (typeof cordova !== 'undefined') {
      return `cordova-${cordova.platformId}@${cordova.version}`;
    }
    return 'cordova (not available)';
  }
}
