// The cases of the rules (fixtures/team-rules/rule-cases.json) through the real team commands: each case is set up as a folder of items, a team file and a command
// line, run as a child process, and the exit, the printed text and the written items are compared. `new` and `update` are replayed here; the pop cases are added by
// the command that runs them. A case whose team file fails validation cannot run through a command (the command refuses the file before it evaluates): those are
// EVALUATOR_ONLY and stay with team-rules-cases.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, fileOf, git, inside, putItem, readJson, world } from './team-fixture.js';
import { validate, errors } from '../../src/team/rules/validate.js';
import { defaultOf } from '../../src/team/rules/expression.js';
import * as index from '../../src/shared/index.js';
import { step } from '../../src/team/rules/step.js';
import { pop } from '../../src/team/rules/pop.js';
import { readItems } from '../../src/team/item.js';

const { cases } = readJson('./fixtures/team-rules/rule-cases.json');
const NOW = '2026-11-01T00:00:00Z';
const defaultsOf = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
const fileOf_ = c => (c.rule_set === 'inline' ? c.given.team_file : TEMPLATES[c.rule_set]);

// The inline cases whose team file fails validation: evaluator only. Counted, so a case is never silently dropped.
const EVALUATOR_ONLY = ['INL-01', 'INL-02', 'INL-03', 'INL-04', 'INL-05', 'INL-06', 'INL-07', 'INL-08', 'INL-09'];
const RUN_KINDS = ['new', 'update', 'pop'];
const inlineFails = c => c.rule_set === 'inline' && errors(validate(c.given.team_file)).length > 0;
const viaCommand = cases.filter(c => RUN_KINDS.includes(c.command.run) && !EVALUATOR_ONLY.includes(c.id));
const viaNew = viaCommand.filter(c => c.command.run === 'new');
const viaUpdate = viaCommand.filter(c => c.command.run === 'update');
const viaPop = viaCommand.filter(c => c.command.run === 'pop');

