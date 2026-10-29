#!/usr/bin/env node
// Stable bootstrap: updates atomically select a complete runtime without replacing this file.
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Report this run (script name, exit code, times) to the script-run recorder where it is installed: detached, never waited for, never a failure.
const RUN_START = Date.now() / 1000;
process.on('exit', rc => { try { spawn('python3', [process.env.CODY_SCRIPT_RUNS_MODULE || '/opt/cody/bin/script_runs.py', 'record', 'backlog.js', String(rc), String(RUN_START), String(Date.now() / 1000)], { detached: true, stdio: 'ignore' }).unref(); } catch {} });
const root = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  let active = root;
  let pointerText;
  try { pointerText = await fs.readFile(join(root, '.backlog-runtime.json'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (pointerText !== undefined) {
    const pointer = JSON.parse(pointerText);
    if (pointer.schema_version !== 1 || typeof pointer.runtime !== 'string' || !/^\.backlog-runtimes\/[0-9a-f-]{36}$/.test(pointer.runtime)) throw new Error('Invalid installed runtime pointer; reinstall the package with npm.');
    for (const path of [join(root, '.backlog-runtime.json'), join(root, '.backlog-runtimes'), join(root, pointer.runtime)]) if ((await fs.lstat(path)).isSymbolicLink()) throw new Error('Installed runtime pointers cannot use symlinks; reinstall the package.');
    active = join(root, pointer.runtime);
  }
  const main = await import(pathToFileURL(join(active, 'src/main.js')).href);
  await main.run({ installationRoot: root });
} catch (error) {
  const data = { code: 'RUNTIME_ERROR', message: error.message };
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify({ ok: false, error: data }) + '\n');
  else process.stderr.write(`RUNTIME_ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
