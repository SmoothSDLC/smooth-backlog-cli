// The fixture of the team command tests: a consumer checkout whose origin names acme/app with the team file at its .backlog/teams.json, the backlog clone beside
// it (its own bare origin), and items written through toFile. It does not use sharedBacklog, which writes a team file of the earlier shape. world() is the backlog
// beside the code; inside() is the backlog inside the code repository (repository id local/repository), where a second clone publishes in turn.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BACKLOG_NAME, BACKLOG_OWNER, GIT_IDENTITY, cli, env as cliEnv, consumer } from './shared-fixtures.js';
import { toFile } from '../../src/team/item.js';
import { itemFileName } from '../../src/shared/store.js';

// A child that hangs fails its test (spawnSync kills it and reports no status) and does not hang the suite.
export const CHILD_TIMEOUT = 60000;
export const readJson = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const TEMPLATES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, readJson(`../../templates/teams/${n}.json`)]));
export const git = (cwd, ...a) => { const p = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY }, timeout: CHILD_TIMEOUT }); if (p.status) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); };
const BIN = resolve(import.meta.dirname, '..', '..', 'bin', 'backlog.js');
const TEAM_VARIABLES = ['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'AGENT', 'SESSION'].map(n => `SMOOTH_BACKLOG_CLI_${n}`);
const quiet = Object.fromEntries(TEAM_VARIABLES.map(k => [k, '']));

// The item file of a folder by number (phases/, or archive/phases/ where `backlog archive` and the team commands put an archived item, or archive/): its path, or undefined.
export function fileOf(folder, seq) {
  for (const sub of ['phases', join('archive', 'phases'), 'archive']) {
    const dir = join(folder, sub);
    const hit = existsSync(dir) && readdirSync(dir).find(n => n.startsWith(`${String(seq).padStart(3, '0')}-`));
    if (hit) return join(dir, hit);
  }
  return undefined;
}

// Writes an item through toFile into <folder>/phases (archive/ when item.archived); item: the evaluator item ({ seq, slug, team, repository, branch, fields, ... }).
export function putItem(folder, item, entry) {
  const doc = { created: '2026-11-01T00:00:00Z', updated: '2026-11-01T00:00:00Z', updated_by: 'seed', body: '', history: [], ...item };
  const path = join(folder, ...(item.archived ? ['archive', 'phases'] : ['phases']), itemFileName(item.slug));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, toFile(doc, entry));
  return path;
}

// The per-user validated copy and record of a team file (what loadTeams writes under the state folder): their file names, [] when none.
const recordsOf = xdg => { const dir = join(xdg, 'smooth-backlog-cli', 'teams-validation'); return existsSync(dir) ? readdirSync(dir).sort() : []; };
const refuser = bare => () => { const hook = join(bare, 'hooks', 'pre-receive'); writeFileSync(hook, '#!/bin/sh\necho refused >&2\nexit 1\n'); chmodSync(hook, 0o755); };

// The backlog beside the code. teams: the content of .backlog/teams.json (an object or text).
export function world(t, teams = TEMPLATES.parallel, { prefix = 'team-world-' } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const bare = join(tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  mkdirSync(join(tmp, 'origins', BACKLOG_OWNER), { recursive: true });
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const home = join(tmp, 'home');
  git(tmp, 'clone', '-q', bare, home); git(home, 'checkout', '-q', '-b', 'main'); git(home, 'commit', '-q', '--allow-empty', '-m', 'init'); git(home, 'push', '-q', '-u', 'origin', 'main');
  const cons = consumer(tmp, 'acme', 'app');
  mkdirSync(join(cons, '.backlog'), { recursive: true });
  const teamFile = join(cons, '.backlog', 'teams.json');
  writeFileSync(teamFile, typeof teams === 'string' ? teams : JSON.stringify(teams));
  const folder = join(home, 'acme', 'app');
  const run = (args, extra = {}, verb = 'new', timeout = CHILD_TIMEOUT) => cli(['team', verb, ...args], { cwd: cons, tmp, plain: true, timeout, env: { ...quiet, ...extra } });
  const files = () => (existsSync(join(folder, 'phases')) ? readdirSync(join(folder, 'phases')).sort() : []);
  const item = seq => JSON.parse(readFileSync(fileOf(folder, seq), 'utf8'));
  const config = () => JSON.parse(readFileSync(join(cons, '.backlog', 'config.json'), 'utf8'));
  const publish = message => { git(home, 'add', '-A'); git(home, 'commit', '-q', '-m', message); git(home, 'push', '-q'); };
  const records = () => recordsOf(join(tmp, 'config'));
  return { tmp, home, cons, bare, folder, teamFile, run, files, item, config, publish, records, refuse: refuser(bare), env: { ...cliEnv(tmp), ...quiet } };
}

// The backlog inside the code repository (.backlog, repository id local/repository): ra is the working clone the command runs in, rb a second clone beside it.
export function inside(t, teams = TEMPLATES.parallel) {
  const dir = mkdtempSync(join(tmpdir(), 'team-inside-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bare = join(dir, 'origin.git'); const ra = join(dir, 'ra'); const rb = join(dir, 'rb');
  git(dir, 'init', '-q', '--bare', '-b', 'main', bare); git(dir, 'clone', '-q', bare, ra); git(ra, 'checkout', '-q', '-b', 'main');
  mkdirSync(join(ra, '.backlog'), { recursive: true });
  writeFileSync(join(ra, '.backlog', 'config.json'), '{"backlog_repository": ".backlog"}\n');
  const teamFile = join(ra, '.backlog', 'teams.json');
  writeFileSync(teamFile, JSON.stringify(teams));
  git(ra, 'add', '-A'); git(ra, 'commit', '-qm', 'seed'); git(ra, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'clone', '-q', bare, rb);
  const folder = join(ra, '.backlog', 'local', 'repository');
  const run = (args, extra = {}, verb = 'new', timeout = CHILD_TIMEOUT) => spawnSync(process.execPath, [BIN, 'team', verb, ...args], { cwd: ra, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY, SMOOTH_BACKLOG_CLI_HOME: '', XDG_CONFIG_HOME: join(dir, 'xdg'), ...quiet, ...extra }, timeout });
  return { dir, bare, ra, rb, folder, teamFile, run, records: () => recordsOf(join(dir, 'xdg')), refuse: refuser(bare) };
}
