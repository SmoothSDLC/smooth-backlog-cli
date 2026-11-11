// `backlog team pop` on the rules engine: what it prints, what it writes, and how it ends. The cases of the rules are replayed in team-commands.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli } from './shared-fixtures.js';
import { TEMPLATES, git, putItem, world } from './team-fixture.js';
import { defaultOf } from '../../src/team/rules/expression.js';
import * as index from '../../src/shared/index.js';

const ENTRY = TEMPLATES.parallel.parallel;
const DEFAULTS = Object.fromEntries(Object.entries(ENTRY.item).map(([f, d]) => [f, defaultOf(d)]));
const QUIET = Object.fromEntries(['TEAM_NAME', 'TEAM_REPOSITORY', 'TEAM_BRANCH', 'AGENT', 'SESSION'].map(n => [`SMOOTH_BACKLOG_CLI_${n}`, '']));
const POP = ['--team', 'parallel', '--agent', 'member-1'];
const ISO = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g;

// A ready item of the team, written and published.
const ready = (w, seq, { branch = 'main', body = '', archived = false, slug = `${String(seq).padStart(3, '0')}-item`, status = 'ready', fields = {} } = {}) => {
  putItem(w.folder, { seq, slug, name: `item ${seq}`, team: 'parallel', repository: 'acme/app', branch, archived, body, fields: { ...DEFAULTS, status, ...fields } }, ENTRY);
};
const order = (w, branches) => writeFileSync(index.file(w.folder), index.text({ branches }));
const entries = seqs => seqs.map(s => ({ seq: s, slug: `${String(s).padStart(3, '0')}-item`, name: `item ${s}`, status: 'ready' }));
const porcelain = w => [git(w.home, 'status', '--porcelain', '-uall'), git(w.cons, 'status', '--porcelain', '-uall')];

test('--dry-run writes nothing and prints what pop prints', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  const before = porcelain(w); const head = git(w.home, 'rev-parse', 'HEAD');
  const dry = w.run([...POP, '--dry-run'], {}, 'pop');
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.deepEqual(porcelain(w), before);
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(w.item(1).fields.status, 'ready');
  const real = w.run(POP, {}, 'pop');
  assert.equal(real.status, 0, real.stdout + real.stderr);
  assert.match(dry.stdout, /^➡️  claim 001-item \(pop entry member-claims, rule [\w-]+\)\n\[1\] 001-item  item 1\n/);
  assert.equal(dry.stdout.replace(ISO, 'T'), real.stdout.replace(ISO, 'T'));
  const json = w.run([...POP, '--dry-run', '--json'], {}, 'pop'); // nothing is left to offer member-1 but the dry run wrote nothing before: the same answer as a real one
  assert.equal(json.status, 3);
});

test('--dry-run --json carries the item as it would be after the step', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  const r = w.run([...POP, '--dry-run', '--json'], {}, 'pop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['action', 'item', 'entry', 'rule', 'item_file']);
  assert.equal(out.item_file.fields.holder, 'member-1');
  assert.equal(w.item(1).fields.holder, DEFAULTS.holder);
});

test('idle exits 3 and prints only {"action":"idle"}', t => {
  const w = world(t);
  const r = w.run([...POP, '--json'], {}, 'pop');
  assert.equal(r.status, 3);
  assert.equal(r.stdout, '{"action":"idle"}\n');
  assert.equal(r.stderr, '');
  const text = w.run(POP, {}, 'pop');
  assert.equal(text.status, 3);
  assert.equal(text.stdout, 'ℹ️  idle: nothing for member-1 in team parallel\n');
});

test('a refused push exits 1, never 3, and prints no idle answer', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  w.refuse();
  const r = w.run([...POP, '--json'], {}, 'pop');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /The change was not published/);
  assert.equal(w.item(1).fields.status, 'ready');
});

test('a failed pull exits 1', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  git(w.home, 'remote', 'set-url', 'origin', join(w.tmp, 'no-such-origin.git'));
  const r = w.run([...POP, '--json'], {}, 'pop');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '');
});

test('--dry-run with an origin that cannot be reached answers from the local copy with the offline warning', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  git(w.home, 'remote', 'set-url', 'origin', join(w.tmp, 'no-such-origin.git'));
  const r = w.run([...POP, '--dry-run', '--json'], {}, 'pop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /origin offline, local backlog updates may be behind and need manual remediation later/);
  assert.equal(JSON.parse(r.stdout).item, 1);
});

test('the item claimed by pop is held by the agent after it (the step is applied once, one commit)', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  const count = () => Number(git(w.home, 'rev-list', '--count', 'HEAD'));
  const before = count();
  const r = w.run(POP, {}, 'pop');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(count(), before + 1);
  assert.equal(git(w.home, 'log', '-1', '--format=%s').split(': ').at(-1), 'team claim 001-item');
  const item = w.item(1);
  assert.equal(item.fields.holder, 'member-1');
  assert.equal(item.history.length, 1);
  assert.equal(item.history[0].step, 'claim');
  assert.equal(item.history[0].by, 'member-1');
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), git(w.bare, 'rev-parse', 'main')); // published
});

