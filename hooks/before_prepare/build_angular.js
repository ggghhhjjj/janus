#!/usr/bin/env node
/**
 * Cordova before_prepare hook — builds the Angular app so that www/ is
 * populated before Cordova copies it to the platform folder.
 *
 * Triggered by: cordova prepare | cordova build | cordova run
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

module.exports = function (context) {
  const projectRoot = context.opts.projectRoot;

  console.log('[hook] Building Angular app…');

  try {
    execSync('npm run build', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('[hook] Angular build complete.');
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    throw new Error('[hook] Angular build failed: ' + message);
  }
};
