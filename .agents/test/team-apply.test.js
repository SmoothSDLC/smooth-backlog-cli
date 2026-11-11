// The application of a step result to a real folder: the written items with their history, the moved and deleted files, the number, the index order.
// The cases of rule-cases.json that carry place, archived, bound, branch, delete or say are replayed here at the function level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, statSync, utimesSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as index from '../../src/shared/index.js';
import { numberOf } from '../../src/shared/numbers.js';
import { defaultOf } from '../../src/team/rules/expression.js';
import { create, step } from '../../src/team/rules/step.js';
import { undoOnThrow } from '../../src/shared/store.js';
import { apply, build, openOf } from '../../src/team/apply.js';
import { contextOf, readItems, toFile } from '../../src/team/item.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));
const T0 = '2026-11-01T08:00:00Z';
const NOW = '2026-11-09T12:00:00Z';
const pad = n => String(n).padStart(3, '0');

function scratch(t) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'team-apply-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const folder = join(home, 'acme', 'app');
  mkdirSync(join(folder, 'phases'), { recursive: true });
  return folder;
}
const slugOf = n => `${pad(n)}-item`;
const defaults = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
const mk = (seq, team, entry, extra = {}, fields = {}) => ({ seq, slug: slugOf(seq), name: `item ${seq}`, team, repository: 'acme/app', branch: 'main', created: T0, updated: T0, updated_by: 'ann', archived: false,
  body: '', fields: { ...(team === entry.team ? defaults(entry.def) : {}), ...fields }, history: [], ...extra });
const put = (folder, item, entry) => { const rel = `phases/${item.slug}.json`; writeFileSync(join(folder, rel), toFile(item, entry)); };
const text = (folder, rel) => readFileSync(join(folder, rel), 'utf8');
const order = (folder, branch = 'main') => index.read(folder).branches[branch]?.map(e => Number(e.slug.slice(0, 3)));
const SESSION = { id: 's-1', repository: 'acme/app', branch: 'main' };

// One step on the folder as the command does: the context from the folder, the step, apply.
async function run(folder, { file, team, caller = 'lead-1', stepName, item, args = {}, number, session = SESSION, plain = false }) {
  const entry = file[team];
  const { ctx, view } = contextOf({ folder, entry, team, caller, args, session, now: NOW });
  const result = number === undefined ? step({ ...ctx, step: stepName, item: ctx.items.find(i => i.seq === item && i.repository === 'acme/app') }) : create(ctx, number);
  const done = await apply({ folder, file, team, entry, result, view, seq: number ?? item, number, caller, session, now: NOW, step: number === undefined ? stepName : 'new' });
  return { result, done };
}

// ---- the replay of the cases

const REPLAY = ['PAR-04', 'PAR-07', 'SCR-20', 'XP-14', 'SOL-07', 'PAR-41', 'SCR-23', 'XP-16', 'SOL-08', 'PAR-48', 'PAT-57', 'PAT-56', 'PAT-55', 'PAT-23', 'PAT-53'];
test('the replay covers every case that carries place, archived, bound, branch, delete or say and validates (INL-08 is evaluator-only)', () => {
  const carry = cases.filter(c => ['place', 'archived', 'bound', 'branch', 'delete', 'say'].some(k => k in c.expect) && c.rule_set !== 'inline').map(c => c.id).sort();
  assert.deepEqual(carry, [...REPLAY].sort());
});

