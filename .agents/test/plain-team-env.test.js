// The plain commands ignore the team environment (SMOOTH_BACKLOG_CLI_TEAM_NAME, SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY, SMOOTH_BACKLOG_CLI_TEAM_BRANCH, SMOOTH_BACKLOG_CLI_TEAM_LEAD) and the team configuration file:
// a session bound to another repository and branch still creates, edits, reads, archives, moves and orders every item. Only `backlog team`
// reads them. Local bare repositories, items made with the CLI.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const BOUND = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/other', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'nowhere', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' };

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'plain-env-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(home, 'teams.json'), JSON.stringify({ t1: { lead: 'lead', members: ['ann'] } }));
  return { t, home, cons };
}
const plain = (f, args, env = BOUND) => cli(args, { cwd: f.cons, tmp: f.t, env, plain: true });
const ok = (f, args, env) => { const r = plain(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none'];
const rows = f => JSON.parse(ok(f, ['list', 'all-branches', '--json']).stdout).phases;

test('new files the item under this repository and branch, whatever the team environment says', () => {
  const f = fixture();
  ok(f, NEW('first'));
  const [item] = rows(f);
  assert.equal(item.repository, 'acme/demo');
  assert.equal(item.branch, 'main');
  assert.equal(item.front_matter?.team ?? undefined, undefined);
});

test('update edits an item outside the bound repository and branch', () => {
  const f = fixture();
  ok(f, NEW('first'), {});
  ok(f, ['update', '1', '--append', 'a note']);
  ok(f, ['update', '1', '--summary', 'changed']);
});

test('query lists the items of this repository and branch, not only the bound ones', () => {
  const f = fixture();
  ok(f, NEW('first'), {});
  assert.deepEqual(rows(f).map(r => r.slug), ['001-first']);
});

test('archive takes an item outside the bound repository and branch', () => {
  const f = fixture();
  ok(f, NEW('first'), {});
  ok(f, ['update', '1', '--status', 'closed']);
  ok(f, ['archive', '1']);
});

test('move takes an item to another repository though the session is bound to a different one', () => {
  const f = fixture();
  ok(f, NEW('first'), {});
  ok(f, ['move', '1', '--to-repository', 'acme/elsewhere']);
});

test('the order of the queue is every open item\'s, not the bound ones only', () => {
  const f = fixture();
  for (const name of ['one', 'two', 'three']) ok(f, NEW(name), {});
  ok(f, ['update', '3', '--priority', '0']);
  assert.deepEqual(rows(f).filter(r => r.status === 'pending').sort((a, b) => a.priority - b.priority).map(r => r.slug), ['003-three', '001-one', '002-two']);
});

test('an unreadable team configuration is reported under backlog team and nowhere else', () => {
  const f = fixture();
  ok(f, NEW('first'), {});
  writeFileSync(join(f.home, 'teams.json'), '{ not json');
  for (const args of [['list'], ['list', '--json'], ['update', '1', '--summary', 'x'], ['new', '--name', 'two', '--objective', 'o', '--summary', 's', '--depends-on', 'none']]) {
    const r = plain(f, args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stderr, /no JSON/, `${args[0]} does not read the team configuration`);
  }
  mkdirSync(join(f.cons, '.backlog'), { recursive: true });
  writeFileSync(join(f.cons, '.backlog', 'teams.json'), '{ not json'); // the team file the team commands read
  const team = cli(['team', 'query', '--team', 't1'], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: 'ann' }, plain: true });
  assert.match(team.stderr, /teams\.json cannot be read/);
});