test('a credential in a field is redacted in the text and the JSON, and the JSON stays valid after a non-ASCII character', t => {
  const w = world(t);
  ready(w, 1, { body: 'Clone https://user:hunter2secret@host/x then check the café menu — 日本語.' }); w.publish('seed');
  const text = w.run([...POP, '--dry-run'], {}, 'pop');
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.ok(!text.stdout.includes('hunter2secret'), text.stdout);
  assert.ok(text.stdout.includes('café') && text.stdout.includes('日本語'));
  const json = w.run([...POP, '--dry-run', '--json'], {}, 'pop');
  assert.ok(!json.stdout.includes('hunter2secret'), json.stdout);
  const out = JSON.parse(json.stdout);
  assert.ok(out.item_file.body.includes('café') && out.item_file.body.includes('日本語'));
});

test('--json is serialized from the redacted values and printed as is: a URL field then an email field keep every field, a credential is still redacted', t => {
  const w = world(t);
  ready(w, 1, { fields: { checker: 'http://example.com', handoff: 'me@b.com see https://user:hunter2secret@host/x' } }); w.publish('seed');
  for (const flags of [['--dry-run', '--json'], ['--json']]) {
    const r = w.run([...POP, ...flags], {}, 'pop');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const f = JSON.parse(r.stdout).item_file.fields;
    assert.equal(f.checker, 'http://example.com');
    assert.equal(f.handoff, 'me@b.com see https://host/x');
    assert.ok(!r.stdout.includes('hunter2secret'), r.stdout);
  }
});

test('an item number held by a live and an archived item: pop offers the live one once and never the archived one', t => {
  const w = world(t);
  ready(w, 7, { slug: '007-live' }); ready(w, 7, { slug: '007-old', archived: true }); w.publish('seed');
  const archived = () => git(w.home, 'show', 'HEAD:acme/app/archive/phases/007-old.json');
  const old = archived();
  const first = w.run([...POP, '--json'], {}, 'pop');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(JSON.parse(first.stdout).item_file.slug, '007-live');
  assert.equal(archived(), old);
  assert.equal(w.item(7).history.length, 1);
  assert.equal(w.run([...POP, '--json'], {}, 'pop').status, 3); // the live item is member-1's now and the archived one is never offered: idle
  assert.equal(archived(), old);
  assert.equal(git(w.home, 'ls-files', 'acme/app/phases').split('\n').length, 1);
});

test('pop on branch feature/a-b offers only that branch\'s items, in index order', t => {
  const w = world(t);
  git(w.cons, 'checkout', '-q', '-b', 'feature/a-b');
  ready(w, 1, { branch: 'main' }); ready(w, 2, { branch: 'feature/a-b' }); ready(w, 3, { branch: 'feature/a-b' }); ready(w, 4, { branch: 'feature/a' });
  order(w, { main: entries([1]), 'feature/a-b': entries([3, 2]), 'feature/a': entries([4]) });
  w.publish('seed');
  const first = JSON.parse(w.run(['--team', 'parallel', '--agent', 'member-1', '--json'], {}, 'pop').stdout);
  assert.equal(first.item, 3);
  const second = JSON.parse(w.run(['--team', 'parallel', '--agent', 'member-2', '--json'], {}, 'pop').stdout);
  assert.equal(second.item, 2);
  const third = w.run(['--team', 'parallel', '--agent', 'member-3', '--json'], {}, 'pop');
  assert.equal(third.status, 3, third.stdout);
  assert.equal(w.item(1).fields.status, 'ready'); assert.equal(w.item(4).fields.holder, DEFAULTS.holder);
});

test('pop from a subdirectory of the consumer checkout acts as from its top', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  mkdirSync(join(w.cons, 'src'), { recursive: true });
  const r = cli(['team', 'pop', ...POP, '--json'], { cwd: join(w.cons, 'src'), tmp: w.tmp, plain: true, env: QUIET });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).item, 1);
  assert.equal(w.item(1).fields.holder, 'member-1');
});

test('--lead, --scope, --all and --claim-now are unrecognized arguments (exit 2)', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  for (const extra of [['--lead', 'x'], ['--scope', 'branch'], ['--all'], ['--claim-now']]) {
    const r = w.run([...POP, ...extra], {}, 'pop');
    assert.equal(r.status, 2, extra.join(' '));
    assert.equal(r.stderr, `❌ backlog: unrecognized arguments: ${extra[0]}\n`);
    assert.equal(r.stdout, '');
  }
  assert.equal(w.item(1).fields.status, 'ready');
});

test('a team without an entry in the team file is refused and nothing is written', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  const before = porcelain(w);
  const r = w.run(['--team', 'ghost', '--agent', 'member-1', '--json'], {}, 'pop');
  assert.notEqual(r.status, 0, r.stdout);
  assert.notEqual(r.status, 3);
  assert.match(r.stdout + r.stderr, /ghost/);
  assert.deepEqual(porcelain(w), before);
});

test('input echoed in a result or an error is redacted: --branch and --agent given as a URL with a password', t => {
  const w = world(t);
  ready(w, 1); w.publish('seed');
  const url = 'https://user:review_dummy@host/path';
  for (const args of [['--team', 'parallel', '--agent', 'x', '--branch', url, '--dry-run'], ['--team', 'parallel', '--agent', 'x', '--branch', url, '--dry-run', '--json'], ['--team', 'parallel', '--agent', url, '--dry-run'], ['--team', 'parallel', '--agent', url, '--dry-run', '--json']]) {
    const r = w.run(args, {}, 'pop');
    assert.doesNotMatch(r.stdout + r.stderr, /review_dummy|user:/, args.join(' '));
    assert.ok(r.stdout.length > 0, `${args.join(' ')} printed nothing (${r.stderr})`);
  }
});
