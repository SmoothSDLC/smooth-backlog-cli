// Item 043: `backlog setup [--ask]` points a repository at the shared backlog repository and deploys the CLI's skill.
// Contract (decided here, recorded in item 043; the shared backlog repository is a setting since item 091):
// - the repository config is .smooth-backlog.json at the repository's top folder, committed, {"backlog_repository": P};
//   P is relative to that folder (portable: the repository and the clone can move together), an absolute path is kept
//   as given;
// - the shared backlog repository's clone URL is read from the environment variable BACKLOG_ORIGIN_URL first, then
//   from the backlog_origin_url key of .smooth-backlog.json; there is no built-in default, and a command that needs
//   it refuses (naming both sources) when neither is set;
// - the default P is ../<name> (the clone beside the repository), where <name> is the configured repository's name
//   part (a neutral folder name without the setting); used unless --ask is given;
// - the backlog repository is found in this order: BACKLOG_HOME, the repository config, the per-user record
//   (~/.config/<name>/home, written by --use-backlog-repo), then ~/git/<name> (<name> as above);
// - a missing clone is cloned from the setting; an existing one is left as it is;
// - the template skill replaces the copy in every agent folder present (.agents, .claude, .github, .qwen), and shared
//   mode is switched on. A second setup does the same and keeps the config unless --ask is given.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { atomicWrite } from '../storage.js';
import { adapters, safeTree, templateRoot } from '../integrations.js';
import { safePath } from '../storage.js';
import { redact, repoIdFromUrl, validateHome } from './safety.js';
import { setMode } from './store.js';

export const CONFIG = '.smooth-backlog.json';
export const ORIGIN_KEY = 'backlog_origin_url';
export const NEUTRAL_NAME = 'backlog-repo';
// Item 091: the refusal for a shared-mode command that needs the shared backlog repository but finds it in neither
// source; it names both the environment variable and the config key.
export const ORIGIN_REFUSAL = `the shared backlog repository is not set: set the environment variable BACKLOG_ORIGIN_URL or the ${ORIGIN_KEY} key of ${CONFIG} to its clone URL (the variable wins); there is no built-in default`;
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
// The shared backlog repository's clone URL (item 091): the environment variable BACKLOG_ORIGIN_URL first, then the
// backlog_origin_url key of the repository's .smooth-backlog.json; '' when neither is set (no built-in default).
export function originUrl(cwd = process.cwd()) {
  const v = (process.env.BACKLOG_ORIGIN_URL || '').trim();
  if (v) return v;
  const top = topOf(cwd);
  if (!top) return '';
  let cfg;
  try { cfg = JSON.parse(readFileSync(join(top, CONFIG), 'utf8')); } catch { return ''; }
  return cfg && typeof cfg[ORIGIN_KEY] === 'string' ? cfg[ORIGIN_KEY].trim() : '';
}
// The setting as {url, id, name}: id is the owner/name parsed from the URL; name its last part - the folder name the
// CLI derives for the clone beside the repository, the per-user record and ~/git/...; '' fields when the setting is
// empty. originFolderName is that folder name with the neutral fallback.
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
  if (!setting.url) return die(ORIGIN_REFUSAL); // item 091: no built-in default; the refusal names both sources, before anything is touched
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
  const fallback = kept ?? join(dirname(top), name);
  let home = fallback;
  if (ask) {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    try {
      const answer = (await rl.question(`Backlog repository path [${fallback}]: `)).trim();
      if (answer) home = resolve(process.cwd(), answer.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
    } catch { return die('no answer; nothing changed'); } finally { rl.close(); }
  }
  if (!existsSync(home)) { // only a missing clone is cloned; an existing folder is left exactly as it is
    mkdirSync(dirname(home), { recursive: true });
    const c = spawnSync('git', ['clone', '-q', setting.url, home], { encoding: 'utf8' });
    if (c.status !== 0) return die(`could not clone ${setting.url} to ${home} (${(c.stderr || '').trim().slice(0, 300)}); nothing changed`, 3);
    say(`✅ cloned the backlog repository to ${home}`);
  } else say(`ℹ️  the backlog repository is at ${home} (left unchanged)`);
  try { await validateHome(home, setting.id, `~/git/${name}`); } catch (e) { return die(e.message); }
  if (!kept || ask) { // a second setup keeps the config unless --ask
    const value = relative(top, realpathSync(home)); // relative to the repository: portable (both real paths: macOS /var is /private/var)
    await atomicWrite(join(top, CONFIG), `${JSON.stringify({ backlog_repository: value || '.' }, null, 2)}\n`);
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
  setMode('shared');
  say('✅ shared backlog mode');
  return 0;
}
