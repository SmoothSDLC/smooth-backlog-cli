// Tests for item 056: `backlog team pop --team <name>`, the team lead's command that takes its team's next work item
// (front matter team = the team, no stage) with the whole item. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-lead-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { TEAM_LEAD: 'lead' };
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, ...env } });
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase phases/')[1].split('.md')[0];
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;
const pop = (f, env, ...args) => { const r = run(f, ['team', 'pop', '--json', ...args], env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return { ...JSON.parse(r.stdout), status: r.status }; };

test('team pop: the lead claims its team\'s first work item in the work order, then continues it, with the whole item', () => {
  const f = fixture();
  const late = make(f, 'late work item'); const early = make(f, 'early work item'); const other = make(f, 'other team item');
  for (const [s, t] of [[late, 't1'], [early, 't1'], [other, 't2']]) ok(f, ['update', s, '--set-team', t]);
  ok(f, ['query', '--phase', early, '--agent', 'lead']); ok(f, ['update', early, '--priority', '0']);
  let p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.status, fm(f, early).claimed_by], ['claim', early, 0, 'lead']);
  assert.deepEqual(Object.keys(p), ['action', 'item', 'team', 'repository', 'branch', 'instruction', 'skipped', 'front_matter', 'body', 'status']); // status: added by pop() here
  assert.ok(p.body.includes('Body of early work item.') && p.front_matter.claimed_by === 'lead', JSON.stringify(p));
  assert.match(p.instruction, new RegExp(`refine and split it .*backlog new --split-from ${early}`));
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, fm(f, late).claimed_by], ['continue', early, '']);
  const child = make(f, 'child', '--split-from', early); // a split item carries a stage: the members' work, never the lead's
  assert.equal(fm(f, child).stage, 'refining');
  ok(f, ['query', '--phase', early, '--agent', 'lead']); ok(f, ['update', early, '--release', 'lead']); ok(f, ['update', early, '--set-team', '']); // no longer the team's
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item], ['claim', late]);
  const text = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.startsWith(`continue ${late}\n`) && text.stdout.includes(`--- item ${late}: body ---\n`), text.stdout);
});

test('team pop: an item whose claim is refused is named and skipped; nothing left is idle with exit 3', () => {
  const f = fixture();
  const dep = make(f, 'open dependency');
  const blocked = make(f, 'blocked work item', '--depends-on', dep.split('-')[0]);
  ok(f, ['update', blocked, '--set-team', 't1']);
  ok(f, ['query', '--phase', blocked, '--agent', 'lead']); ok(f, ['update', blocked, '--priority', '0']);
  let p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.status], ['idle', null, 3]);
  assert.equal(p.skipped.length, 1); assert.equal(p.skipped[0].item, blocked); assert.match(p.skipped[0].reason, /depends_on|not done|dependenc/i);
  const free = make(f, 'free work item'); ok(f, ['update', free, '--set-team', 't1']);
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.skipped.map(s => s.item)], ['claim', free, [blocked]]);
  assert.equal(pop(f, {}, '--team', 'nobody').status, 3);
});

test('team pop: only the lead, only its team, only itself', () => {
  const f = fixture();
  for (const [args, env, text] of [
    [['team', 'pop'], {}, /team pop needs --team/],
    [['team'], {}, /subcommand pop/],
    [['team', 'pop', '--team', 't1', '--agent', 'archy'], {}, /only the team lead \(lead; TEAM_LEAD\)/],
    [['team', 'pop', '--team', 't1'], { TEAM_NAME: 't2' }, /team t2 \(TEAM_NAME\), not t1/],
    [['team', 'pop', '--team', 't1'], { QWEN_CODE_AGENT_ID: 'archy@t1' }, /you are archy/],
    [['team', 'pop', '--team', 't1', '--bogus'], {}, /unrecognized arguments: --bogus/],
  ]) {
    const r = run(f, args, env);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.match(r.stderr, text);
  }
});

test('item 060: query --status --json rows carry claimed_by and review_state', () => {
  const f = fixture();
  const held = make(f, 'held item'); const reviewed = make(f, 'reviewed item'); const free = make(f, 'free item');
  ok(f, ['query', '--phase', reviewed, '--agent', 'archy']); ok(f, ['update', reviewed, '--claim', 'archy']);
  ok(f, ['update', reviewed, '--request-review', 'any', '--note', 'commit abc', '--by', 'archy']); // it waits: archy may pull new work
  ok(f, ['query', '--phase', held, '--agent', 'archy']); ok(f, ['update', held, '--claim', 'archy']);
  const rows = Object.fromEntries(JSON.parse(ok(f, ['query', '--status', '--json']).stdout).phases.map(r => [r.slug, [r.claimed_by, r.review_state]]));
  assert.deepEqual(rows[held], ['archy', 'none']);
  assert.deepEqual(rows[reviewed], ['archy', 'requested']);
  assert.deepEqual(rows[free], ['', 'none']);
});
