/**
 * Stub cordova.js for local development (ng serve / npm start).
 *
 * The real Cordova platform injects its own cordova.js into
 * platforms/browser/www/ during `cordova run/build/prepare`,
 * which overwrites this stub. This file is only ever loaded by
 * the Angular dev server (ng serve).
 *
 * It fires the `deviceready` event that CordovaService waits for.
 */
(function () {
  function fireDeviceReady() {
    document.dispatchEvent(new CustomEvent('deviceready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fireDeviceReady);
  } else {
    // DOM already parsed — fire on next tick so Angular has bootstrapped
    setTimeout(fireDeviceReady, 0);
  }
})();