test('the evaluator-only cases are the nine inline cases whose team file fails validation, none of them a new or update case that runs', () => {
  assert.equal(EVALUATOR_ONLY.length, 9);
  assert.deepEqual(cases.filter(c => c.command.run !== 'validate' && inlineFails(c)).map(c => c.id).sort(), [...EVALUATOR_ONLY].sort());
  assert.ok(cases.filter(c => c.command.run === 'new').every(c => !EVALUATOR_ONLY.includes(c.id) && !inlineFails(c)));
  assert.equal(cases.filter(c => c.command.run === 'new').length, 25);
  assert.equal(cases.filter(c => c.command.run === 'update').length, 155);
  assert.deepEqual(cases.filter(c => c.command.run === 'update' && EVALUATOR_ONLY.includes(c.id)).map(c => c.id), ['INL-02', 'INL-03', 'INL-04', 'INL-05', 'INL-06', 'INL-07', 'INL-08']);
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

// The two things a case names that a real run cannot have: session.commit (the two shas it names are replaced by the head commits of the working copy: two commits, the
// second is HEAD, or the first when the session names it) and the clock (the cases are written at CASE_NOW; every time stamp of that day is moved so that it stands to the real time as it stood to CASE_NOW, and an expected
// time stamp is compared within two minutes of that).
const DAY = /^2026-11-09T\d\d:\d\d:\d\dZ$/;
const CASE_NOW = '2026-11-09T12:00:00Z'; // the time the cases are written at
const shifted = ts => new Date(Date.now() - (Date.parse(CASE_NOW) - Date.parse(ts))).toISOString().replace(/\.\d+Z$/, 'Z');
function substitution(w, c) {
  let one = 'abc1234'; let two = 'def5678';
  if (/abc1234|def5678/.test(JSON.stringify(c))) {
    git(w.cons, 'commit', '-q', '--allow-empty', '-m', 'one'); one = git(w.cons, 'rev-parse', 'HEAD');
    git(w.cons, 'commit', '-q', '--allow-empty', '-m', 'two'); two = git(w.cons, 'rev-parse', 'HEAD');
    if (c.command.session?.commit === 'abc1234') git(w.cons, 'reset', '-q', '--hard', one); // the commit the session names is the one the working copy is at
  }
  const swap = v => (typeof v === 'string' ? (DAY.test(v) ? shifted(v) : v.replaceAll('abc1234', one).replaceAll('def5678', two)) : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
  return swap;
}
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const sameValue = (got, want, what) => (typeof want === 'string' && ISO.test(want) && typeof got === 'string' && ISO.test(got) ? assert.ok(Math.abs(Date.parse(got) - Date.parse(want)) < 120000, `${what}: ${got} is not near ${want}`) : assert.deepEqual(got, want, what));

// The command line of a case: the team is the first key of the file, the agent comes from flags.agent, every other flag and argument is passed by name.
function commandLine(cmd, team) {
  const flags = { team, ...cmd.flags };
  const line = cmd.run === 'update' ? [String(cmd.item), cmd.step] : [];
  for (const [k, v] of Object.entries({ ...flags, ...(cmd.session?.id ? { session: cmd.session.id } : {}) })) line.push(`--${k}`, ...(v === true ? [] : [String(v)]));
  for (const [k, v] of Object.entries(cmd.args ?? {})) line.push(`--${k}`, String(v));
  return line;
}

for (const c of viaNew) {
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
  assert.equal(viaNew.length, 25);
  assert.equal(new Set(viaNew.map(c => c.id)).size, 25);
});

// ---- update: the same cases through `backlog team update <item> <step>`. What is compared: the exit and the text of the case; the fields the case names; and every
// written item, field by field and in its place (live, archived, deleted), against what the evaluator makes of the same items at the time the command stamped; every
// other item file byte for byte as it was seeded; a refused command leaves the whole folder as it was.
const itemsOf = (c, team, entry) => c.given.items.map(i => ({ seq: i.seq, slug: `${String(i.seq).padStart(3, '0')}-item`, name: i.name ?? `item ${i.seq}`, team: i.team ?? team,
  repository: i.repository ?? 'acme/app', branch: i.branch ?? 'main', archived: Boolean(i.archived), body: i.body ?? '', fields: { ...(!c.given.raw && (i.team ?? team) === team ? defaultsOf(entry) : {}), ...i.fields } }));

for (const c of viaUpdate) {
  test(`${c.id}: ${c.rule ?? 'coded'} through backlog team update`, t => {
    const file = fileOf_(c); const team = Object.keys(file)[0]; const entry = file[team];
    const w = world(t, file);
    const run = JSON.parse(JSON.stringify(substitution(w, c)(c)));
    seed(w, run, team, entry, x => x);
    const before = snapshot(w.folder);
    const r = w.run(commandLine(run.command, team), run.command.env ?? {}, 'update');
    const want = run.expect; const cmd = run.command;
    assert.equal(r.status, want.exit, `${r.stdout}${r.stderr}`);
    if (want.exit !== 0) {
      if (want.exit === 1) { assert.equal(r.stdout, `❌ ${want.text}\n`); assert.equal(r.stderr, ''); }
      if (want.exit === 2) { assert.equal(r.stderr, `❌ backlog: ${want.text}\n`); assert.equal(r.stdout, ''); }
      assert.equal(existsSync(join(w.cons, '.backlog', 'config.json')), false); // a refused command writes no SHA
      assert.equal(git(w.home, 'status', '--short'), '');
      assert.deepEqual(snapshot(w.folder), before);
      return;
    }
    assert.equal(r.stderr, '');
    assert.equal(git(w.home, 'status', '--short'), ''); // published
    const slug = `${String(cmd.item).padStart(3, '0')}-item`;
    assert.match(git(w.home, 'log', '-1', '--format=%s'), new RegExp(`team ${cmd.step} ${slug}$`));
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines[0], `✅ ${slug}: ${cmd.step} (rule ${want.rule})`);
    if (want.say !== undefined) assert.ok(lines.includes(want.say), `the say text is printed: ${r.stdout}`);

    // the evaluator on the same items, at the time the command stamped
    const kept = fileOf(w.folder, cmd.item); // a step that deletes its item leaves no file to read the time from
    const stamped = kept ? JSON.parse(readFileSync(kept, 'utf8')).updated : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const all = itemsOf(run, team, entry);
    const result = step({ entry, team, step: cmd.step, caller: cmd.flags.agent, items: all, args: cmd.args ?? {}, session: { repository: 'acme/app', branch: 'main', commit: git(w.cons, 'rev-parse', 'HEAD'), ...cmd.session }, now: stamped, item: all.find(i => i.seq === cmd.item && i.repository === 'acme/app') });
    assert.equal(result.rule, want.rule);
    for (const [seq, fields] of Object.entries(want.items ?? {})) {
      const got = JSON.parse(readFileSync(fileOf(w.folder, seq), 'utf8')).fields;
      for (const [f, v] of Object.entries(fields)) sameValue(got[f], v, `item ${seq} field ${f}`);
    }
    const written = new Set();
    for (const [seq, it] of result.items) {
      const own = seq === cmd.item;
      if (!own && !Object.keys(result.changes.get(seq) ?? {}).length) continue;
      written.add(seq);
      const path = fileOf(w.folder, seq);
      if (own && result.delete) { assert.equal(path, undefined, `item ${seq} is deleted`); continue; }
      assert.ok(path, `item ${seq} is written`);
      assert.equal(path.includes('/archive/'), it.archived, `item ${seq} archived`);
      const doc = JSON.parse(readFileSync(path, 'utf8'));
      for (const f of new Set([...Object.keys(it.fields), ...Object.keys(doc.fields)])) sameValue(doc.fields[f], it.fields[f], `item ${seq} field ${f} (the evaluator's)`);
      assert.equal(doc.team ?? '', it.team, `item ${seq} team`);
      assert.equal(doc.branch, it.branch, `item ${seq} branch`);
      assert.equal(doc.history.at(-1).step, cmd.step);
    }
    for (const seq of want.archived ?? []) assert.ok(fileOf(w.folder, seq).includes('/archive/'), `item ${seq} archived`);
    for (const [seq, tm] of Object.entries(want.bound ?? {})) assert.equal(JSON.parse(readFileSync(fileOf(w.folder, seq), 'utf8')).team ?? '', tm, `item ${seq} team`);
    for (const [seq, b] of Object.entries(want.branch ?? {})) assert.equal(JSON.parse(readFileSync(fileOf(w.folder, seq), 'utf8')).branch, b, `item ${seq} branch`);
    if (want.delete) assert.equal(fileOf(w.folder, cmd.item), undefined);
    const after = snapshot(w.folder);
    for (const [p, text] of Object.entries(before)) { // every item file the step did not write is as seeded
      const n = Number(p.split('/').at(-1).split('-')[0]);
      if (/^(phases|archive)\//.test(p) && !written.has(n)) assert.equal(after[p], text, `${p} unchanged`);
    }
    if (want.place) {
      const slugs = index.read(w.folder).branches.main.map(e => e.seq);
      const [kind, target] = Object.entries(want.place)[0];
      const at = slugs.indexOf(cmd.item);
      if (kind === 'before') assert.equal(slugs[at + 1], Number(target));
      if (kind === 'after') assert.equal(slugs[at - 1], Number(target));
      if (kind === 'first') assert.equal(at, 0);
      if (kind === 'last') assert.equal(at, slugs.length - 1);
    }
  });
}

test('the harness runs every update case it can, none silently dropped: 148 update cases through the command', () => {
  assert.equal(viaUpdate.length, 148);
  assert.equal(new Set(viaUpdate.map(c => c.id)).size, 148);
  assert.equal(viaUpdate.filter(c => c.id.startsWith('INL')).length, 2); // INL-10 and INL-11
});

// ---- check: the same update cases through `backlog team query check <item> <step>`: the rules' verdict, exit 0 with "allowed by rule <id>" or "refused by rule <id>" ("-" for a coded
// refusal); the item that does not exist, a wrong value and a malformed rule keep the exit and the text of the update. Nothing is written in the clone.
for (const c of viaUpdate) {
  test(`${c.id}: ${c.rule ?? 'coded'} through backlog team query check`, t => {
    const file = fileOf_(c); const team = Object.keys(file)[0]; const entry = file[team];
    const w = world(t, file);
    const run = JSON.parse(JSON.stringify(substitution(w, c)(c)));
    seed(w, run, team, entry, x => x);
    const before = snapshot(w.folder); const head = git(w.home, 'rev-parse', 'HEAD');
    const r = w.run(['check', ...commandLine(run.command, team)], run.command.env ?? {}, 'query');
    const want = run.expect;
    const coded = want.exit === 2 && /^the step \S+ of team \S+ takes no --/.test(want.text);
    if ((want.exit === 1 && /^no item /.test(want.text)) || (want.exit === 2 && !coded)) {
      assert.equal(r.status, want.exit, `${r.stdout}${r.stderr}`);
      assert.equal(want.exit === 1 ? r.stdout : r.stderr, want.exit === 1 ? `❌ ${want.text}\n` : `❌ backlog: ${want.text}\n`);
    } else {
      assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
      assert.equal(r.stderr, '');
      assert.ok(r.stdout.startsWith(want.exit === 0 ? `allowed by rule ${want.rule}` : `refused by rule ${coded ? '-' : want.rule ?? '-'}: `), r.stdout);
      if (want.exit === 1 && want.rule) assert.doesNotMatch(r.stdout, new RegExp(`\\(rule ${want.rule}\\)\\n$`));
    }
    assert.deepEqual(snapshot(w.folder), before);
    assert.equal(git(w.home, 'status', '--short'), '');
    assert.equal(git(w.home, 'rev-parse', 'HEAD'), head);
  });
}

// ---- pop: the same cases through `backlog team pop --json`. Compared: the exit, action, item, entry and rule of the answer; the item the step wrote, field by field, against what the
// evaluator makes of the same items; every other item file byte for byte; an idle answer leaves the whole folder as it was.
for (const c of viaPop) {
  test(`${c.id}: ${c.rule ?? 'coded'} through backlog team pop`, t => {
    const file = fileOf_(c); const team = Object.keys(file)[0]; const entry = file[team];
    const w = world(t, file);
    const run = JSON.parse(JSON.stringify(substitution(w, c)(c)));
    seed(w, run, team, entry, x => x);
    const before = snapshot(w.folder);
    const r = w.run([...commandLine(run.command, team), '--json'], run.command.env ?? {}, 'pop');
    const want = run.expect; const cmd = run.command;
    assert.equal(r.status, want.exit, `${r.stdout}${r.stderr}`);
    assert.equal(r.stderr, '');
    const out = JSON.parse(r.stdout);
    assert.equal(out.action, want.action);
    if (want.exit === 3) {
      assert.deepEqual(out, { action: 'idle' });
      assert.deepEqual(snapshot(w.folder), before);
      assert.equal(git(w.home, 'status', '--short'), '');
      return;
    }
    assert.equal(out.item, want.item); assert.equal(out.entry, want.entry);
    assert.equal(git(w.home, 'status', '--short'), ''); // published
    const slug = `${String(want.item).padStart(3, '0')}-item`;
    assert.match(git(w.home, 'log', '-1', '--format=%s'), new RegExp(`team ${want.action} ${slug}$`));
    const stamped = JSON.parse(readFileSync(fileOf(w.folder, want.item), 'utf8')).updated;
    const all = itemsOf(run, team, entry);
    const offer = pop({ entry, team, caller: cmd.flags.agent, items: all, args: {}, order: run.given.order, skip: new Set(), session: { repository: 'acme/app', branch: 'main', commit: git(w.cons, 'rev-parse', 'HEAD'), ...cmd.session }, now: stamped });
    assert.equal(offer.action, want.action); assert.equal(offer.rule, out.rule);
    assert.deepEqual(out.item_file, JSON.parse(readFileSync(fileOf(w.folder, want.item), 'utf8')));
    const written = new Set();
    for (const [seq, it] of offer.result.items) {
      if (seq !== want.item && !Object.keys(offer.result.changes.get(seq) ?? {}).length) continue;
      written.add(seq);
      const doc = JSON.parse(readFileSync(fileOf(w.folder, seq), 'utf8'));
      for (const f of new Set([...Object.keys(it.fields), ...Object.keys(doc.fields)])) sameValue(doc.fields[f], it.fields[f], `item ${seq} field ${f} (the evaluator's)`);
      assert.equal(doc.history.at(-1).step, want.action);
    }
    const after = snapshot(w.folder);
    for (const [p, text] of Object.entries(before)) {
      const n = Number(p.split('/').at(-1).split('-')[0]);
      if (/^(phases|archive)\//.test(p) && !written.has(n)) assert.equal(after[p], text, `${p} unchanged`);
    }
  });
}

test('the harness runs every pop case it can, none silently dropped: 15 pop cases through the command', () => {
  assert.equal(viaPop.length, 15);
  assert.deepEqual(viaPop.map(c => c.id).sort(), ['PAR-49', 'PAR-50', 'PAR-51', 'PAR-52', 'PAR-53', 'PAR-56', 'PAT-42', 'PAT-43', 'PAT-44', 'SCR-24', 'SCR-25', 'SCR-28', 'SOL-09', 'SOL-10', 'XP-17']);
  assert.deepEqual(cases.filter(c => c.command.run === 'pop' && EVALUATOR_ONLY.includes(c.id)).map(c => c.id), ['INL-01', 'INL-09']);
});

// ---- filter: the nine filter cases through `backlog team query filter <name> --json`: the items printed are the numbers the case expects, in queue order, and nothing is written.
const viaFilter = cases.filter(c => c.command.run === 'filter');
for (const c of viaFilter) {
  test(`${c.id}: ${c.rule} through backlog team query filter`, t => {
    const file = fileOf_(c); const team = Object.keys(file)[0]; const entry = file[team];
    const w = world(t, file);
    const run = JSON.parse(JSON.stringify(substitution(w, c)(c)));
    seed(w, run, team, entry, x => x);
    const before = snapshot(w.folder);
    const r = w.run(['filter', run.command.step, ...commandLine(run.command, team), '--json'], run.command.env ?? {}, 'query');
    assert.equal(r.status, run.expect.exit, `${r.stdout}${r.stderr}`);
    assert.equal(r.stderr, '');
    assert.deepEqual(JSON.parse(r.stdout).map(d => d.seq), run.expect.filter);
    assert.deepEqual(snapshot(w.folder), before);
    assert.equal(git(w.home, 'status', '--short'), '');
  });
}

test('the harness runs every filter case, none silently dropped: 9 filter cases through the command', () => {
  assert.deepEqual(viaFilter.map(c => c.id).sort(), ['PAR-54', 'PAR-55', 'PAT-45', 'PAT-46', 'SCR-26', 'SCR-27', 'SOL-11', 'XP-18', 'XP-19']);
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
