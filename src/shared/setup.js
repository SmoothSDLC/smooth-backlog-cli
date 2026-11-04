// `backlog setup [--ask]` chooses where a repository's backlog lives and deploys the CLI's skill. See HELP.setup.
// The config is .smooth-backlog.json at the repository's top folder, committed: {"backlog_repository": P} with P relative
// to that folder (portable), and optionally backlog_origin_url, the clone URL (the environment variable BACKLOG_ORIGIN_URL
// wins). The agent folders: .agents, .claude, .github, .qwen.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { atomicWrite } from '../storage.js';
import { adapters, safeTree, templateRoot } from '../integrations.js';
import { safePath } from '../storage.js';
import { redact, repoIdFromUrl } from './safety.js';

export const CONFIG = '.smooth-backlog.json';
export const ORIGIN_KEY = 'backlog_origin_url';
export const NEUTRAL_NAME = 'backlog-repo';
// the refusal for a command that needs the clone URL but finds it in neither source.
const say = text => process.stdout.write(`${redact(text)}\n`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
export const topOf = cwd => { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
// The backlog repository a repository's config names, or null (no config, or one that names no path).
export function configuredHome(cwd = process.cwd()) {
  const top = topOf(cwd);
  if (!top) return null;
  let cfg;
  try { cfg = JSON.parse(readFileSync(join(top, CONFIG), 'utf8')); } catch { return null; }
  const p = cfg && typeof cfg.backlog_repository === 'string' ? cfg.backlog_repository.trim() : '';
  return p ? resolve(top, p) : null;
}
// The shared backlog repository's clone URL: the environment variable BACKLOG_ORIGIN_URL first, then the
// backlog_origin_url key of the repository's.smooth-backlog.json; '' when neither is set (no built-in default).
export function originUrl(cwd = process.cwd()) {
  const v = (process.env.BACKLOG_ORIGIN_URL || '').trim();
  if (v) return v;
  const top = topOf(cwd);
  if (!top) return '';
  let cfg;
  try { cfg = JSON.parse(readFileSync(join(top, CONFIG), 'utf8')); } catch { return ''; }
  return cfg && typeof cfg[ORIGIN_KEY] === 'string' ? cfg[ORIGIN_KEY].trim() : '';
}
// The setting as {url, id, name}: id is the owner/name the setting names (repoIdFromUrl, the same parser the
// origin check uses on existing clones' origins, so the two sides compare the same way); name is the name part
// - the folder name the CLI derives for the clone beside the repository, the per-user record and ~/git/...;
// '' fields when the setting is empty. originFolderName is that folder name with the neutral fallback.
export function originSetting(cwd = process.cwd()) {
  const url = originUrl(cwd);
  const id = url ? repoIdFromUrl(url) : '';
  return { url, id, name: id ? id.split('/').pop() : '' };
}
export const originFolderName = cwd => originSetting(cwd).name || NEUTRAL_NAME;

export async function run(argv) {
  if (argv.includes('--help')) { const h = (await import('../help.js')).HELP?.setup; if (h) { process.stdout.write(h.endsWith('\n') ? h : `${h}\n`); return 0; } }
  const ask = argv.includes('--ask');
  const other = argv.filter(x => x !== '--ask');
  if (other.length) return die(`setup takes only --ask (got ${other.join(' ')})`);
  const top = topOf(process.cwd());
  if (!top) return die('backlog setup runs inside the git repository it sets up');
  const setting = originSetting(top);
  const name = originFolderName(top);
  const targets = []; // checked before anything changes: no symbolic link on the way to a skill copy (as backlog init)
  for (const a of adapters) {
    const detect = join(top, a.detect);
    if (!existsSync(detect) || !statSync(detect).isDirectory()) continue;
    const target = join(top, a.destination);
    try { await safePath(top, detect); await safeTree(top, target); } catch (e) { return die(`${a.destination}: ${e.message} (a symbolic link on the way: nothing changed)`); }
    targets.push({ target, destination: a.destination });
  }
  const kept = configuredHome(top);
  // the backlog folder: the configured one, else beside the repository when a clone URL is set, else inside the repository
  const fallback = kept ?? (setting.url ? join(dirname(top), name) : join(top, '.backlog'));
  let home = fallback;
  if (ask) {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    try {
      const answer = (await rl.question(`Backlog repository path [${fallback}]: `)).trim();
      if (answer) home = resolve(process.cwd(), answer.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
    } catch { return die('no answer; nothing changed'); } finally { rl.close(); }
  }
  if (!existsSync(home)) { // a missing folder is cloned when a clone URL is set, else created; an existing folder is left exactly as it is
    mkdirSync(dirname(home), { recursive: true });
    if (setting.url) {
      const c = spawnSync('git', ['clone', '-q', setting.url, home], { encoding: 'utf8' });
      if (c.status !== 0) return die(`could not clone ${setting.url} to ${home} (${(c.stderr || '').trim().slice(0, 300)}); nothing changed`, 3);
      say(`✅ cloned the backlog repository to ${home}`);
    } else { mkdirSync(home, { recursive: true }); say(`✅ created the backlog folder ${home}`); }
  } else say(`ℹ️  the backlog folder is at ${home} (left unchanged)`);
  if (home !== join(top, '.backlog') && (!kept || ask)) { // a second setup keeps the config unless --ask; a rewrite keeps the file's other keys
    const value = relative(top, realpathSync(home)); // relative to the repository: portable (both real paths: macOS /var is /private/var)
    let previous = null;
    try { previous = JSON.parse(readFileSync(join(top, CONFIG), 'utf8')); } catch { /* no config */ }
    const keptKeys = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    await atomicWrite(join(top, CONFIG), `${JSON.stringify({ ...keptKeys, backlog_repository: value || '.' }, null, 2)}\n`);
    say(`✅ ${CONFIG}: backlog_repository ${value} (commit it, so every clone of this repository finds the backlog repository)`);
  } else say(`ℹ️  ${CONFIG} kept`);
  const deployed = [];
  for (const { target, destination } of targets) {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(templateRoot, 'skills/backlog'), target, { recursive: true });
    deployed.push(destination);
  }
  say(deployed.length ? `✅ the backlog skill in ${deployed.join(', ')}` : 'ℹ️  no agent folder (.agents, .claude, .github, .qwen) here: no skill copy deployed');
  return 0;
}
