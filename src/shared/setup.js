// Item 043: `backlog setup [--ask]` points a repository at the shared backlog repository and deploys the CLI's skill.
// Contract (decided here, recorded in item 043):
// - the repository config is .smooth-backlog.json at the repository's top folder, committed, {"backlog_repository": P};
//   P is relative to that folder (portable: the repository and the clone can move together), an absolute path is kept
//   as given;
// - the default P is ../smoothsdlc-backlog (the clone beside the repository), used unless --ask is given;
// - the backlog repository is found in this order: BACKLOG_HOME, the repository config, the per-user record
//   (~/.config/smoothsdlc-backlog/home, written by --use-backlog-repo), then ~/git/smoothsdlc-backlog;
// - a missing clone is cloned from BACKLOG_ORIGIN_URL (default https://github.com/SmoothSDLC/smoothsdlc-backlog.git);
//   an existing one is left as it is;
// - the template skill replaces the copy in every agent folder present (.agents, .claude, .github, .qwen), and shared
//   mode is switched on. A second setup does the same and keeps the config unless --ask is given.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { atomicWrite } from '../storage.js';
import { adapters, safeTree, templateRoot } from '../integrations.js';
import { safePath } from '../storage.js';
import { redact, validateHome } from './safety.js';
import { setMode } from './store.js';

export const CONFIG = '.smooth-backlog.json';
const ORIGIN_URL = () => process.env.BACKLOG_ORIGIN_URL || 'https://github.com/SmoothSDLC/smoothsdlc-backlog.git';
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

export async function run(argv) {
  if (argv.includes('--help')) { const h = (await import('../help.js')).HELP?.setup; if (h) { process.stdout.write(h.endsWith('\n') ? h : `${h}\n`); return 0; } }
  const ask = argv.includes('--ask');
  const other = argv.filter(x => x !== '--ask');
  if (other.length) return die(`setup takes only --ask (got ${other.join(' ')})`);
  const top = topOf(process.cwd());
  if (!top) return die('backlog setup runs inside the git repository it sets up');
  const targets = []; // checked before anything changes: no symbolic link on the way to a skill copy (as backlog init)
  for (const a of adapters) {
    const detect = join(top, a.detect);
    if (!existsSync(detect) || !statSync(detect).isDirectory()) continue;
    const target = join(top, a.destination);
    try { await safePath(top, detect); await safeTree(top, target); } catch (e) { return die(`${a.destination}: ${e.message} (a symbolic link on the way: nothing changed)`); }
    targets.push({ target, destination: a.destination });
  }
  const kept = configuredHome(top);
  const fallback = kept ?? join(dirname(top), 'smoothsdlc-backlog');
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
    const c = spawnSync('git', ['clone', '-q', ORIGIN_URL(), home], { encoding: 'utf8' });
    if (c.status !== 0) return die(`could not clone ${ORIGIN_URL()} to ${home} (${(c.stderr || '').trim().slice(0, 300)}); nothing changed`, 3);
    say(`✅ cloned the backlog repository to ${home}`);
  } else say(`ℹ️  the backlog repository is at ${home} (left unchanged)`);
  try { await validateHome(home); } catch (e) { return die(e.message); }
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
