// The cases of the rules (fixtures/team-rules/rule-cases.json) through the real team commands: each case is set up as a folder of items, a team file and a command
// line, run as a child process, and the exit, the printed text and the written items are compared. `new` is replayed here; the update and pop cases are added by
// the commands that run them. A case whose team file fails validation cannot run through a command (the command refuses the file before it evaluates): those are
// EVALUATOR_ONLY and stay with team-rules-cases.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, fileOf, git, inside, putItem, readJson, world } from './team-fixture.js';
import { validate, errors } from '../../src/team/rules/validate.js';
import { defaultOf } from '../../src/team/rules/expression.js';
import * as index from '../../src/shared/index.js';

const { cases } = readJson('./fixtures/team-rules/rule-cases.json');
const NOW = '2026-11-01T00:00:00Z';
const defaultsOf = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
const fileOf_ = c => (c.rule_set === 'inline' ? c.given.team_file : TEMPLATES[c.rule_set]);

// The inline cases whose team file fails validation: evaluator only. Counted, so a case is never silently dropped.
const EVALUATOR_ONLY = ['INL-01', 'INL-02', 'INL-03', 'INL-04', 'INL-05', 'INL-06', 'INL-07', 'INL-08', 'INL-09'];
const RUN_KINDS = ['new']; // grown by update and pop
const inlineFails = c => c.rule_set === 'inline' && errors(validate(c.given.team_file)).length > 0;
const viaCommand = cases.filter(c => RUN_KINDS.includes(c.command.run) && !EVALUATOR_ONLY.includes(c.id));

test('the evaluator-only cases are the nine inline cases whose team file fails validation, none of them a new case', () => {
  assert.equal(EVALUATOR_ONLY.length, 9);
  assert.deepEqual(cases.filter(c => c.command.run !== 'validate' && inlineFails(c)).map(c => c.id).sort(), [...EVALUATOR_ONLY].sort());
  assert.ok(cases.filter(c => c.command.run === 'new').every(c => !EVALUATOR_ONLY.includes(c.id) && !inlineFails(c)));
  assert.equal(cases.filter(c => c.command.run === 'new').length, 25);
});

// The items of a case as files: the definition's defaults unless the case is raw (the harness of the evaluator does the same).
function seed(w, c, team, entry, subst) {
  const defaults = Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
  const touched = new Set();
  for (const i of c.given.items) {
    const own = (i.team ?? team) === team;
    const repository = i.repository ?? 'acme/app';
    const folder = repository === 'acme/app' ? w.folder : join(w.home, ...repository.split('/'));
    putItem(folder, { seq: i.seq, slug: `${String(i.seq).padStart(3, '0')}-item`, name: i.name ?? `item ${i.seq}`, team: i.team ?? team, repository, branch: i.branch ?? 'main',
      archived: Boolean(i.archived), body: i.body ?? '', fields: subst({ ...(!c.given.raw && own ? defaults : {}), ...i.fields }) }, entry);
    touched.add(folder);
  }
  if (c.given.last !== undefined) { mkdirSync(w.folder, { recursive: true }); writeFileSync(join(w.folder, 'numbers.json'), `${JSON.stringify({ last: c.given.last })}\n`); touched.add(w.folder); }
  if (c.given.order) { // the order of the branch main, as index.json holds it
    const bySeq = new Map(c.given.items.map(i => [i.seq, i]));
    const entries = c.given.order.map(s => ({ seq: s, slug: `${String(s).padStart(3, '0')}-item`, name: bySeq.get(s).name ?? `item ${s}`, status: (bySeq.get(s).fields ?? {}).status ?? defaults.status }));
    mkdirSync(w.folder, { recursive: true }); writeFileSync(index.file(w.folder), index.text({ branches: { main: entries } }));
  }
  if (touched.size || c.given.order) w.publish('seed');
}

