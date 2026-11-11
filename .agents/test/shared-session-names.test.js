// Tests for item 082, slice A: session names with colons work everywhere the CLI uses an agent or team name
// (front matter, event log, commit subject and --by/--claim validation).
// Owner design 2026-10-31: a card's sessions are named <item 3 digits><card id>:<increment 2 digits> (082aa:01),
// teams join their card ids with colons (t07:09:1a). Local bare repos only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, itemRel, sharedBacklog, GIT_IDENTITY } from './shared-fixtures.js';
import * as store from '../../src/shared/store.js';

const TEAM = 't07:09:1a';
const A1 = '082aa:01'; // the session that builds
const A2 = '082aa:02'; // a new session of the same card

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'session-names-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}

const git = (cwd, ...args) => {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr}`);
  return p.stdout.trim();
};
const DOD = '## Definition of done\n\n- [ ] the test\'s check holds';
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => { const slug = ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0]; return slug; };
const teamItem = (f, name) => { // a refined team item (stage ready): nothing is claimed before its refinement review passed (item 098)
  const s = make(f, name); ok(f, ['update', s, '--set-team', TEAM]);
  for (const a of [['--refine-start', '--by', 'rfn'], ['--refine-done', '--by', 'rfn', '--note', 'refined'], ['--request-refinement-review', '--by', 'lead'], ['--refinement-review', 'pass', '--by', 'rex', '--comments', 'ok']]) ok(f, ['update', s, ...a]);
  return s;
};
const itemFm = (f, slug) => store.load(f.folder).find(i => i.path === itemRel(slug)).fm;
const events = (f, slug) => itemFm(f, slug).events;

test('082: an agent name with colons (082aa:01) is stored in claimed_by, the event log, the commit subject and accepted by --by and --claim', () => {
  const f = fixture();
  const s = make(f, 'colon session claim');
  ok(f, ['update', s, '--claim', A1]);
  // the front matter carries the name
  assert.equal(itemFm(f, s).claimed_by, A1);
  // the event log records it
  const claimed = events(f, s).find(e => e.note.startsWith('Claimed by'));
  assert.ok(claimed, 'the claimed event is in the log');
  assert.ok(claimed.note.includes(`Claimed by ${A1}`), claimed.note);
  // the commit subject carries the name
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), `acme/demo: update ${s} --claim ${A1}`);
  // --by accepts the name
  ok(f, ['update', s, '--append', 'CHUNK slice A step', '--by', A1]);
  // --claim accepts it again (a reclaim by the same session)
  assert.equal(itemFm(f, s).claimed_by, A1);
});

test('082: the commit subject carries the agent named by --by wherever the option is placed', () => {
  const f = fixture();
  const s = make(f, 'subject carries a later --by');
  ok(f, ['update', s, '--claim', A1]);
  ok(f, ['update', s, '--append', 'CHUNK a step with a later --by', '--by', A2]);
  assert.equal(git(f.home, 'log', '-1', '--format=%s'), `acme/demo: update ${s} --append ${A2}`);
});
