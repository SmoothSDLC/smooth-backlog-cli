// Tests for item 056: `backlog team pop --team <name>`, the team lead's command that takes its team's next work item
// (front matter team = the team, no stage) with the whole item. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as db from '../../src/shared/db.js';
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
  ok(f, ['query', '--phase', reviewed, '--agent', 'zed']); ok(f, ['update', reviewed, '--start-review', '--by', 'zed']);
  const file = join(f.folder, 'phases', `${free}.md`); // a front matter without the two keys: '' (written by hand here, never by the CLI)
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^claimed_by:.*\n/m, '').replace(/^review_state:.*\n/m, ''));
  const again = Object.fromEntries(JSON.parse(ok(f, ['query', '--status', '--json']).stdout).phases.map(r => [r.slug, [r.claimed_by, r.review_state]]));
  assert.deepEqual([again[reviewed], again[free]], [['archy', 'in_review'], ['', '']]);
});

test('team pop: an unclaimed in-progress work item is taken; no output names a file of the backlog', () => {
  const f = fixture();
  const s = make(f, 'started work item'); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['query', '--phase', s, '--agent', 'lead']); ok(f, ['update', s, '--status', 'in_progress']);
  assert.deepEqual([fm(f, s).status, fm(f, s).claimed_by], ['in_progress', '']);
  const j = run(f, ['team', 'pop', '--team', 't1', '--json']); const text = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(JSON.parse(j.stdout).action, 'claim'); assert.equal(text.status, 0, text.stderr);
  for (const out of [j.stdout, j.stderr, text.stdout, text.stderr]) assert.ok(!out.includes('phases/') && !out.includes(f.home), out);
});

test('item 061: query --phase --json names the team fields an item lacks', () => {
  const f = fixture();
  const full = make(f, 'complete item');
  const bare = ok(f, ['new', '--name', 'bare item', '--depends-on', 'none']).stdout.split('created phase phases/')[1].split('.md')[0];
  const [a, b] = JSON.parse(ok(f, ['query', '--phase', `${full},${bare}`, '--json']).stdout);
  assert.deepEqual(a.missing, []);
  assert.deepEqual(b.missing, ['review_refs', 'estimate_min', 'definition_of_done']);
  assert.deepEqual(JSON.parse(ok(f, ['query', '--phase', bare, '--json']).stdout).missing, b.missing);
});

// A wrapper of the CLI for team pop's children (BACKLOG_TEST_SELF): FAIL_ON='<args prefix>' fails that call with FAIL_RC and
// FAIL_ERR; MOVE_AFTER_CLAIM=<branch> makes the read after a successful claim show the item on another branch.
const WRAP = `import { spawnSync } from 'node:child_process'; import { existsSync, writeFileSync } from 'node:fs';
const bin = ${JSON.stringify(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js'))};
const args = process.argv.slice(2); const e = process.env;
if (e.FAIL_ON && args.join(' ').startsWith(e.FAIL_ON)) { process.stderr.write(e.FAIL_ERR + '\\n'); process.exit(Number(e.FAIL_RC)); }
if (e.CLEAR_ON_READ && args[0] === 'query' && args.includes('--phase') && !existsSync(e.MOVE_MARK + '.cleared')) {
  writeFileSync(e.MOVE_MARK + '.cleared', '1'); // another agent takes the item out of the team just before the lead reads it
  spawnSync(process.execPath, [bin, 'update', args[args.indexOf('--phase') + 1], '--set-team', ''], { env: { ...e, QWEN_CODE_AGENT_ID: 'other', TEAM_NAME: '' } });
}
const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: e });
let out = r.stdout;
if (args[0] === 'update' && args.includes('--claim') && r.status === 0 && e.MOVE_AFTER_CLAIM) writeFileSync(e.MOVE_MARK, '1');
if (args[0] === 'query' && args.includes('--phase') && e.MOVE_AFTER_CLAIM && existsSync(e.MOVE_MARK)) {
  const j = JSON.parse(out); j.front_matter.branch = e.MOVE_AFTER_CLAIM; out = JSON.stringify(j);
}
process.stdout.write(out); process.stderr.write(r.stderr); process.exit(r.status ?? 1);
`;

test('team pop: an update error, a failed synchronisation and a scope change are failures (exit 1), never a skip or idle', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'work item'); ok(f, ['update', s, '--set-team', 't1']);
  const seam = extra => ({ BACKLOG_TEST_SELF: wrap, MOVE_MARK: join(f.t, 'moved'), ...extra });
  for (const [extra, text] of [
    [{ FAIL_ON: `update ${s} --claim`, FAIL_RC: '1', FAIL_ERR: '❌ backlog: disk full' }, /team pop stopped: ❌ backlog: disk full/],
    [{ FAIL_ON: 'query --status', FAIL_RC: '3', FAIL_ERR: 'could not synchronise the backlog clone' }, /team pop stopped: could not synchronise/],
  ]) {
    const r = run(f, ['team', 'pop', '--team', 't1', '--json'], seam(extra));
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, text); assert.equal(r.stdout, '');
  }
  assert.equal(fm(f, s).claimed_by, '');
  const moved = run(f, ['team', 'pop', '--team', 't1', '--json'], seam({ MOVE_AFTER_CLAIM: 'elsewhere' }));
  assert.equal(moved.status, 1, moved.stdout + moved.stderr); assert.match(moved.stderr, /changed before team pop could show it/);
});