for (const id of REPLAY) {
  const c = cases.find(x => x.id === id);
  test(`${id}: ${Object.keys(c.expect).filter(k => ['place', 'archived', 'bound', 'branch', 'delete', 'say'].includes(k)).join(', ')}`, async t => {
    const folder = scratch(t);
    const file = FILES[c.rule_set]; const team = Object.keys(file)[0]; const entry = file[team];
    const cmd = c.command;
    const items = c.given.items.map(i => ({ seq: i.seq, slug: slugOf(i.seq), name: `item ${i.seq}`, team: i.team ?? team, repository: 'acme/app', branch: 'main', created: T0, updated: T0, updated_by: 'ann', archived: false,
      body: i.body ?? '', fields: { ...((i.team ?? team) === team ? defaults(entry) : {}), ...i.fields }, history: [] }));
    for (const i of items) put(folder, i, entry);
    const number = cmd.run === 'new' ? Math.max(c.given.last ?? 0, ...items.map(i => i.seq)) + 1 : undefined;
    const { result, done } = await run(folder, { file, team, caller: cmd.flags.agent, stepName: cmd.step, item: cmd.item, args: cmd.args ?? {}, number, session: { ...SESSION, ...cmd.session } });
    const want = c.expect; const seq = number ?? cmd.item;
    const live = readItems(folder).items;
    const itemOf = n => live.find(x => x.item.seq === n);
    for (const [n, fields] of Object.entries(want.items ?? {})) for (const [f, v] of Object.entries(fields)) assert.deepEqual(itemOf(Number(n)).item.fields[f], v, `item ${n} field ${f}`);
    const mine = itemOf(seq);
    if (!want.delete && !want.archived) { assert.equal(mine.item.updated, NOW); assert.equal(mine.item.updated_by, cmd.flags.agent); assert.equal(mine.item.history.at(-1).step, cmd.run === 'new' ? 'new' : cmd.step); assert.equal(mine.item.history.at(-1).by, cmd.flags.agent); }
    if (cmd.run === 'new') { assert.equal(mine.item.created, NOW); assert.equal(mine.item.updated, NOW); assert.equal(JSON.parse(text(folder, 'numbers.json')).last, number); }
    else assert.equal(existsSync(join(folder, 'numbers.json')), false, 'an update records no number');
    if ('say' in want) assert.equal(done.say, want.say);
    for (const n of want.archived ?? []) {
      const rel = `archive/phases/${slugOf(n)}.json`;
      assert.equal(existsSync(join(folder, `phases/${slugOf(n)}.json`)), false);
      assert.equal(existsSync(join(folder, rel)), true);
      assert.equal(itemOf(n).path, rel);
      assert.equal(itemOf(n).item.archived, true);
      assert.equal(order(folder)?.includes(n) ?? false, false, 'an archived item leaves the index');
      assert.equal(itemOf(n).item.history.at(-1).step, cmd.step);
    }
    for (const [n, tm] of Object.entries(want.bound ?? {})) { assert.equal(itemOf(Number(n)).item.team, tm); assert.equal('team' in JSON.parse(text(folder, `phases/${slugOf(Number(n))}.json`)), tm !== ''); }
    for (const [n, b] of Object.entries(want.branch ?? {})) { assert.equal(itemOf(Number(n)).item.branch, b); assert.deepEqual(order(folder, b), [Number(n)]); assert.equal(order(folder)?.includes(Number(n)) ?? false, false); }
    if (want.delete) { assert.equal(existsSync(join(folder, `phases/${slugOf(seq)}.json`)), false); assert.equal(order(folder)?.includes(seq) ?? false, false); assert.equal(itemOf(seq), undefined); }
    if (want.place !== undefined) {
      const mineFirst = order(folder).filter(n => itemOf(n).item.team === mine.item.team && openOf(FILES[c.rule_set])({ fm: { team: mine.item.team, status: itemOf(n).item.fields.status } }));
      if (want.place === 'last') for (const n of mineFirst.filter(x => x !== seq)) assert.ok(order(folder).indexOf(n) < order(folder).indexOf(seq), `${n} before ${seq}`);
      else if (want.place.before) assert.equal(mineFirst.indexOf(seq) + 1, mineFirst.indexOf(Number(want.place.before)), 'before');
    }
    assert.equal(result.rule, want.rule);
  });
}

// ---- what apply writes

const parallel = FILES.parallel; const P = 'parallel';
const pitem = (seq, fields = {}, extra = {}) => mk(seq, P, { team: P, def: parallel[P] }, extra, fields);
// mk wants { team, def } for the defaults; put takes the team entry
const putP = (folder, ...items) => items.forEach(i => put(folder, i, parallel[P]));
const idx = (folder, ...ns) => index.write(folder, { branches: { main: ns.map(n => ({ seq: n, slug: slugOf(n), name: `item ${n}`, status: 'pending' })) } });
const views = items => items.map(i => ({ path: `${i.archived ? 'archive/' : ''}phases/${i.slug}.json`, fm: { phase: i.slug, seq: i.seq, name: i.name, status: i.fields.status, branch: i.branch, ...(i.team ? { team: i.team } : {}) } }));

