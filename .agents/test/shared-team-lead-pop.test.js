// Tests for `backlog team pop --team <name>`, the team lead's command that takes its team's next work item
// (front matter team = the team, no stage) with the whole item. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, consumer, itemPath, sharedBacklog, readItem, changeItem, readStored, writeStored } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-lead-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' };
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, SMOOTH_BACKLOG_CLI_AGENT: env.SMOOTH_BACKLOG_CLI_TEAM_LEAD ?? 'lead', ...env } }); // the caller is the lead unless the test names another agent
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0];
// another team takes an item: the one place a refining slice changes team, written to the file the way an earlier build left it
const moveTeam = (f, slug, team) => {
  const file = itemPath(f.folder, slug);
  changeItem(file, { fm: { team } });
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'move team'], ['push', '-q']]) spawnSync('git', args, { cwd: f.home, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
};
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;
const pop = (f, env, ...args) => { const r = run(f, ['team', 'pop', '--json', ...args], env); assert.ok([0, 3].includes(r.status), r.stdout + r.stderr); return { ...JSON.parse(r.stdout), status: r.status }; };

test('team pop: the lead claims its team\'s first work item in the work order, then continues it, with the whole item', () => {
  const f = fixture();
  const late = make(f, 'late work item'); const early = make(f, 'early work item'); const other = make(f, 'other team item');
  for (const [s, t] of [[late, 't1'], [early, 't1'], [other, 't2']]) ok(f, ['update', s, '--set-team', t]);
  ok(f, ['show', early, '--agent', 'lead']); ok(f, ['update', early, '--priority', '0']);
  let p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.status, fm(f, early).claimed_by], ['claim', early, 0, 'lead']);
  assert.deepEqual(Object.keys(p), ['action', 'item', 'seq', 'team', 'repository', 'branch', 'instruction', 'claimed', 'blocked', 'held', 'marked', 'skipped', 'front_matter', 'body', 'status']); // status: added by pop() here
  assert.ok(p.body.includes('Body of early work item.') && p.front_matter.owner === 'lead', JSON.stringify(p));
  assert.match(p.instruction, /refine it, and split it only when it is too big for one member/);
  assert.match(p.instruction, new RegExp(`backlog new --split-from ${early}`));
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, fm(f, late).claimed_by], ['continue', early, '']);
  const child = make(f, 'child', '--split-from', early); // a split item carries a stage: the members' work, never the lead's
  assert.equal(fm(f, child).status, 'new');
  ok(f, ['show', early, '--agent', 'lead']); ok(f, ['update', early, '--release', 'lead']); ok(f, ['update', early, '--set-team', '']); // no longer the team's
  ok(f, ['show', child, '--agent', 'lead']); moveTeam(f, child, 't2'); // nor is its slice: the next work item has none of its own yet
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item], ['claim', late]);
  const text = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.startsWith(`continue ${late}\n`) && text.stdout.includes(`--- item ${late}: body ---\n`), text.stdout);
});

