import { parse, modeOptions, sharedCommand } from './args.js';
import { redact } from './shared/safety.js';
import { getMode } from './shared/store.js';
import { gitContext } from './context.js';
import { withStore } from './storage.js';
import { initialize, refreshIntegrations } from './integrations.js';
import { execute } from './commands.js';
import { promptMissing } from './prompt.js';
import { updater } from './updates.js';
import { help, human } from './output.js';
import { readFileSync } from 'node:fs';
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export async function run({ installationRoot } = {}) {
  let json = process.argv.includes('--json');
  try {
    let argv = process.argv.slice(2);
    const mode = modeOptions(argv);
    if (mode) {
      const code = await (await import('./shared/router.js')).switchMode(mode);
      if (code || !mode.rest.length) { process.exitCode = code; return; }
      argv = mode.rest; // the command after the mode options runs in the mode just switched to
    }
    // Shared mode (contract section 1) skips init, withStore and refreshIntegrations: the router owns the command.
    const shared = getMode() === 'shared' ? sharedCommand(argv) : null;
    if (shared) { process.exitCode = await (await import('./shared/router.js')).run(shared.command, shared.argv); return; }
    const parsed = parse(argv); json = Boolean(parsed.flags.json);
    if (parsed.command === 'help' || parsed.command === 'version') {
      const data = parsed.command === 'help' ? help : packageInfo.version;
      process.stdout.write(json ? JSON.stringify({ ok: true, data }) + '\n' : data + '\n');
    } else {
      const context = gitContext(parsed.flags, parsed.command);
      await promptMissing(parsed);
      let data;
      const updates = updater({ context, packageRoot: installationRoot });
      if (parsed.command === 'update') { await withStore(context, () => null); data = await updates.command(parsed.args[0]); }
      else {
        data = parsed.command === 'init' ? await initialize(context, parsed.args) : await withStore(context, store => execute(parsed, context, store));
        if (parsed.command !== 'init') {
          try { await refreshIntegrations(context, packageInfo.version); }
          catch (e) { process.stderr.write(`backlog: Could not refresh generated skills: ${redact(e.message)}\n`); }
        }
        await updates.scheduled();
      }
      if (parsed.command === 'init') process.stderr.write('Commit the initialization changes to Git.\n');
      process.stdout.write(json ? JSON.stringify({ ok: true, data }) + '\n' : human(data) + '\n');
    }
  } catch (error) {
    const data = { code: error.code || 'OPERATION_FAILED', message: redact(error.message) };
    if (json) process.stdout.write(JSON.stringify({ ok: false, error: data }) + '\n');
    else process.stderr.write(`${data.code}: ${data.message}\n`);
    process.exitCode = error.exitCode || 1;
  }

}
