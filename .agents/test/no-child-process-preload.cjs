// Test-only module the no-child-process proof (no-child-process-proof.test.js) preloads into the CLI
// child through NODE_OPTIONS=--require <this file>: it wraps the child_process functions spawn,
// spawnSync, exec, execFile, execSync and fork and records every call - the function name, the
// executable and its arguments - as one JSON line per call in the file named by
// BACKLOG_CHILD_CALLS_FILE. Any executable - a name on the PATH, an absolute path or a detached
// child - is recorded, whatever the command's own exit status. Without that variable the module
// records nothing, so a plain CLI run is unchanged.
'use strict';
const cp = require('node:child_process');
const fs = require('node:fs');
const file = process.env.BACKLOG_CHILD_CALLS_FILE;
if (file) {
  for (const name of ['spawn', 'spawnSync', 'exec', 'execFile', 'execSync', 'execFileSync', 'fork']) {
    const original = cp[name];
    cp[name] = function (...args) {
      try {
        fs.appendFileSync(file, JSON.stringify({
          fn: name,
          command: typeof args[0] === 'string' ? args[0] : null,
          args: Array.isArray(args[1]) ? args[1] : null,
        }) + '\n');
      } catch { /* a recording failure never changes the command's behaviour */ }
      return original.apply(this, args);
    };
  }
}