test('the item of the step gets one history entry (who, session, step, changes), a related item with changes another of the same step, a related item without changes none', async t => {
  const folder = scratch(t);
  putP(folder, pitem(10, { status: 'passed', holder: 'member-1', children: [11, 12] }), pitem(11, { status: 'closed', parent: 10 }), pitem(12, { status: 'closed', parent: 10 }));
  await run(folder, { file: parallel, team: P, caller: 'member-1', stepName: 'close', item: 10 });
  const [a] = readItems(folder).items.filter(x => x.item.seq === 10);
  assert.equal(a.item.history.length, 1);
  assert.deepEqual({ ...a.item.history[0], changes: Object.keys(a.item.history[0].changes) }, { at: NOW, by: 'member-1', session: 's-1', step: 'close', changes: ['status'], note: '' });
  assert.deepEqual(a.item.history[0].changes.status, ['passed', 'closed']);
  for (const n of [11, 12]) assert.equal(readItems(folder).items.find(x => x.item.seq === n).item.history.length, 0, 'an item the step did not change is not rewritten');
});

test('a related item the step changed is written with its own entry and the same stamps', async t => {
  const folder = scratch(t);
  putP(folder, pitem(30, { status: 'splitting' }));
  const { done } = await run(folder, { file: parallel, team: P, caller: 'lead-1', stepName: 'new', args: { name: 'child a', estimate: '30', parent: '30' }, number: 31 });
  const items = readItems(folder).items.map(x => x.item);
  const parent = items.find(i => i.seq === 30); const child = items.find(i => i.seq === 31);
  assert.deepEqual(parent.fields.children, [31]);
  assert.equal(parent.history.at(-1).step, 'new'); assert.equal(parent.updated_by, 'lead-1'); assert.equal(parent.updated, NOW);
  assert.equal(child.created, NOW); assert.equal(child.updated, NOW); assert.equal(child.body, '');
  assert.equal(done.items.length, 2);
  assert.deepEqual(order(folder), [31, 30]);
});

test('a note effect appends a section to the body, an empty body starts without blank lines, and the entry carries the text', async t => {
  const folder = scratch(t);
  const entry = parallel[P];
  const it = pitem(1, { status: 'new' });
  putP(folder, it);
  const { ctx, view } = contextOf({ folder, entry, team: P, caller: 'ann', args: {}, session: SESSION, now: NOW });
  const base = { rule: 'r', items: new Map([[1, ctx.items[0]]]), changes: new Map([[1, {}]]), delete: false, say: null, place: null };
  const b = build({ folder, file: parallel, team: P, entry, result: { ...base, notes: [{ heading: 'Plan', text: 'do x', by: 'ann' }] }, view, seq: 1, caller: 'ann', session: SESSION, now: NOW, step: 's' });
  assert.equal(b.items[0].doc.body, '## Plan (ann, 2026-11-09T12:00:00Z)\n\ndo x\n');
  assert.equal(b.items[0].doc.history[0].note, 'do x');
  const again = build({ folder, file: parallel, team: P, entry, result: { ...base, items: new Map([[1, { ...ctx.items[0], body: '# T\n\nold\n' }]]), notes: [{ heading: 'Plan', text: 'two', by: 'ann' }] }, view, seq: 1, caller: 'ann', session: SESSION, now: NOW, step: 's' });
  assert.equal(again.items[0].doc.body, '# T\n\nold\n\n## Plan (ann, 2026-11-09T12:00:00Z)\n\ntwo\n');
});

