// Shared test fixtures for the shared-backlog-repository mode (cli-parity job 1).
// Tests run against local bare repositories only: origins under <tmp>/origins,
// clones under <tmp>, with SMOOTH_BACKLOG_CLI_HOME and XDG_CONFIG_HOME inside the test's
// temp dir - never the real backlog repository or ~/.config.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dump, dumpItem, itemFileName, itemSlug, isItemName, parse, parseItem } from '../../src/shared/item-file.js';
import * as index from '../../src/shared/index.js';
import * as store from '../../src/shared/store.js';
import { TEAM_BOOL, TEAM_VALUE } from '../../src/team/update.js';

export const BACKLOG_OWNER = 'acme';
export const BACKLOG_NAME = 'backlog-repo';
// Item 091: the CLI carries no built-in backlog repository name; the tests give it this neutral clone URL.
export const ORIGIN_URL = `https://example.com/${BACKLOG_OWNER}/${BACKLOG_NAME}.git`;
export const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_TERMINAL_PROMPT: '0',
};

function git(cwd, ...args) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${(p.stderr || '').trim()}`);
  return p.stdout.trim();
}

// A local bare origin plus a working clone. The backlog repository is always
// acme/backlog-repo as owner/name (the tests' neutral name), which is why
// the shared backlog origin keeps exactly that folder layout.
function originBare(tmp, owner, name, branch) {
  const bare = join(tmp, 'origins', owner, `${name}.git`);
  if (existsSync(bare)) return bare;
  mkdirSync(join(tmp, 'origins', owner), { recursive: true });
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const seed = join(tmp, 'seed', owner, name);
  mkdirSync(join(tmp, 'seed', owner), { recursive: true });
  git(tmp, 'init', '-q', '-b', 'main', seed);
  git(seed, 'commit', '-q', '--allow-empty', '-m', 'init');
  if (branch && branch !== 'main') {
    git(seed, 'branch', branch);
    git(seed, 'push', '-q', bare, 'main', branch);
  } else {
    git(seed, 'push', '-q', bare, 'main');
  }
  rmSync(join(tmp, 'seed'), { recursive: true, force: true });
  return bare;
}

// The shared backlog repository: bare <tmp>/origins/acme/backlog-repo.git
// with one commit on main, cloned to <tmp>/home. The per-repository folders
// (<home>/<owner>/<name>/) live inside that clone.
// An index that can be read but not written (the file is a link, committed so the clone stays clean): the index write that follows any
// item change is refused, after the item files were written. Makes a command fail half-way, to prove it puts everything back.
export function breakIndex(home, dir) {
  if (!index.exists(dir)) index.write(dir, index.fromItems(store.load(dir)));
  renameSync(index.file(dir), join(dir, 'index.real'));
  symlinkSync('index.real', index.file(dir));
  git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', 'index that cannot be written'); git(home, 'push', '-q');
}

export function sharedBacklog(tmp) {
  const bare = originBare(tmp, BACKLOG_OWNER, BACKLOG_NAME, 'main');
  const dest = join(tmp, 'home');
  if (!existsSync(dest)) {
    git(tmp, 'clone', '-q', bare, dest);
    // a team step needs the team's entry in the backlog's configuration; these entries ask for no review (a test that tests a review writes its own)
    appendFileSync(join(dest, '.git', 'info', 'exclude'), 'teams.json\n'); // local configuration, not part of the published backlog
    writeFileSync(join(dest, 'teams.json'), JSON.stringify({ t1: { review: [] }, t2: { review: [] }, t3: { review: [] }, t9: { review: [] } }));
  }
  return dest;
}

// A consuming repository: bare <tmp>/origins/<owner>/<name>.git plus a clone
// checked out on `branch`, at <tmp>/consumer/<name>.
export function consumer(tmp, owner, name, branch = 'main') {
  const bare = originBare(tmp, owner, name, branch);
  const dest = join(tmp, 'consumer', name);
  if (!existsSync(dest)) {
    mkdirSync(join(tmp, 'consumer'), { recursive: true });
    if (branch === 'main' || !branch) git(tmp, 'clone', '-q', bare, dest);
    else git(tmp, 'clone', '-q', '-b', branch, bare, dest);
  }
  return dest;
}

// The environment every child process must run under: SMOOTH_BACKLOG_CLI_HOME points at the
// fixture's local clone, XDG_CONFIG_HOME at a temp config dir, git identity set,
// no terminal prompts. Throws when the resulting SMOOTH_BACKLOG_CLI_HOME is outside tmp.
export function env(tmp) {
  const raw = String(tmp ?? '');
  const t = resolve(raw);
  const home = join(t, 'home');
  if (!raw || !isAbsolute(raw) || !home.startsWith(t + sep)) {
    throw new Error(`SMOOTH_BACKLOG_CLI_HOME ${home} is outside tmp ${raw || '<empty>'}`);
  }
  // item 091: the shared backlog repository's setting - the variable the CLI must use in the tests
  return { ...GIT_IDENTITY, SMOOTH_BACKLOG_CLI_HOME: home, XDG_CONFIG_HOME: join(t, 'config'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: ORIGIN_URL };
}

let calls = 0;
// Runs node bin/backlog.js (this repository's CLI) from a consumer checkout.
// NOTE: cli() below routes legacy test spellings (update/new carrying team flags, items of a team, or a team session) to the real
// `backlog team ...` commands. It is a test-only convenience and not product behaviour: the product's plain commands never do this.
// The steps and creations of a team are `backlog team update|new`; a test that drives them names the item's flags, and cli() sends
// the command to its team spelling with the same arguments (the team and the agent come from the test's environment, as before).
// opts.plain keeps the command plain, for the tests of the plain commands; opts.team makes an update a team step (a close with its hand-off gate).
const flagsOf = args => args.map(String).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')[0]);
const valueOf = (args, flag) => { const i = args.indexOf(`--${flag}`); return i >= 0 ? args[i + 1] : undefined; };
// A session of a team (SMOOTH_BACKLOG_CLI_TEAM_NAME), a --team, a --set-team or a flag only a team has makes the command a team command.
function teamSpelling(args, env, opts) {
  const flags = flagsOf(args);
  const has = list => flags.some(f => list.includes(f));
  const session = Boolean(env.SMOOTH_BACKLOG_CLI_TEAM_NAME || env.SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY || env.SMOOTH_BACKLOG_CLI_TEAM_BRANCH) || has(['team', 'set-team']);
  if (args[0] === 'update') return session || (opts.team && !has(['claim', 'release'])) || has([...TEAM_VALUE, ...TEAM_BOOL]);
  if (args[0] === 'new') return session || has(['review-refs']) || ['SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY', 'SMOOTH_BACKLOG_CLI_TEAM_BRANCH'].some(k => env[k]);
  return false;
}
// The team and the holder of the item a command names (its front matter), read from the files: no command runs, so nothing is pulled or refreshed.
function infoOf(item, opts) {
  const home = { ...process.env, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env }.SMOOTH_BACKLOG_CLI_HOME;
  if (!home || !existsSync(home)) return {};
  for (const owner of readdirSync(home)) for (const name of existsSync(join(home, owner)) && statSync(join(home, owner)).isDirectory() ? readdirSync(join(home, owner)) : []) {
    const dir = join(home, owner, name, 'phases');
    if (!existsSync(dir) || (opts.cwd && existsSync(join(home, owner, basename(opts.cwd))) && name !== basename(opts.cwd))) continue; // the repository the command runs in
    for (const file of readdirSync(dir)) {
      if (file !== itemFileName(item) && !(String(item).match(/^\d+$/) && Number(file.split('-')[0]) === Number(item))) continue;
      let fm; try { fm = parseItem(readFileSync(join(dir, file), 'utf8')).fm; } catch { return {}; } // a damaged item names no team
      return { team: fm.team || undefined, holder: fm.claimed_by || fm.owner || undefined, file: join(dir, file) };
    }
  }
  return {};
}
// a team a test names without configuring it gets an empty entry, so that its steps can run
function neutralTeam(e, name = 'neutral') {
  if (!e.SMOOTH_BACKLOG_CLI_HOME) return name;
  const file = join(e.SMOOTH_BACKLOG_CLI_HOME, 'teams.json');
  let cfg = {}; try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  if (!cfg[name]) { cfg[name] = {}; writeFileSync(file, JSON.stringify(cfg)); }
  return name;
}
export function cli(args = [], opts = {}) {
  const sessionEnv = { ...process.env, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env };
  const named = !opts.plain && args[0] === 'update' && args[1] && !String(args[1]).startsWith('-') ? args[1] : !opts.plain && args[0] === 'new' ? valueOf(args, 'split-from') : undefined;
  const info = named ? infoOf(named, opts) : {};
  const itemTeam = info.team;
  if (!opts.plain && (itemTeam || teamSpelling(args, sessionEnv, opts))) {
    // a team session acts only as itself: the agent a command names (--by, --claim, --release, --agent) is the session's
    const agent = ['by', 'claim', 'release', 'agent'].map(f => valueOf(args, f)).find(Boolean) || opts.env?.SMOOTH_BACKLOG_CLI_AGENT || (args[0] === 'update' && info.holder) || `driver-${++calls}`;
    // a session of a team acts as its SMOOTH_BACKLOG_CLI_AGENT; outside one, the agent a command names acts
    const via = { ...opts.env, SMOOTH_BACKLOG_CLI_AGENT: sessionEnv.SMOOTH_BACKLOG_CLI_TEAM_NAME ? opts.env?.SMOOTH_BACKLOG_CLI_AGENT || agent : agent };
    // `backlog team new` makes only team items (--team, or a split in a team session). Any other creation here is the plain command: a team's work item, or an item that names
    // review documents, which a team step then gives it
    if (args[0] === 'new' && !itemTeam && !flagsOf(args).includes('team') && !(sessionEnv.SMOOTH_BACKLOG_CLI_TEAM_NAME && flagsOf(args).includes('split-from'))) {
      const at = args.indexOf('--review-refs');
      const made = cli(at < 0 ? args : args.filter((_, i) => i !== at && i !== at + 1), { ...opts, env: via, plain: true });
      if (made.status !== 0 || at < 0) return made;
      const set = cli(['team', 'update', createdSlug(made.stdout), ...(sessionEnv.SMOOTH_BACKLOG_CLI_TEAM_NAME ? [] : ['--team', neutralTeam(sessionEnv)]), '--set-review-refs', args[at + 1]], { ...opts, env: via, plain: true });
      return set.status === 0 ? made : set;
    }
    // an item without a team is stepped by a session of no particular team: a neutral entry stands in for it
    const teamFlag = !sessionEnv.SMOOTH_BACKLOG_CLI_TEAM_NAME && !flagsOf(args).includes('team') && (valueOf(args, 'set-team') ? neutralTeam(sessionEnv, valueOf(args, 'set-team')) : itemTeam || neutralTeam(sessionEnv));
    return cli(['team', ...args, ...(teamFlag ? ['--team', teamFlag] : [])], { ...opts, env: via, plain: true });
  }
  const bin = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js'));
  const p = spawnSync(process.execPath, [bin, ...args], {
    cwd: opts.cwd,
    // a team command names its agent with --agent, which a session agent would have to equal; any other command without a named agent is a different writer each time (SMOOTH_BACKLOG_CLI_AGENT, else USER, would make every call one agent with one stale view)
    env: { ...process.env, SMOOTH_BACKLOG_CLI_AGENT: args[0] === 'team' ? '' : `driver-${++calls}`, ...(opts.tmp ? env(opts.tmp) : {}), ...opts.env },
    input: opts.input ?? '', // standard input: nothing unless the test types an answer
    encoding: 'utf8',
    timeout: opts.timeout ?? 60000,
  });
  // the one-line notice of a spelling that moved (`moved: use backlog team ...`) is not output the tests compare; opts.notices keeps it
  const stderr = opts.notices ? (p.stderr ?? '') : (p.stderr ?? '').replace(/^moved: use backlog team .*\n/gm, '');
  return { status: p.status ?? -1, stdout: p.stdout ?? '', stderr };
}

// Creates a team's item with `backlog team new <args>`: the team from --team (or SMOOTH_BACKLOG_CLI_TEAM_NAME), the agent from --agent, else the session's SMOOTH_BACKLOG_CLI_AGENT, else a driver of its own.
export function teamNew(args = [], opts = {}) {
  const agent = valueOf(args, 'agent') ? [] : ['--agent', opts.env?.SMOOTH_BACKLOG_CLI_AGENT || `driver-${++calls}`];
  return cli(['team', 'new', ...args, ...agent], { ...opts, plain: true });
}

// The slug a `new` output names: `created phase <slug> (seq N)`.
export const createdSlug = stdout => {
  const m = String(stdout).match(/created phase ([0-9A-Za-z][0-9A-Za-z._-]*) \(/);
  return m ? m[1] : undefined;
};


// Puts a created item into team `team`, ready to be claimed: `backlog new --team` starts in refinement, and the
// team views and `backlog team pop` reach only the items of their team.
export function intoTeam(slug, opts, team = 't1', status = 'ready') { // status '': the team only, the item stays unrefined and incomplete
  const r = cli(['team', 'update', slug, '--team', team, '--agent', opts.agent ?? 'lead', '--set-team', team, ...(status ? ['--status', status] : [])], { ...opts, env: { ...opts.env, SMOOTH_BACKLOG_CLI_AGENT: '' } }); // opts.env: the caller's own session, so its view
  if (r.status !== 0) throw new Error(`intoTeam ${slug}: ${r.stdout}${r.stderr}`);
  const file = status === 'ready' && infoOf(slug, opts).file; // the item is refined: it carries the stage a refined item has
  if (file) {
    const { fm, body } = readItem(file);
    if (!('stage' in fm)) { const next = {}; for (const k of Object.keys(fm)) { next[k] = fm[k]; if (k === 'team') Object.assign(next, { stage: 'ready', refiner: opts.agent ?? 'lead' }); } writeItem(file, next, body); }
  }
  return slug;
}

// Names the members of a team in the backlog configuration (teams.json of the backlog folder), in order: the agents a plan dispatches to.
export function teamMembers(home, team, members) {
  const file = join(home, 'teams.json');
  let all = {}; try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  writeFileSync(file, JSON.stringify({ ...all, [team]: { ...all[team], members } }));
}

// ---- item files: the tests reach an item file only through these helpers, so the file name and the codec are named in one place ----
// the path of an open item (<repository folder>/phases/<name>)
export const itemPath = (dir, slug) => join(dir, 'phases', itemFileName(slug));
// the path of an archived item (<repository folder>/archive[/<sub-folder>]/<name>)
export const archivedPath = (dir, slug, sub) => join(dir, 'archive', ...(sub ? [sub] : []), itemFileName(slug));
// the path of an open item inside a repository folder, as git and the index spell it (phases/<name>)
export const itemRel = slug => `phases/${itemFileName(slug)}`;
// the same for an archived item (archive[/<sub-folder>]/<name>)
export const archivedRel = (slug, sub) => ['archive', ...(sub ? [sub] : []), itemFileName(slug)].join('/');
// the file name of an item from its slug (for output of git, ls, staged paths, `git show rev:path`)
export const itemName = itemFileName;
// the slug of an item file name or path (a path of the local disk or from git)
export const slugOfName = name => itemSlug(String(name).split('/').pop());
// the names of the item files in <dir>/<sub> ('phases' or 'archive'), sorted; [] when the folder is missing; recursive: the paths below <sub> (archive keeps sub-folders)
export const itemNames = (dir, sub = 'phases', recursive = false) => (existsSync(join(dir, sub)) ? readdirSync(join(dir, sub), recursive ? { recursive: true } : undefined).filter(isItemName).sort() : []);
// the slugs of the item files in <dir>/<sub>, sorted
export const itemSlugs = (dir, sub = 'phases') => itemNames(dir, sub).map(slugOfName);
// the item of a file on disk: { fm, body } (the header values and the body)
export const readItem = path => parseItem(readFileSync(path, 'utf8'));
// the item of a file on disk with its header keys as the file stores them ({ fm, body }): for a test of the stored spellings
export const readStored = path => parse(readFileSync(path, 'utf8'));
// writes an item file whose header keys are exactly the ones given (no earlier name is turned into its new one): for a test of the stored spellings
export function writeStored(path, fm, body) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, dump(fm, body)); }
// the regular-expression source that matches a text literally (for an expectation that names an item path)
export const reEscape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the item of a text (for the text of an item that git shows): { fm, body }
export const itemOfText = text => parseItem(text);
// one header value of an item file
export const readHeader = (path, key) => readItem(path).fm[key];
// the text of an item file as it is on disk
export const readItemFileText = path => readFileSync(path, 'utf8');
// the text of a whole item built from header values and a body, as the CLI writes it
export const itemText = (fm, body) => dumpItem(fm, body);
// writes a whole item file (creating the folder) from header values and a body
export function writeItem(path, fm, body) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, itemText(fm, body)); }
// rewrites an item file with changed header values (an object merged over the old ones; a value undefined removes the key) and/or a changed body (a string)
export function changeItem(path, { fm = {}, body } = {}) {
  const item = readItem(path); const next = { ...item.fm, ...fm };
  for (const k of Object.keys(fm)) if (fm[k] === undefined) delete next[k];
  writeFileSync(path, itemText(next, body ?? item.body));
}

// ---- items a test damages or makes by hand: how an unreadable key looks is known only here (the format of the day) ----
// The keys of these helpers are spelled as the file spells them (title, not name).
// makes one header value of an item file unreadable (the other keys stay readable)
export function damageItem(path, key) { writeFileSync(path, readFileSync(path, 'utf8').replace(new RegExp(`^${reEscape(key)}: .*$`, 'm'), `${key}: "cut`)); }
// whether the header value of an item file is still unreadable as damageItem made it
export const isDamagedItem = (path, key) => new RegExp(`^${reEscape(key)}: "cut`, 'm').test(readFileSync(path, 'utf8'));
// writes an item file whose header keys are exactly the ones given (see writeStored), then damages the keys named
export function writeDamagedItem(path, fm, keys, body) { writeStored(path, fm, body); for (const k of keys) damageItem(path, k); }
// writes a file in an item's place whose header cannot be read at all (no key can be named)
export function writeUnreadableItem(path, body = '') { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `---\nnot a pair\n---\n${body}`); }
// the file as an editor that adds a byte order mark saves it
export const bomItem = path => writeFileSync(path, `\uFEFF${readFileSync(path, 'utf8')}`);
// the file with other line endings
export const crlfItem = (path, eol = '\r\n') => writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, eol));