// session.commit: the two shas a case names are replaced by the head commits of the working copy (two commits, the second is HEAD).
function substitution(w, c) {
  if (!/abc1234|def5678/.test(JSON.stringify(c))) return v => v;
  git(w.cons, 'commit', '-q', '--allow-empty', '-m', 'one'); const one = git(w.cons, 'rev-parse', 'HEAD');
  git(w.cons, 'commit', '-q', '--allow-empty', '-m', 'two'); const two = git(w.cons, 'rev-parse', 'HEAD');
  const swap = v => (typeof v === 'string' ? v.replaceAll('abc1234', one).replaceAll('def5678', two) : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
  return swap;
}

// The command line of a case: the team is the first key of the file, the agent comes from flags.agent, every other flag and argument is passed by name.
function commandLine(cmd, team) {
  const flags = { team, ...cmd.flags };
  const line = [];
  for (const [k, v] of Object.entries({ ...flags, ...(cmd.session?.id ? { session: cmd.session.id } : {}) })) line.push(`--${k}`, ...(v === true ? [] : [String(v)]));
  for (const [k, v] of Object.entries(cmd.args ?? {})) line.push(`--${k}`, String(v));
  return line;
}

for (const c of viaCommand) {
  test(`${c.id}: ${c.rule ?? 'coded'} through backlog team new`, t => {
    const file = fileOf_(c); const team = Object.keys(file)[0]; const entry = file[team];
    const w = world(t, file);
    const subst = substitution(w, c);
    const run = JSON.parse(JSON.stringify(subst(c)));
    seed(w, run, team, entry, x => x);
    const r = w.run(commandLine(run.command, team), run.command.env ?? {});
    const want = run.expect;
    assert.equal(r.status, want.exit, `${r.stdout}${r.stderr}`);
    if (want.exit === 0) {
      assert.match(r.stdout.split('\n')[0], new RegExp(`^✅ created \\S+ \\(seq \\d+\\) for team ${team}, rule ${want.rule}$`));
      assert.equal(r.stderr, '');
      assert.equal(git(w.home, 'status', '--short'), ''); // published
    } else {
      if (want.exit === 1) { assert.equal(r.stdout, `❌ ${want.text}\n`); assert.equal(r.stderr, ''); }
      if (want.exit === 2) { assert.equal(r.stderr, `❌ backlog: ${want.text}\n`); assert.equal(r.stdout, ''); }
      assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false); // a refused command writes no SHA
      assert.equal(git(w.home, 'status', '--short'), ''); // nothing written
      assert.equal(w.files().length, run.given.items.filter(i => (i.repository ?? 'acme/app') === 'acme/app' && !i.archived).length);
    }
    for (const [seq, fields] of Object.entries(want.items ?? {})) {
      const path = fileOf(w.folder, seq); assert.ok(path, `item ${seq} is written`);
      const got = JSON.parse(readFileSync(path, 'utf8')).fields;
      for (const [f, v] of Object.entries(fields)) assert.deepEqual(got[f], v, `item ${seq} field ${f}`);
      // every other field: a created item holds the definition's default (but for what the command itself sets: its arguments, the status, the links), a seeded item what the case gave it
      const set = ['status', 'parent', 'depends_on', ...Object.keys(run.command.args ?? {})];
      const seeded = run.given.items.find(i => i.seq === Number(seq));
      for (const f of Object.keys(entry.item)) if (!(f in fields) && (seeded || !set.includes(f))) assert.deepEqual(got[f], seeded ? { ...defaultsOf(entry), ...seeded.fields }[f] : defaultsOf(entry)[f], `item ${seq} field ${f} (not named by the case)`);
    }
    for (const i of run.given.items.filter(x => !(String(x.seq) in (want.items ?? {})) && (x.repository ?? 'acme/app') === 'acme/app' && (x.team ?? team) === team)) { // an item the case does not mention is as seeded
      const { children, ...kept } = JSON.parse(readFileSync(fileOf(w.folder, i.seq), 'utf8')).fields; // a parent gets its child listed by the rule
      const { children: _, ...was } = { ...defaultsOf(entry), ...i.fields };
      assert.deepEqual(kept, was, `item ${i.seq} unchanged`);
    }
    if (want.place) { // before/after: next to the item named, first/last: at the ends of the branch list
      const slugs = index.read(w.folder).branches.main.map(e => e.seq);
      const created = Math.max(...Object.keys(want.items).map(Number));
      const [kind, target] = Object.entries(want.place)[0];
      const at = slugs.indexOf(created);
      if (kind === 'before') assert.equal(slugs[at + 1], Number(target));
      if (kind === 'after') assert.equal(slugs[at - 1], Number(target));
      if (kind === 'first') assert.equal(at, 0);
      if (kind === 'last') assert.equal(at, slugs.length - 1);
    }
    if (run.given.last !== undefined && want.exit !== 0) assert.deepEqual(JSON.parse(readFileSync(join(w.folder, 'numbers.json'), 'utf8')), { last: run.given.last }); // the counter is not consumed
  });
}

test('the harness runs every new case it can, none silently dropped: 25 new cases through the command', () => {
  assert.equal(viaCommand.length, 25);
  assert.equal(new Set(viaCommand.map(c => c.id)).size, 25);
});

// Every file under a folder with its bytes: a refused command must leave this exactly as it was.
function snapshot(dir) {
  const out = {};
  const walk = rel => {
    if (!existsSync(join(dir, rel))) return;
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const p = join(rel, e.name);
      if (e.isDirectory()) walk(p); else out[p] = readFileSync(join(dir, p), 'utf8');
    }
  };
  walk('.');
  return out;
}
const OK = ['--team', 'parallel', '--agent', 'member-1', '--name', 'x', '--estimate', '5'];

test('the first new writes the SHA into .backlog/config.json and leaves it, and the team file, uncommitted in the consumer checkout', t => {
  const w = world(t);
  const head = git(w.cons, 'rev-parse', 'HEAD');
  const r = w.run(OK);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(w.config().teams_file_sha, /^[0-9a-f]{64}$/);
  assert.equal(git(w.cons, 'rev-parse', 'HEAD'), head);
  assert.match(git(w.cons, 'status', '--short', '-uall'), /\.backlog\/config\.json/);
  assert.match(git(w.cons, 'status', '--short', '-uall'), /\.backlog\/teams\.json/);
});