// ranks of place among the team's other open entries of the branch; a target that is no open item of the team on the branch skips the effect and says so
test('place ranks: first, last, before and after a named item, and a target that cannot be named skips with the history note', async t => {
  const entry = parallel[P];
  const other = { status: 'ready' };
  const cases = [['first', 3, [3, 1, 2, 4]], ['last', 3, [1, 2, 4, 3]], [{ before: 3 }, 1, [2, 1, 3, 4]], [{ after: 3 }, 1, [2, 3, 1, 4]], [{ after: '3' }, 1, [2, 3, 1, 4]], [{ before: 1 }, 4, [4, 1, 2, 3]]];
  for (const [place, seq, want] of cases) {
    const folder = scratch(t);
    // 1 2 3 4 open items of the team; a user item between them is not counted
    putP(folder, pitem(1, other), pitem(2, other), pitem(3, other), pitem(4, other));
    idx(folder, 1, 2, 3, 4);
    const { ctx, view } = contextOf({ folder, entry, team: P, caller: 'a', args: {}, session: SESSION, now: NOW });
    const first = want.indexOf(seq) !== -1 ? ctx.items.find(i => i.seq === seq) : null;
    const b = build({ folder, file: parallel, team: P, entry, result: { rule: 'r', items: new Map([[seq, first]]), changes: new Map(), delete: false, say: null, notes: [], place }, view, seq, caller: 'a', session: SESSION, now: NOW, step: 's' });
    assert.deepEqual(b.idx.branches.main.map(e => e.seq), want, JSON.stringify(place));
    assert.equal(b.place.skipped, null);
  }
  for (const place of [{ before: 9 }, { after: 2 }, { before: 5 }, { after: 6 }, { before: 1 }]) {
    const folder = scratch(t);
    putP(folder, pitem(1, other), pitem(2, { status: 'closed' }), pitem(5, other, { branch: 'dev' }), mk(7, '', { team: P, def: parallel[P] }, {}, { status: 'pending' }));
    mkdirSync(join(folder, 'archive/phases'), { recursive: true });
    writeFileSync(join(folder, `archive/phases/${slugOf(6)}.json`), toFile(pitem(6, other, { archived: true }), entry));
    const { ctx, view } = contextOf({ folder, entry, team: P, caller: 'a', args: {}, session: SESSION, now: NOW });
    const target = 1;
    const b = build({ folder, file: parallel, team: P, entry, result: { rule: 'r', items: new Map([[target, ctx.items.find(i => i.seq === target)]]), changes: new Map(), delete: false, say: null, notes: [], place }, view, seq: target, caller: 'a', session: SESSION, now: NOW, step: 's' });
    const n = Object.values(place)[0];
    if (place.before === 1) assert.equal(b.place.skipped, `place skipped: item 1 is not an open item of team parallel on branch main`, 'the item itself is no target');
    else assert.equal(b.place.skipped, `place skipped: item ${n} is not an open item of team parallel on branch main`);
    assert.match(b.items[0].doc.history.at(-1).note, /^place skipped: /);
  }
});

test('in one list of both owners a team item that reaches a final word moves behind the team\'s open entries only, and a new item goes after the team\'s open ones', async t => {
  const folder = scratch(t);
  const sc = FILES.scrum; const S = Object.keys(sc)[0];
  const mkS = (seq, fields) => mk(seq, S, { team: S, def: sc[S] }, {}, fields);
  const user = seq => mk(seq, '', { team: 'none', def: {} }, {}, { status: 'pending' });
  for (const i of [user(1), user(3), user(5)]) writeFileSync(join(folder, `phases/${i.slug}.json`), toFile(i, sc[S]));
  put(folder, mkS(2, { status: 'in review', holder: 'dev-1', reviewer: 'dev-2' }), sc[S]);
  put(folder, mkS(4, { status: 'ready' }), sc[S]);
  idx(folder, 1, 2, 3, 4, 5);
  await run(folder, { file: sc, team: S, caller: 'dev-2', stepName: 'review', item: 2, args: { verdict: 'pass', comments: 'ok' } });
  assert.deepEqual(order(folder), [1, 4, 3, 2, 5], 'u1 t2 u3 t4 u5 with t2 done: the team entries trade places, the user entries stay');
});

test('apply puts every path back when the command fails after it: the moved file, the deleted file, the number and the index', async t => {
  for (const [id, setup] of [['PAR-41', 'archive'], ['PAT-55', 'delete'], ['PAR-07', 'new']]) {
    const c = cases.find(x => x.id === id);
    const folder = scratch(t);
    const file = FILES[c.rule_set]; const team = Object.keys(file)[0]; const entry = file[team];
    const items = c.given.items.map(i => ({ seq: i.seq, slug: slugOf(i.seq), name: `item ${i.seq}`, team: i.team ?? team, repository: 'acme/app', branch: 'main', created: T0, updated: T0, updated_by: 'ann', archived: false, body: '', fields: { ...defaults(entry), ...i.fields }, history: [] }));
    for (const i of items) put(folder, i, entry);
    const snap = () => Object.fromEntries(readItems(folder).items.map(x => [x.path, toFile(x.item, entry)]));
    const before = snap(); const files = readItemsList(folder);
    const number = c.command.run === 'new' ? Math.max(c.given.last ?? 0, ...items.map(i => i.seq)) + 1 : undefined;
    await assert.rejects(undoOnThrow(folder, async () => { await run(folder, { file, team, caller: c.command.flags.agent, stepName: c.command.step, item: c.command.item, args: c.command.args ?? {}, number, session: { ...SESSION, ...c.command.session } }); throw new Error('later step failed'); }), /later step failed/);
    assert.deepEqual(snap(), before, setup);
    assert.deepEqual(readItemsList(folder), files, `${setup}: no file added or left`);
  }
});
const readItemsList = folder => readItems(folder).items.map(x => x.path).sort().concat(existsSync(join(folder, 'index.json')) ? ['index.json'] : [], existsSync(join(folder, 'numbers.json')) ? ['numbers.json'] : []);

