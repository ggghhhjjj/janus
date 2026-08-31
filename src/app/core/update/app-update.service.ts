import { Injectable } from '@angular/core';

export const appReloader = {
  reload(): void {
    window.location.reload();
  },
};

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  async reloadApp(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    appReloader.reload();
  }
}