test('team pop: the claim itself refuses another team\'s item in a team session', () => {
  const f = fixture();
  const s = make(f, 'their work item'); ok(f, ['update', s, '--set-team', 't2']);
  ok(f, ['query', '--phase', s, '--agent', 'lead']);
  const r = run(f, ['update', s, '--claim', 'lead'], { TEAM_NAME: 't1' });
  assert.equal(r.status, 1); assert.match(r.stdout, /belongs to team t2, not to this session's team t1/);
});

test('item 060: ghost rows carry empty team fields; bare files stay paths', () => {
  const f = fixture();
  const a = make(f, 'alpha item'); make(f, 'beta item');
  writeFileSync(join(f.folder, 'phases', 'note.md'), 'a stray note, no front matter\n');
  const con = db.connect(f.folder); con.prepare('UPDATE phase SET path=? WHERE slug=?').run('phases/gone.md', a); con.close();
  const j = JSON.parse(ok(f, ['query', '--status', '--json']).stdout);
  const ghost = j.findings.ghost.find(r => r.slug === a);
  assert.deepEqual([ghost.claimed_by, ghost.review_state], ['', '']);
  for (const v of Object.values(j.findings)) for (const x of v) assert.ok(typeof x === 'string' || ('claimed_by' in x && 'review_state' in x), JSON.stringify(x));
  if (j.findings.bare) assert.ok(j.findings.bare.every(x => typeof x === 'string'), JSON.stringify(j.findings.bare));
});

test('item 061: an item without depends_on names it; an item whose file is gone has missing null', () => {
  const f = fixture();
  const s = make(f, 'hand edited item'); const g = make(f, 'gone item');
  const file = join(f.folder, 'phases', `${s}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^depends_on:.*\n/m, '').replace(/^review_refs:\n(?:- .*\n)*/m, '').replace(/^review_refs:.*\n/m, ''));
  rmSync(join(f.folder, 'phases', `${g}.md`));
  assert.ok(!existsSync(join(f.folder, 'phases', `${g}.md`)));
  const [x, y] = JSON.parse(ok(f, ['query', '--phase', `${s},${g}`, '--json']).stdout);
  assert.deepEqual(x.missing, ['review_refs', 'depends_on']);
  assert.equal(y.missing, null);
  assert.equal(JSON.parse(ok(f, ['query', '--phase', g, '--json']).stdout).missing, null);
  ok(f, ['query', '--phase', g, '--json']);
  writeFileSync(file, 'the front matter is gone\n'); // a file the CLI cannot read as an item
  assert.equal(JSON.parse(ok(f, ['query', '--phase', s, '--json']).stdout).missing, null);
});
test('item 056: in a team session a claim takes only an item of the session\'s team in its repository', () => {
  const f = fixture();
  const free = make(f, 'no team item'); ok(f, ['query', '--phase', free, '--agent', 'lead']);
  const r = run(f, ['update', free, '--claim', 'lead'], { TEAM_NAME: 't1' });
  assert.equal(r.status, 1); assert.match(r.stdout, /belongs to no team; this session's team t1/);
  ok(f, ['update', free, '--claim', 'lead']); // outside a team session the claim is as before
});

test('team pop: an item taken out of the team before the read is skipped, never claimed; a detached HEAD is refused', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'work item'); ok(f, ['update', s, '--set-team', 't1']);
  const p = pop(f, { BACKLOG_TEST_SELF: wrap, MOVE_MARK: join(f.t, 'm'), CLEAR_ON_READ: '1' }, '--team', 't1');
  assert.deepEqual([p.action, p.status, fm(f, s).team ?? '', fm(f, s).claimed_by], ['idle', 3, '', '']);
  assert.match(p.skipped[0].reason, /changed since it was listed/);
  spawnSync('git', ['checkout', '-q', '--detach'], { cwd: f.cons });
  const r = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /team pop needs a branch/);
});

test('item 061: an archived item whose file lost its front matter has missing null too', () => {
  const f = fixture();
  const s = make(f, 'archived item'); ok(f, ['archive', s.split('-')[0], '--force']);
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const file = walk(join(f.folder, 'archive')).find(x => x.endsWith(`${s}.md`));
  assert.ok(file, 'the archived file'); writeFileSync(file, 'no front matter\n');
  assert.equal(JSON.parse(ok(f, ['query', '--phase', s, '--json']).stdout).missing, null);
});