test('an archive that would replace an archived item of the same name refuses and changes nothing', async t => {
  const folder = scratch(t);
  const c = cases.find(x => x.id === 'PAR-41'); const entry = parallel[P];
  const it = pitem(50, { status: 'closed' });
  putP(folder, it);
  mkdirSync(join(folder, 'archive/phases'), { recursive: true });
  writeFileSync(join(folder, `archive/phases/${it.slug}.json`), toFile({ ...it, archived: true, name: 'older' }, entry));
  const before = text(folder, `phases/${it.slug}.json`);
  await assert.rejects(run(folder, { file: parallel, team: P, caller: 'lead-1', stepName: 'archive', item: 50 }), e => e.exitCode === 2 && /already exists/.test(e.message));
  assert.equal(text(folder, `phases/${it.slug}.json`), before);
  assert.match(text(folder, `archive/phases/${it.slug}.json`), /"name": "older"/);
  assert.equal(existsSync(join(folder, 'index.json')), false, 'the seeded index went back too');
  assert.ok(c && entry);
});

test('openOf: a team of the file finishes an item by its own final words, an item without a team or of an unknown team by the built-in ones', () => {
  const o = openOf({ xp: { item: { status: { final: ['accepted'] } } } });
  assert.equal(o({ fm: { team: 'xp', status: 'accepted' } }), false);
  assert.equal(o({ fm: { team: 'xp', status: 'done' } }), true);
  assert.equal(o({ fm: { status: 'done' } }), false);
  assert.equal(o({ fm: { team: 'gone', status: 'closed' } }), false);
  assert.equal(o({ fm: { status: 'accepted' } }), true);
  assert.equal(o({ fm: { team: 'xp' } }), true);
});

test('a team whose definition declares fields called events and phase: a folder without an index applies a step and the item keeps both fields', async t => {
  const folder = scratch(t);
  const file = { w: { people: { a: ['lead'] }, item: { status: { type: 'text', default: 'open', values: ['open', 'done'], final: ['done'] }, events: { type: 'text', default: 'e' }, phase: { type: 'text', default: 'p' } },
    rules: { table: [{ id: 'go', step: 'go', do: { set: { status: 'done', events: 'e2' } } }], pop: [], filters: {} } } };
  const entry = file.w;
  put(folder, mk(1, 'w', { team: 'w', def: entry }, {}, { status: 'open' }), entry);
  assert.equal(existsSync(join(folder, 'index.json')), false);
  await run(folder, { file, team: 'w', caller: 'a', stepName: 'go', item: 1 });
  const got = readItems(folder).items[0].item;
  assert.deepEqual([got.fields.events, got.fields.phase, got.fields.status], ['e2', 'p', 'done']);
  assert.deepEqual(order(folder), [1]);
});

test('a user item that carries a legacy priority keeps its rank when a team command seeds the index', async t => {
  const folder = scratch(t);
  const entry = parallel[P];
  putP(folder, pitem(1, { status: 'new' }));
  for (const [n, pr] of [[2, 5], [3, 0]]) writeFileSync(join(folder, `phases/${slugOf(n)}.json`), toFile({ ...mk(n, '', { team: 'x', def: {} }, {}, { status: 'pending', priority: pr }) }, entry));
  await run(folder, { file: parallel, team: P, caller: 'lead-1', stepName: 'new', args: { name: 'z', estimate: '30' }, number: 4 });
  assert.ok(order(folder).indexOf(3) < order(folder).indexOf(2), 'priority 0 before priority 5');
});

test('apply works without seq for a new item: the number is the item', async t => {
  const folder = scratch(t);
  putP(folder, pitem(30, { status: 'splitting' }));
  const { ctx, view } = contextOf({ folder, entry: parallel[P], team: P, caller: 'lead-1', args: { name: 'c', estimate: '30', parent: '30' }, session: SESSION, now: NOW });
  const result = create(ctx, 31);
  const done = await apply({ folder, file: parallel, team: P, entry: parallel[P], result, view, number: 31, caller: 'lead-1', session: SESSION, now: NOW, step: 'new' });
  assert.deepEqual(done.items.map(x => x.seq).sort(), [30, 31]);
  assert.equal(existsSync(join(folder, done.items.find(x => x.seq === 31).path)), true);
});

