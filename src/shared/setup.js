// `backlog setup [--ask]` chooses where a repository's backlog lives and deploys the CLI's skill. See HELP.setup.
// The config is .backlog/config.json, committed: {"backlog_repository": P} with P relative to the repository (portable;
// ".backlog" = inside it), and optionally backlog_origin_url, the clone URL (the environment variable SMOOTH_BACKLOG_CLI_ORIGIN_URL
// wins). The root file .smooth-backlog.json of earlier builds is still read. The agent folders: .agents, .claude, .github, .qwen.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { atomicWrite } from '../storage.js';
import { BacklogError } from '../errors.js';
import { adapters, safeTree, templateRoot } from '../integrations.js';
import { safePath } from '../storage.js';
import { redact, repoIdFromUrl } from './safety.js';

export const CONFIG = '.backlog/config.json'; // the repository's backlog configuration lives in its .backlog folder
export const LEGACY_CONFIG = '.smooth-backlog.json'; // written at the repository root by earlier builds: still read
export const ORIGIN_KEY = 'backlog_origin_url';
export const NEUTRAL_NAME = 'backlog-repo';
export const TEMPLATE_DIR = '.backlog/team-templates'; // the generic team templates, copied from templates/teams on every setup
// the names and their order are fixed by the message setup prints, not read from the folder
const TEMPLATES = ['scrum', 'extreme-programming', 'parallel', 'single-agent', 'patterns'];
const say = text => process.stdout.write(`${redact(text)}\n`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
export const topOf = cwd => { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
// The repository's backlog configuration: .backlog/config.json, else the root file of earlier builds; {} when there is none.
// The reader returns every key of the file, the team-file keys teams_file, teams_file_sha, migrated_at and migrated_by_version
// included, and a writer that rewrites the file starts from this object, so no key is lost. A .backlog/config.json that EXISTS but is
// not a JSON object stops with exit 2 (BacklogError): it is never read as empty and never replaced by the root file. A missing one
// is an empty configuration.
export function readConfig(top) {
  let text = null;
  try { text = readFileSync(join(top, CONFIG), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw unreadable(fsReason(e)); }
  if (text !== null) {
    let cfg;
    try { cfg = JSON.parse(text); } catch (e) { throw unreadable(e.message); }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw unreadable('it is not a JSON object');
    return cfg;
  }
  try { const cfg = JSON.parse(readFileSync(join(top, LEGACY_CONFIG), 'utf8')); if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return cfg; } catch { /* none */ }
  return {};
}
// The reason for a file-system failure: the error code and a fixed phrase, never Node's message (it holds the absolute path).
const FS_REASON = { EACCES: 'permission denied', EPERM: 'permission denied', EISDIR: 'it is a folder, not a file', ENOTDIR: '.backlog is not a folder' };
const fsReason = e => (e && typeof e.code === 'string' && e.code ? `${e.code}: ${FS_REASON[e.code] || 'it cannot be opened'}` : 'it cannot be opened');
const unreadable = reason => new BacklogError('CONFIG_UNREADABLE', `${CONFIG} cannot be read (${reason}); fix it: no command runs and nothing is written while it cannot be read`, 2);
// The stop for every command before it reads or writes anything: throws when the repository's configuration cannot be read.
export function assertConfigReadable(cwd = process.cwd()) {
  const top = topOf(cwd);
  if (top) readConfig(top);
}
// The backlog folder a repository's config names, or null (no config, or one that names no path).
export function configuredHome(cwd = process.cwd()) {
  const top = topOf(cwd);
  if (!top) return null;
  const cfg = readConfig(top);
  const p = typeof cfg.backlog_repository === 'string' ? cfg.backlog_repository.trim() : '';
  return p ? resolve(top, p) : null;
}
// The user of this repository: the git user.name, else the name the person is logged in with.
export function defaultUser(cwd = process.cwd()) {
  const r = spawnSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' });
  return (r.status === 0 && r.stdout.trim()) || userInfo().username;
}
// The user the repository's configuration names (written by setup); the default user when it names none.
export function configUser(cwd = process.cwd()) {
  const top = topOf(cwd);
  const u = top ? readConfig(top).user : undefined;
  return typeof u === 'string' && u.trim() ? u.trim() : defaultUser(cwd);
}
// The shared backlog repository's clone URL: the environment variable SMOOTH_BACKLOG_CLI_ORIGIN_URL first, then the
// backlog_origin_url key of the repository's configuration; '' when neither is set (no built-in default).
export function originUrl(cwd = process.cwd()) {
  const v = (process.env.SMOOTH_BACKLOG_CLI_ORIGIN_URL || '').trim();
  if (v) return v;
  const top = topOf(cwd);
  if (!top) return '';
  const cfg = readConfig(top);
  return typeof cfg[ORIGIN_KEY] === 'string' ? cfg[ORIGIN_KEY].trim() : '';
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

// The refusal of a symbolic link: the path relative to the repository, named once, never the absolute one.
const linkRefusal = (top, label, e) => { const m = e.message.split(`${top}${sep}`).join(''); return `${m.includes(label) ? '' : `${label}: `}${m} (a symbolic link on the way: nothing changed)`; };

export async function run(argv) {
  if (argv.includes('--help')) { const h = (await import('../help.js')).HELP?.setup; if (h) { process.stdout.write(h.endsWith('\n') ? h : `${h}\n`); return 0; } }
  assertConfigReadable(); // an unreadable configuration stops setup before anything changes
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
    try { await safePath(top, detect); await safeTree(top, target); } catch (e) { return die(linkRefusal(top, a.destination, e)); }
    targets.push({ target, destination: a.destination });
  }
  try { await safeTree(top, join(top, TEMPLATE_DIR)); } catch (e) { return die(linkRefusal(top, TEMPLATE_DIR, e)); }
  const kept = configuredHome(top);
  // the backlog folder: SMOOTH_BACKLOG_CLI_HOME when set, else the configured one, else beside the repository when a clone URL is set,
  // else inside the repository
  const fromEnv = (process.env.SMOOTH_BACKLOG_CLI_HOME || '').trim();
  const fallback = fromEnv ? resolve(fromEnv.replace(/^~(?=\/|$)/, process.env.HOME || '~')) : kept ?? (setting.url ? join(dirname(top), name) : join(top, '.backlog'));
  let home = fallback;
  if (ask) {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    try {
      const answer = (await rl.question(`Backlog repository path [${fallback}]: `)).trim();
      if (answer) home = resolve(process.cwd(), answer.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
    } catch { return die('no answer; nothing changed'); } finally { rl.close(); }
  }
  const hadFolder = existsSync(join(top, '.backlog'));
  const inside = resolve(home) === join(top, '.backlog');
  if (!existsSync(home)) { // a missing folder is cloned when a clone URL is set, else created; an existing folder is left exactly as it is
    mkdirSync(dirname(home), { recursive: true });
    if (setting.url) {
      const c = spawnSync('git', ['clone', '-q', setting.url, home], { encoding: 'utf8' });
      if (c.status !== 0) return die(`could not clone ${setting.url} to ${home} (${(c.stderr || '').trim().slice(0, 300)}); nothing changed`, 3);
      say('✅ backlog repository cloned');
    } else if (!inside) { mkdirSync(home, { recursive: true }); say('✅ backlog folder created'); }
  } else if (!inside) say('ℹ️  backlog folder kept');
  mkdirSync(join(top, '.backlog', '.state'), { recursive: true }); // the config lives in .backlog, created by setup whatever the location
  if (!existsSync(join(top, '.backlog', '.gitignore'))) await atomicWrite(join(top, '.backlog', '.gitignore'), '.state/\n');
  say(hadFolder ? 'ℹ️  .backlog folder kept' : '✅ .backlog folder created');
  const had = readConfig(top);
  const noUser = typeof had.user !== 'string' || !had.user.trim() || typeof had.team !== 'string'; // the user and the default team are written once
  if (!kept || ask || fromEnv || setting.url || noUser || !existsSync(join(top, CONFIG))) { // a second setup keeps the config unless --ask or the environment names the location; a rewrite keeps the file's other keys
    const value = relative(top, realpathSync(home)); // relative to the repository: portable (both real paths: macOS /var is /private/var)
    const previous = readConfig(top);
    const next = { ...previous, backlog_repository: value || '.' };
    if (typeof next.user !== 'string' || !next.user.trim()) next.user = defaultUser(top);
    if (typeof next.team !== 'string') next.team = '';
    if (setting.url) next[ORIGIN_KEY] = setting.url; // the clone URL the setup ran with is recorded, so later runs need no variable
    await atomicWrite(join(top, CONFIG), `${JSON.stringify(next, null, 2)}\n`);
    say(`✅ configuration written: ${inside ? 'backlog inside this repository' : 'backlog repository'}${setting.url ? ', with its clone URL' : ''}`);
  } else say(`ℹ️  configuration kept: ${inside ? 'backlog inside this repository' : 'backlog repository'}`);
  const deployed = [];
  for (const { target, destination } of targets) {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(templateRoot, 'skills/backlog'), target, { recursive: true });
    deployed.push(destination);
  }
  say(deployed.length ? `✅ skill deployed to ${deployed.map(d => d.split('/')[0]).join(', ')}` : 'ℹ️  no agent folder (.agents, .claude, .github, .qwen) here: no skill copy deployed');
  // the team templates belong to the CLI like the skill copy: the folder is replaced on every setup (an edited copy and a file added there are lost)
  rmSync(join(top, TEMPLATE_DIR), { recursive: true, force: true });
  cpSync(join(templateRoot, 'teams'), join(top, TEMPLATE_DIR), { recursive: true });
  say(`✅ team templates copied to ${TEMPLATE_DIR}: ${TEMPLATES.join(', ')}; copy one to the team file and edit it there`);
  // setup is a change to the repository: committed on the current branch (the config, the team templates and the skill copies only) and pushed
  const git = args => spawnSync('git', args, { cwd: top, encoding: 'utf8' });
  const wrote = ['.backlog/config.json', '.backlog/.gitignore', TEMPLATE_DIR, ...deployed]; // the templates are committed here and only here: no other command stages them
  git(['add', '-A', '--', ...wrote]);
  if (git(['diff', '--cached', '--quiet', '--', ...wrote]).status) {
    const c = git(['commit', '-q', '--only', '-m', 'backlog: setup', '--', ...wrote]);
    if (c.status !== 0) return die(`could not commit the setup in this repository (${(c.stderr || '').trim().slice(0, 300)})`, 3);
    const p = git(['push', '-q', 'origin', 'HEAD']);
    if (p.status !== 0) return die(`the setup is committed on this branch but not published (push failed: ${(p.stderr || '').trim().slice(0, 300)}); push the branch`, 3);
    say('✅ setup committed and pushed');
  }
  return 0;
}