test('a refused push: exit 3, the folder byte-identical, the counter not consumed, .backlog/config.json and the team file unchanged', t => {
  const w = world(t);
  const first = w.run([...OK.slice(0, -4), '--name', 'seeded', '--estimate', '5']); assert.equal(first.status, 0, first.stdout + first.stderr); // a folder with content and a SHA already
  const folder = snapshot(w.folder); const config = readFileSync(join(w.cons, '.backlog', 'config.json'), 'utf8'); const teams = readFileSync(w.teamFile, 'utf8'); const head = git(w.home, 'rev-parse', 'HEAD');
  w.refuse();
  const r = w.run(OK);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /The change was not published/);
  assert.equal(r.stdout, '');
  assert.deepEqual(snapshot(w.folder), folder);
  assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  assert.equal(git(w.home, 'status', '--short'), '');
  assert.equal(readFileSync(join(w.cons, '.backlog', 'config.json'), 'utf8'), config);
  assert.equal(readFileSync(w.teamFile, 'utf8'), teams);
  assert.deepEqual(JSON.parse(folder['numbers.json']), { last: 1 }); // the counter file is the one the first run wrote
  git(w.bare, 'config', 'core.hooksPath', '/dev/null'); // the hook is lifted: the next run takes the number the refused one did not consume
  assert.match(w.run(OK).stdout, /^✅ created 002-x \(seq 2\)/);
});

test('a refused push with the backlog inside the code repository: exit 3, the folder, config.json and the lead\'s uncommitted team file as before, no commit left', t => {
  const w = inside(t);
  const edited = JSON.stringify({ ...TEMPLATES.parallel, draft: TEMPLATES.parallel.parallel });
  writeFileSync(w.teamFile, edited); // a lead's draft, not committed
  const config = readFileSync(join(w.ra, '.backlog', 'config.json'), 'utf8'); const head = git(w.ra, 'rev-parse', 'HEAD'); const statusBefore = git(w.ra, 'status', '--short', '-uall');
  const folder = snapshot(w.folder);
  w.refuse();
  const r = w.run(OK);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /The change was not published/);
  assert.deepEqual(snapshot(w.folder), folder);
  assert.equal(readFileSync(join(w.ra, '.backlog', 'config.json'), 'utf8'), config);
  assert.equal(readFileSync(w.teamFile, 'utf8'), edited);
  assert.equal(git(w.ra, 'rev-parse', 'HEAD'), head);
  // The CLI's home resolution makes .backlog/.gitignore on the way in, for every command (an open owner question, kept as it is); a refused push leaves exactly that one line more.
  assert.equal(git(w.ra, 'status', '--short', '-uall'), `${statusBefore}\n?? .backlog/.gitignore`);
  git(w.bare, 'config', 'core.hooksPath', '/dev/null');
  const again = w.run(OK);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /^✅ created 001-x \(seq 1\)/); // the number the refused run did not take
  assert.equal(readFileSync(w.teamFile, 'utf8'), edited);
});

test('a team file valid for the command\'s team but broken in another entry stops the command: nothing written, no SHA, no config.json', t => {
  const w = world(t, { ...TEMPLATES.parallel, ops: { ...TEMPLATES.parallel.parallel, rules: { ...TEMPLATES.parallel.parallel.rules, table: [{ id: 'bad', step: 'new', do: { set: { status: 'shipped' } } }] } } });
  const r = w.run(OK);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ops/);
  assert.deepEqual(w.files(), []);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
  assert.equal(git(w.home, 'status', '--short'), '');
});

// What a team command that reads a valid file leaves in the per-user state folder (the validated copy and the record), and what it never writes.
test('a step refused by the rules: the validated copy and the record are written (the command proceeded past the file and the entry), the SHA is not', t => {
  const w = world(t);
  assert.deepEqual(w.records(), []);
  const r = w.run(['--team', 'parallel', '--agent', 'member-1', '--name', 'x']);
  assert.equal(r.status, 1);
  assert.equal(w.records().length, 2);
  assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
});

test('a team file that is invalid, unreadable, or has no entry for the team: no copy, no record, no SHA', t => {
  const bad = { ...TEMPLATES.parallel, ops: { ...TEMPLATES.parallel.parallel, rules: { ...TEMPLATES.parallel.parallel.rules, table: [{ id: 'bad', step: 'new', do: { set: { status: 'shipped' } } }] } } };
  for (const [teams, args] of [[bad, OK], ['{ not json', OK], [TEMPLATES.parallel, ['--team', 'ghost', '--agent', 'a', '--name', 'x']]]) {
    const w = world(t, teams);
    const r = w.run(args);
    assert.notEqual(r.status, 0, r.stdout);
    assert.deepEqual(w.records(), [], r.stderr);
    assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false);
  }
});