test('team pop records the continuation claim when the lead\'s earlier session holds the work item', () => {
  const f = fixture();
  const s = make(f, 'continuation work item'); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['show', s, '--agent', 'zed:01']);
  ok(f, ['update', s, '--claim', 'zed:01'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:01' }); // the lead's earlier session holds it (only the lead's own claim takes an unrefined work item)
  const p = pop(f, { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:02' }, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.status], ['continue', s, 0]);
  assert.equal(fm(f, s).claimed_by, 'zed:02', 'the continuation records the new session as the holder');
  assert.deepEqual(fm(f, s).session_authors, ['zed:01', 'zed:02'], 'the earlier session stays in the list');
});

test('team pop exits 1 when the continuation claim is handed back before the final read', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'handed back work item'); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['show', s, '--agent', 'zed:01']);
  ok(f, ['update', s, '--claim', 'zed:01'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:01' }); // the lead's earlier session holds it (only the lead's own claim takes an unrefined work item)
  const r = run(f, ['team', 'pop', '--team', 't1'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:02', SMOOTH_BACKLOG_CLI_TEST_SELF: wrap, HAND_BACK_AFTER_CLAIM: '1', HAND_BACK_TO: 'zed:01' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /changed before team pop could show it/);
  assert.equal(r.stdout, '', 'no success output: the item is not presented as held');
  assert.equal(fm(f, s).claimed_by, 'zed:01', 'the hand-back stands: the earlier session keeps holding');
});

test('team pop exits 1 when the held item is reassigned to another session of the same card before the final read', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'exact holder work item'); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['show', s, '--agent', 'zed:02']);
  ok(f, ['update', s, '--claim', 'zed:02'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:02' }); // the lead's own session holds it: the call makes no claim
  const r = run(f, ['team', 'pop', '--team', 't1'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:02', SMOOTH_BACKLOG_CLI_TEST_SELF: wrap, MOVE_MARK: join(f.t, 'reassigned'),
    REASSIGN_ON_READ: s, REASSIGN_TO: 'zed:03', REASSIGN_BY: 'zed:02' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /changed before team pop could show it/);
  assert.equal(r.stdout, '', 'no success output: the item is not presented as held');
  assert.equal(fm(f, s).claimed_by, 'zed:03', 'the other session of the same card holds the item');
});

test('team pop exits 1 when the continuation claim is refused; the earlier session keeps holding', () => {
  const f = fixture();
  const dep = make(f, 'open dependency');
  const s = make(f, 'refused continuation item'); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['show', s, '--agent', 'zed:01']);
  ok(f, ['update', s, '--claim', 'zed:01'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:01' }); // the lead's earlier session holds it (only the lead's own claim takes an unrefined work item)
  ok(f, ['show', s, '--agent', 'zed:01']);
  ok(f, ['update', s, '--set-depends-on', dep.split('-')[0], '--by', 'zed:01']); // an undone dependency: the continuation claim is refused
  const r = run(f, ['team', 'pop', '--team', 't1'], { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'zed:02' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /the continuation claim of .* was not recorded.*dependencies not done/);
  assert.equal(r.stdout, '', 'no success output: the item is not presented as held');
  assert.equal(fm(f, s).claimed_by, 'zed:01', 'the earlier session keeps holding');
});

test('team pop: an item whose claim is refused is named and skipped; nothing left is idle with exit 3', () => {
  const f = fixture();
  const dep = make(f, 'open dependency');
  const blocked = make(f, 'blocked work item', '--depends-on', dep.split('-')[0]);
  ok(f, ['update', blocked, '--set-team', 't1']);
  ok(f, ['show', blocked, '--agent', 'lead']); ok(f, ['update', blocked, '--priority', '0']);
  let p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.status], ['idle', null, 3]);
  assert.equal(p.skipped.length, 1); assert.equal(p.skipped[0].item, blocked); assert.match(p.skipped[0].reason, /depends_on|not done|dependenc/i);
  const free = make(f, 'free work item'); ok(f, ['update', free, '--set-team', 't1']);
  p = pop(f, {}, '--team', 't1');
  assert.deepEqual([p.action, p.item, p.skipped.map(s => s.item)], ['claim', free, [blocked]]);
  const nobody = run(f, ['team', 'pop', '--team', 'nobody', '--json']); // a team without an entry in the configuration is refused
  assert.equal(nobody.status, 1); assert.match(nobody.stdout, /team nobody is not configured in the backlog configuration/);
});

test('team pop: only the lead, only its team, only itself', () => {
  const f = fixture();
  for (const [args, env, text] of [
    [['team', 'pop'], {}, /needs --team/],
    [['team'], {}, /needs a subcommand/],
    [['team', 'pop', '--team', 't1'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't2' }, /team t2 \(SMOOTH_BACKLOG_CLI_TEAM_NAME\), not t1/],
    [['team', 'pop', '--team', 't1', '--agent', 'ann'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_AGENT: 'bob' }, /you are bob/],
    [['team', 'pop', '--team', 't1', '--bogus'], {}, /unrecognized arguments: --bogus/],
  ]) {
    const r = run(f, args, env);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`); assert.match(r.stderr, text);
  }
});

test('query --status --json rows carry claimed_by and review_state', () => {
  const f = fixture();
  const held = make(f, 'held item'); const reviewed = make(f, 'reviewed item'); const free = make(f, 'free item');
  ok(f, ['show', reviewed, '--agent', 'bob']); ok(f, ['update', reviewed, '--claim', 'bob']);
  ok(f, ['update', reviewed, '--request-review', 'any', '--note', 'commit abc', '--by', 'bob']); // it waits: bob may pull new work
  ok(f, ['show', held, '--agent', 'bob']); ok(f, ['update', held, '--claim', 'bob']);
  const rows = Object.fromEntries(JSON.parse(ok(f, ['list', '--json']).stdout).phases.map(r => [r.slug, [r.claimed_by, r.review_state]]));
  assert.deepEqual(rows[held], ['bob', 'none']);
  assert.deepEqual(rows[reviewed], ['bob', 'requested']);
  assert.deepEqual(rows[free], ['', 'none']);
  ok(f, ['show', reviewed, '--agent', 'zed']); ok(f, ['update', reviewed, '--start-review', '--by', 'zed']);
  const file = itemPath(f.folder, free); // a front matter without the two keys: '' (written by hand here, never by the CLI)
  const stored = readStored(file); for (const k of ['owner', 'owned_since', 'review_state']) delete stored.fm[k]; writeStored(file, stored.fm, stored.body);
  const again = Object.fromEntries(JSON.parse(ok(f, ['list', '--json']).stdout).phases.map(r => [r.slug, [r.claimed_by, r.review_state]]));
  assert.deepEqual([again[reviewed], again[free]], [['bob', 'in_review'], ['', '']]);
});

test('team pop: an unclaimed in-progress work item is taken; no output names a file of the backlog', () => {
  const f = fixture();
  const s = make(f, 'started work item'); ok(f, ['update', s, '--status', 'in_progress']); ok(f, ['update', s, '--set-team', 't1']);
  ok(f, ['show', s, '--agent', 'lead']);
  assert.deepEqual([fm(f, s).status, fm(f, s).claimed_by], ['in progress', '']);
  const j = run(f, ['team', 'pop', '--team', 't1', '--json']); const text = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(JSON.parse(j.stdout).action, 'claim'); assert.equal(text.status, 0, text.stderr);
  for (const out of [j.stdout, j.stderr, text.stdout, text.stderr]) assert.ok(!out.includes('phases/') && !out.includes(f.home), out);
});

test('query --phase --json names the team fields an item lacks', () => {
  const f = fixture();
  const full = make(f, 'complete item');
  const bare = ok(f, ['new', '--name', 'bare item', '--depends-on', 'none']).stdout.split('created phase ')[1].split(' ')[0];
  const [a, b] = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', `${full},${bare}`, '--json']).stdout);
  assert.deepEqual(a.missing, []);
  assert.deepEqual(b.missing, ['review_refs', 'estimate_min', 'definition_of_done']);
  assert.deepEqual(JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', bare, '--json']).stdout).missing, b.missing);
});

// A wrapper of the CLI for team pop's children (SMOOTH_BACKLOG_CLI_TEST_SELF): FAIL_ON='<args prefix>' fails that call with FAIL_RC and
// FAIL_ERR; MOVE_AFTER_CLAIM=<branch> makes the read after a successful claim show the item on another branch;
// HAND_BACK_AFTER_CLAIM makes another writer reassign the item to HAND_BACK_TO right after a successful claim.
const WRAP = `import { spawnSync } from 'node:child_process'; import { existsSync, writeFileSync } from 'node:fs';
const bin = ${JSON.stringify(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js'))};
const args = process.argv.slice(2); const e = process.env;
const isUpdate = args[0] === 'team' && args[1] === 'update'; // the claim of team pop is a team update
const isQuery = args[0] === 'team' && args[1] === 'query'; // its reads are team views
if (e.FAIL_ON && args.join(' ').startsWith(e.FAIL_ON)) { process.stderr.write(e.FAIL_ERR + '\\n'); process.exit(Number(e.FAIL_RC)); }
if (e.CLEAR_ON_READ && isQuery && args.includes('--phase') && !existsSync(e.MOVE_MARK + '.cleared')) {
  writeFileSync(e.MOVE_MARK + '.cleared', '1'); // another agent takes the item out of the team just before the lead reads it
  spawnSync(process.execPath, [bin, 'team', 'update', args[args.indexOf('--phase') + 1], '--set-team', '', '--team', 't1', '--agent', 'other'], { env: { ...e, SMOOTH_BACKLOG_CLI_AGENT: 'other', SMOOTH_BACKLOG_CLI_TEAM_NAME: '' } });
}
if (e.REASSIGN_ON_READ && isQuery && args[args.indexOf('--phase') + 1] === e.REASSIGN_ON_READ && !existsSync(e.MOVE_MARK + '.reassigned')) {
  writeFileSync(e.MOVE_MARK + '.reassigned', '1'); // another writer hands the item to another session of the same card just before the lead reads it
  spawnSync(process.execPath, [bin, 'show', e.REASSIGN_ON_READ, '--agent', e.REASSIGN_BY], { env: e }); // a fresh view for the hand-off
  spawnSync(process.execPath, [bin, 'team', 'update', e.REASSIGN_ON_READ, '--reassign', e.REASSIGN_TO, '--by', e.REASSIGN_BY, '--reason', 'reassigned', '--team', 't1'], { env: e });
}
const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: e });
let out = r.stdout;
if (e.HAND_BACK_AFTER_CLAIM && isUpdate && args.includes('--claim') && r.status === 0) {
  const slug = args[2]; const to = e.HAND_BACK_TO; const from = args[args.indexOf('--agent') + 1];
  spawnSync(process.execPath, [bin, 'show', slug, '--agent', from], { env: e }); // a fresh view for the hand-back
  spawnSync(process.execPath, [bin, 'team', 'update', slug, '--reassign', to, '--by', from, '--reason', 'handed back', '--team', 't1'], { env: e }); // another writer hands the item back
}
if (isUpdate && args.includes('--claim') && r.status === 0 && e.MOVE_AFTER_CLAIM) writeFileSync(e.MOVE_MARK, '1');
if (isQuery && args.includes('--phase') && e.MOVE_AFTER_CLAIM && existsSync(e.MOVE_MARK)) {
  const j = JSON.parse(out); j.front_matter.branch = e.MOVE_AFTER_CLAIM; out = JSON.stringify(j);
}
process.stdout.write(out); process.stderr.write(r.stderr); process.exit(r.status ?? 1);
`;

test('team pop: an update error, a failed synchronisation and a scope change are failures (exit 1), never a skip or idle', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'work item'); ok(f, ['update', s, '--set-team', 't1']);
  const seam = extra => ({ SMOOTH_BACKLOG_CLI_TEST_SELF: wrap, MOVE_MARK: join(f.t, 'moved'), ...extra });
  for (const [extra, text] of [
    [{ FAIL_ON: `team update ${s} --team t1 --agent lead --claim`, FAIL_RC: '1', FAIL_ERR: '❌ backlog: disk full' }, /team pop stopped: ❌ backlog: disk full/],
    [{ FAIL_ON: 'team query --team t1 --agent lead --status', FAIL_RC: '3', FAIL_ERR: 'could not synchronise the backlog clone' }, /team pop stopped: could not synchronise/],
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
  ok(f, ['show', s, '--agent', 'lead']);
  const r = run(f, ['update', s, '--claim', 'lead'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' });
  assert.equal(r.status, 1); assert.match(r.stdout, /belongs to team t2, not to this session's team t1/);
});

test('an item without depends_on names it', () => {
  const f = fixture();
  const s = make(f, 'hand edited item');
  const file = itemPath(f.folder, s);
  changeItem(file, { fm: { depends_on: undefined, review_refs: undefined } });
  const x = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', s, '--json']).stdout);
  assert.deepEqual(x.missing, ['review_refs', 'depends_on']);
});

test('in a team session a claim takes only an item of the session\'s team in its repository', () => {
  const f = fixture();
  const free = make(f, 'no team item'); ok(f, ['show', free, '--agent', 'lead']);
  const r = run(f, ['update', free, '--claim', 'lead'], { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1' });
  assert.equal(r.status, 1); assert.match(r.stdout, /belongs to no team; this session's team t1/);
  ok(f, ['update', free, '--claim', 'lead']); // outside a team session the claim is as before
});

test('team pop: an item taken out of the team before the read is skipped, never claimed; a detached HEAD is refused', () => {
  const f = fixture();
  const wrap = join(f.t, 'wrap.mjs'); writeFileSync(wrap, WRAP);
  const s = make(f, 'work item'); ok(f, ['update', s, '--set-team', 't1']);
  const p = pop(f, { SMOOTH_BACKLOG_CLI_TEST_SELF: wrap, MOVE_MARK: join(f.t, 'm'), CLEAR_ON_READ: '1' }, '--team', 't1');
  assert.deepEqual([p.action, p.status, fm(f, s).team ?? '', fm(f, s).claimed_by], ['idle', 3, '', '']);
  assert.match(p.skipped[0].reason, /changed since it was listed/);
  spawnSync('git', ['checkout', '-q', '--detach'], { cwd: f.cons });
  const r = run(f, ['team', 'pop', '--team', 't1']);
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /HEAD is detached/);
});