test('openOf: a team named like an object property has no entry, so the built-in words finish its items; another team\'s own final word is respected', () => {
  const o = openOf({ a: { item: { status: { final: ['x'] } } }, b: { item: { status: { final: ['y'] } } } });
  for (const team of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) { assert.equal(o({ fm: { team, status: 'closed' } }), false, team); assert.equal(o({ fm: { team, status: 'pending' } }), true, team); }
  assert.equal(o({ fm: { team: 'a', status: 'x' } }), false); assert.equal(o({ fm: { team: 'a', status: 'y' } }), true);
  assert.equal(o({ fm: { team: 'b', status: 'y' } }), false); assert.equal(o({ fm: { team: 'b', status: 'x' } }), true);
});

test('place counts only the team\'s own open entries: t1 u9 t2 t3 with t3 placed before t2 gives t1 u9 t3 t2', () => {
  const entry = parallel[P]; const other = { status: 'ready' };
  const items = [pitem(1, other), mk(9, '', { team: P, def: entry }, {}, { status: 'pending' }), pitem(2, other), pitem(3, other)];
  const view = views(items);
  const folder = scratch({ after() {} });
  idx(folder, 1, 9, 2, 3);
  const b = build({ folder, file: parallel, team: P, entry, result: { rule: 'r', items: new Map([[3, items[3]]]), changes: new Map(), delete: false, say: null, notes: [], place: { before: 2 } }, view, seq: 3, caller: 'a', session: SESSION, now: NOW, step: 's' });
  assert.deepEqual(b.idx.branches.main.map(e => e.seq), [1, 9, 3, 2]);
  assert.equal(b.place.skipped, null);
});

test('an item with earlier history keeps every entry and gains exactly one; a related item without changes is not rewritten (bytes and mtime)', async t => {
  const folder = scratch(t);
  const old = [{ at: T0, by: 'ann', session: '', step: 'new', changes: {}, note: '' }, { at: T0, by: 'bob', session: 'x', step: 'claim', changes: { holder: ['', 'bob'] }, note: 'n' }];
  putP(folder, pitem(10, { status: 'passed', holder: 'member-1', children: [11, 12] }, { history: old }), pitem(11, { status: 'closed', parent: 10 }), pitem(12, { status: 'closed', parent: 10 }));
  const p11 = join(folder, `phases/${slugOf(11)}.json`);
  const when = new Date('2020-01-01T00:00:00Z'); utimesSync(p11, when, when);
  const bytes = readFileSync(p11, 'utf8'); const mtime = statSync(p11).mtimeMs;
  const { ctx, view } = contextOf({ folder, entry: parallel[P], team: P, caller: 'member-1', args: {}, session: SESSION, now: NOW });
  const at = n => ctx.items.find(i => i.seq === n);
  const result = { rule: 'r', items: new Map([[10, { ...at(10), fields: { ...at(10).fields, status: 'closed' } }], [11, at(11)]]), changes: new Map([[10, { status: ['passed', 'closed'] }], [11, {}]]), delete: false, say: null, notes: [], place: null };
  await apply({ folder, file: parallel, team: P, entry: parallel[P], result, view, seq: 10, caller: 'member-1', session: SESSION, now: NOW, step: 'close' });
  const h = readItems(folder).items.find(x => x.item.seq === 10).item.history;
  assert.equal(h.length, 3); assert.deepEqual(h.slice(0, 2), old); assert.equal(h[2].step, 'close');
  assert.equal(readFileSync(p11, 'utf8'), bytes); assert.equal(statSync(p11).mtimeMs, mtime);
});

test('a failed archive removes the archive folder it created and nothing else', async t => {
  if (process.getuid?.() === 0) return t.skip('permissions do not bind root');
  const folder = scratch(t);
  putP(folder, pitem(50, { status: 'closed' }));
  chmodSync(join(folder, 'phases'), 0o555);
  try { await assert.rejects(run(folder, { file: parallel, team: P, caller: 'lead-1', stepName: 'archive', item: 50 })); } finally { chmodSync(join(folder, 'phases'), 0o755); }
  assert.equal(existsSync(join(folder, 'archive')), false);
  assert.equal(existsSync(join(folder, `phases/${slugOf(50)}.json`)), true);
});
