// The item adapter of the team commands: the document codec, the raw reads of a folder and of one foreign item, the context of a step, and the
// stored form of a team item through the shared store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fromItemJson, historyEntry, readDoc, toItemJson, writeDoc } from '../../src/shared/item-json.js';
import * as index from '../../src/shared/index.js';
import { seam } from '../../src/shared/seam.js';
import * as store from '../../src/shared/store.js';
import { contextOf, foreignRaw, fromFile, readItems, toFile, viewOf } from '../../src/team/item.js';

const T = '2026-11-09T10:00:00Z';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const parallel = read('../../templates/teams/parallel.json').parallel;
const pad = n => String(n).padStart(3, '0');
const mk = (seq, extra = {}) => ({ seq, slug: `${pad(seq)}-x`, name: `item ${seq}`, team: 'parallel', repository: 'acme/app', branch: 'main', created: T, updated: T, updated_by: 'ann', archived: false, body: '', fields: { status: 'ready' }, history: [], ...extra });
const nameOf = item => `${item.slug}.json`;
const relOf = item => `${item.archived ? 'archive' : 'phases'}/${nameOf(item)}`;
function scratch(t) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'team-item-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}
const put = (folder, item, rel = relOf(item)) => { mkdirSync(dirname(join(folder, rel)), { recursive: true }); writeFileSync(join(folder, rel), toFile(item, parallel)); };
const folderOf = (home, id = 'acme/app') => join(home, ...id.split('/'));
const list = dir => readdirSync(dir, { recursive: true }).sort();

// ---- the document codec

test('a team field called phase or events stays a field through readDoc and writeDoc', () => {
  const doc = { seq: 1, slug: '001-a', name: 'A', team: 'p', repository: 'r', branch: 'b', created: T, updated: T, updated_by: 'ann', fields: { phase: 'p1', events: ['e'], history: 1, body: 2, fields: 3 }, body: 'text', history: [] };
  const text = writeDoc(doc);
  assert.deepEqual(readDoc(text), doc);
  assert.equal(writeDoc(readDoc(text)), text);
});

test('writeDoc writes the fields in the order given, then the others alphabetically; an empty team is no key', () => {
  const doc = { seq: 1, slug: '001-a', name: 'A', team: '', repository: 'r', branch: 'b', created: null, updated: T, updated_by: '', fields: { zeta: 1, status: 's', holder: 'h', alpha: 2 }, body: '', history: [] };
  const text = writeDoc(doc, { order: ['zeta', 'status', 'holder'] });
  assert.deepEqual(Object.keys(JSON.parse(text).fields), ['zeta', 'status', 'holder', 'alpha']);
  assert.equal('team' in JSON.parse(text), false);
  assert.equal('team' in readDoc(text), false);
  assert.equal(JSON.parse(writeDoc({ ...doc, team: undefined })).team, undefined);
});

test('writeDoc refuses what readDoc refuses', () => {
  const doc = { seq: 1, slug: '001-a', name: 'A', repository: 'r', branch: 'b', created: null, updated: T, updated_by: '', fields: {}, body: '', history: [] };
  for (const [what, d, key] of [['seq', { ...doc, seq: '1' }, 'seq'], ['name', { ...doc, name: 3 }, 'name'], ['team', { ...doc, team: 3 }, 'team'], ['fields', { ...doc, fields: [] }, 'fields'],
    ['an envelope name as a field', { ...doc, fields: { branch: 'x' } }, 'fields.branch'], ['a history entry', { ...doc, history: [{ at: T }] }, 'history[0].step'], ['history', { ...doc, history: {} }, 'history']]) {
    assert.throws(() => writeDoc(d), e => e.field === key, what);
  }
  assert.throws(() => readDoc(writeDoc(doc).replace('"fields": {}', '"fields": {"seq": 1}')), e => e.field === 'fields.seq');
});

test('the user path still refuses a field called events and still reads a field called phase as a field', () => {
  const text = writeDoc({ seq: 1, slug: '001-a', name: 'A', repository: 'r', branch: 'b', created: null, updated: T, updated_by: '', fields: { events: 1 }, body: '', history: [] });
  assert.throws(() => fromItemJson(text), e => e.field === 'fields.events');
  const ok = fromItemJson(text.replace('"events"', '"phase"'));
  assert.equal(ok.fm.phase, '001-a');
});

test('the history entry builder gives the one shape and fills what an old entry lacks', () => {
  assert.deepEqual(historyEntry({ at: T, step: 'claim', note: '' }), { at: T, by: '', session: '', step: 'claim', changes: {}, note: '' });
  const e = { at: T, by: 'ann', session: 's1', step: 'claim', changes: { status: ['a', 'b'] }, note: 'n' };
  assert.deepEqual(historyEntry(e), e);
  assert.deepEqual(Object.keys(historyEntry(e)), ['at', 'by', 'session', 'step', 'changes', 'note']);
  assert.throws(() => historyEntry({ at: T, note: '' }, 'history[2]'), e2 => e2.field === 'history[2].step');
});

test('toItemJson and fromItemJson of a header equal the document users', () => {
  const fm = { phase: '001-a', seq: 1, name: 'A', team: 't', repository: 'r', branch: 'b', created: T, updated: T, updated_by: 'u', status: 'done', objective: 'o', zed: 1, events: [historyEntry({ at: T, step: 's', note: '' })] };
  const text = toItemJson(fm, 'b');
  const doc = readDoc(text);
  assert.deepEqual(Object.keys(doc.fields), ['status', 'objective', 'zed']);
  assert.equal(writeDoc(doc, { order: ['status', 'objective'] }), text);
  assert.deepEqual(fromItemJson(text), { fm, body: 'b' });
});

// ---- the item file and the evaluator item

const cases = read('./fixtures/team-rules/rule-cases.json').cases;
test('every item of every case of the rule cases survives write, read, write with the same bytes', () => {
  let n = 0;
  for (const c of cases) for (const i of c.given?.items ?? []) {
    const item = mk(i.seq, { name: i.name ?? `item ${i.seq}`, team: i.team ?? 'x', repository: i.repository ?? 'acme/app', branch: i.branch ?? 'main', archived: Boolean(i.archived), body: i.body ?? '', fields: i.fields ?? {} });
    const path = relOf(item);
    const text = toFile(item, parallel);
    assert.deepEqual(fromFile(text, { path }), item, c.id);
    assert.equal(toFile(fromFile(text, { path }), parallel), text, c.id);
    n++;
  }
  assert.ok(n > 100, `${n} items`);
});

test('the fields are the file\'s own: no earlier word translated, no holder mapped, no key dropped, the order of the definition', () => {
  const fields = { status: 'done', owner: 'ann', claimed_by: 'bob', priority: 3, stage: 'mine', review_state: 'x', phase: 'p', events: ['e'], children: [2, 3], estimate: 5, zeta: 1 };
  const item = mk(7, { fields, history: [historyEntry({ at: T, by: 'ann', session: 's', step: 'claim', changes: { status: ['ready', 'done'] }, note: 'n' })] });
  const text = toFile(item, parallel);
  assert.deepEqual(Object.keys(JSON.parse(text).fields), ['status', 'estimate', 'children', 'claimed_by', 'events', 'owner', 'phase', 'priority', 'review_state', 'stage', 'zeta']);
  assert.deepEqual(fromFile(text, { path: 'phases/007-x.json' }).fields, fields);
  assert.equal(fromFile(text).history[0].by, 'ann');
  assert.equal(text.split('\n').filter(l => l.startsWith('    { "at"')).length, 1, 'one history entry per line');
});

test('an item without a team has no team key in the file and the empty team in memory; an item under archive/ is archived; a missing stamp is refused', () => {
  const text = toFile(mk(1, { team: '' }), parallel);
  assert.equal('team' in JSON.parse(text), false);
  assert.equal(fromFile(text).team, '');
  assert.equal(fromFile(text, { path: 'archive/phases/001-x.json' }).archived, true);
  assert.equal(fromFile(text, { path: 'phases/001-x.json' }).archived, false);
  assert.throws(() => toFile({ ...mk(1), updated: undefined }, parallel), e => e.field === 'updated');
});

test('viewOf gives the index code the shape it reads', () => {
  assert.deepEqual(viewOf(mk(4, { branch: 'dev' })), { path: 'phases/004-x.json', fm: { phase: '004-x', seq: 4, name: 'item 4', status: 'ready', branch: 'dev', team: 'parallel' } });
  assert.equal(viewOf(mk(4, { archived: true })).path, 'archive/phases/004-x.json');
});

// ---- reading a folder

test('readItems reads every live and archived item raw, with the paths and the numbers', t => {
  const folder = folderOf(scratch(t));
  put(folder, mk(1)); put(folder, mk(2, { archived: true }), 'archive/phases/002-x.json'); put(folder, mk(3, { fields: { status: 'done', priority: 1 } }));
  writeFileSync(join(folder, 'phases', 'README.md'), 'no header\n');
  const r = readItems(folder);
  assert.deepEqual(r.items.map(x => [x.path, x.item.seq, x.item.archived]), [['phases/001-x.json', 1, false], ['phases/003-x.json', 3, false], ['archive/phases/002-x.json', 2, true]]);
  assert.equal(r.items[1].item.fields.status, 'done');
  assert.deepEqual([...r.seqs].sort(), [1, 2, 3]);
  assert.equal(r.markdown, false);
  assert.deepEqual(readItems(join(folder, 'nowhere-here')).items, []);
});

test('readItems stops as the store does: an unreadable item, a link, a number above the bound, a folder of markdown items', t => {
  const home = scratch(t);
  const folder = folderOf(home);
  put(folder, mk(1));
  writeFileSync(join(folder, 'phases', '002-bad.json'), '{"seq": 2}');
  assert.throws(() => readItems(folder), e => e.code === 'UNREADABLE_ITEM' && e.exitCode === 2 && /item 002-bad: the key slug cannot be read/.test(e.message) && !e.message.includes(home));
  assert.throws(() => store.load(folder), e => e.message.includes('item 002-bad: the key slug cannot be read'));
  const tol = readItems(folder, { tolerant: true });
  assert.deepEqual(tol.items.map(x => x.item.seq), [1]);
  assert.deepEqual(tol.bad.map(b => [b.path, b.reason, b.error.code]), [['phases/002-bad.json', 'item file: slug is missing or not text', 'UNREADABLE_ITEM']]);

  const big = folderOf(home, 'acme/big'); put(big, mk(1)); writeFileSync(join(big, 'phases', '2000000000-x.json'), toFile(mk(2), parallel));
  assert.throws(() => readItems(big), e => e.code === 'UNREADABLE_ITEM' && /above/.test(e.message));

  const linked = folderOf(home, 'acme/linked'); mkdirSync(join(home, 'elsewhere'), { recursive: true }); mkdirSync(linked, { recursive: true });
  symlinkSync(join(home, 'elsewhere'), join(linked, 'phases'));
  assert.throws(() => readItems(linked), /Symlink destination is unsupported/);

  const md = folderOf(home, 'acme/md'); mkdirSync(join(md, 'phases'), { recursive: true }); writeFileSync(join(md, 'phases', '001-a.md'), '---\nstatus: pending\n---\nbody\n');
  assert.throws(() => readItems(md), e => e.code === 'MARKDOWN_ITEMS' && e.exitCode === 2 && e.message.includes('acme/md'));
  assert.throws(() => store.load(md), e => e.code === 'MARKDOWN_ITEMS');
  assert.deepEqual(readItems(md, { tolerant: true }), { items: [], bad: [], seqs: new Set(), markdown: true });
});

// ---- one foreign item

test('foreignRaw reads one item of another folder raw, whatever else the folder holds', t => {
  const home = scratch(t);
  const own = folderOf(home); mkdirSync(own, { recursive: true });
  const lib = folderOf(home, 'acme/lib');
  put(lib, mk(42, { repository: 'someone/else', fields: { status: 'done', priority: 2, refiner: 'x' } }));
  writeFileSync(join(lib, 'phases', '050-bad.json'), 'not json');
  put(lib, mk(7, { archived: true }), 'archive/phases/007-x.json');
  const f = foreignRaw(own, 'acme/lib#42');
  assert.equal(f.repository, 'acme/lib');
  assert.deepEqual([f.seq, f.fields, f.archived, f.team], [42, { status: 'done', priority: 2, refiner: 'x' }, false, 'parallel']);
  assert.equal(foreignRaw(own, 'acme/lib#7').archived, true);
  assert.equal(foreignRaw(own, ' acme/lib#42 ').seq, 42);
  for (const id of ['acme/lib#50', 'acme/lib#43', 'acme/nope#1', 'nope#1', 'acme/lib#x', '../x/y#1', 'acme/../lib#1', undefined, '']) assert.equal(foreignRaw(own, id), null, String(id));
});

test('foreignRaw is null for two files with one number, a markdown item, an unreadable file and a link', t => {
  const home = scratch(t);
  const own = folderOf(home); mkdirSync(own, { recursive: true });
  const lib = folderOf(home, 'acme/lib');
  put(lib, mk(1)); put(lib, mk(1, { slug: '001-y' }));
  assert.equal(foreignRaw(own, 'acme/lib#1'), null);
  writeFileSync(join(lib, 'phases', '002-m.md'), '---\nstatus: x\n---\n');
  assert.equal(foreignRaw(own, 'acme/lib#2'), null);
  writeFileSync(join(lib, 'phases', '003-bad.json'), '{}');
  assert.equal(foreignRaw(own, 'acme/lib#3'), null);
  const lk = folderOf(home, 'acme/lk'); mkdirSync(lk, { recursive: true }); mkdirSync(join(home, 'out'), { recursive: true }); put(join(home, 'out'), mk(1), 'phases/001-x.json');
  symlinkSync(join(home, 'out', 'phases'), join(lk, 'phases'));
  assert.equal(foreignRaw(own, 'acme/lk#1'), null);
});

// ---- the context of a step

const entryIndex = list => index.text({ branches: { main: list.map(s => ({ seq: Number(s), slug: `${pad(s)}-x`, name: `item ${s}`, status: 'ready' })) } });
function folderWithQueue(t) {
  const home = scratch(t);
  const folder = folderOf(home);
  put(folder, mk(1)); put(folder, mk(2)); put(folder, mk(3, { fields: { status: 'closed' } })); put(folder, mk(4, { branch: 'other' }));
  put(folder, mk(5)); put(folder, mk(6, { team: 'scrum' })); put(folder, mk(8, { archived: true }));
  writeFileSync(join(folder, 'index.json'), entryIndex([2, 1, 3, 6]));
  return { home, folder };
}
const session = { id: 's1', repository: 'acme/app', branch: 'main', commit: 'abc' };
const ctxOf = (folder, extra = {}) => contextOf({ folder, entry: parallel, team: 'parallel', caller: 'ann', args: {}, session, now: T, ...extra });

test('contextOf holds every item of the folder and the queue in the order of the index, branch by branch', t => {
  const { folder } = folderWithQueue(t);
  const r = ctxOf(folder, { branch: 'main' });
  assert.deepEqual(r.order, [2, 1, 5], 'closed, archived, another team and another branch are out; the unlisted item follows the listed ones');
  assert.deepEqual(r.ctx.order, r.order);
  assert.deepEqual(ctxOf(folder).order, [2, 1, 5, 4], 'no branch: every branch, the index keys first');
  assert.deepEqual(r.ctx.items.map(i => i.seq), [1, 2, 3, 4, 5, 6, 8]);
  assert.equal(r.ctx.items.find(i => i.seq === 8).archived, true);
  assert.deepEqual([r.ctx.team, r.ctx.caller, r.ctx.session, r.ctx.now], ['parallel', 'ann', session, T]);
  assert.deepEqual(r.view.map(v => v.path).slice(0, 2), ['phases/001-x.json', 'phases/002-x.json']);
});

test('contextOf gives an item the index lacks a place, and a folder with no index a queue by number', t => {
  const { folder } = folderWithQueue(t);
  rmSync(join(folder, 'index.json'));
  assert.deepEqual(ctxOf(folder, { branch: 'main' }).order, [1, 2, 5]);
  assert.deepEqual(readdirSync(folder).sort(), ['archive', 'phases'], 'nothing is written');
});

test('contextOf reads the foreign items the step can reach once each, as the other folder holds them', t => {
  const { home, folder } = folderWithQueue(t);
  const lib = folderOf(home, 'acme/lib');
  put(lib, mk(42, { fields: { status: 'done', priority: 4 } })); put(lib, mk(9, { fields: { status: 'ready' } })); writeFileSync(join(lib, 'phases', '050-bad.json'), 'x');
  put(folder, mk(1, { fields: { status: 'ready', depends_on: ['acme/lib#42', 'acme/lib#42', 'acme/app#2', 'acme/gone#1'] } }));
  const before = list(home);
  const r = ctxOf(folder, { args: { children: 'acme/lib#9, 3' } });
  const foreign = r.ctx.items.filter(i => i.repository !== 'acme/app');
  assert.deepEqual(foreign.map(i => [i.repository, i.seq, i.fields.status]), [['acme/lib', 42, 'done'], ['acme/lib', 9, 'ready']]);
  assert.equal(r.ctx.items.length, 7 + 2, 'the own folder and the missing folder add nothing');
  assert.deepEqual(list(home), before, 'nothing is written');
  assert.equal(ctxOf(folder).ctx.items.filter(i => i.repository !== 'acme/app').length, 1, 'a reference to the own folder or to a folder that is not there adds nothing');
});

test('contextOf stops on an unreadable item of its own folder (exit 2) and never because of a foreign folder', t => {
  const { home, folder } = folderWithQueue(t);
  put(folder, mk(1, { fields: { status: 'ready', depends_on: ['acme/lib#1'] } }));
  const lib = folderOf(home, 'acme/lib'); mkdirSync(join(lib, 'phases'), { recursive: true });
  writeFileSync(join(lib, 'phases', '001-x.json'), 'broken');
  assert.deepEqual(ctxOf(folder).ctx.items.filter(i => i.repository === 'acme/lib'), []);
  writeFileSync(join(folder, 'phases', '009-bad.json'), '[]');
  assert.throws(() => ctxOf(folder), e => e.code === 'UNREADABLE_ITEM' && e.exitCode === 2 && e.message.startsWith('item 009-bad'));
});

// ---- a team item through the shared store: stored as it is

// the old team commands install the seam that reads the earlier words; every other command does not
const underTeamSeam = t => { const was = seam.entry; seam.entry = () => null; t.after(() => { seam.entry = was; }); };
const stored = (folder, item, entry) => { mkdirSync(join(folder, 'phases'), { recursive: true }); writeFileSync(join(folder, 'phases', nameOf(item)), toFile(item, entry ?? parallel)); };

test('a team item stored done is read done, with its own keys and no derived ones', t => {
  const folder = folderOf(scratch(t));
  stored(folder, mk(1, { fields: { status: 'done', priority: 3, stage: 'mine', owner: 'ann' } }));
  const [it] = store.load(folder);
  assert.equal(it.fm.status, 'done');
  assert.equal(it.fm.priority, 3);
  assert.equal(it.fm.stage, 'mine');
  assert.equal('review_state' in it.fm, false);
  assert.equal('refiner' in it.fm, false);
});

test('an item written through the store keeps every key, with or without a team', t => {
  const folder = folderOf(scratch(t));
  stored(folder, mk(1, { fields: { status: 'done', priority: 3, stage: 'mine', review_state: 'passed', review_classes: 'x' } }));
  stored(folder, mk(2, { team: '', fields: { status: 'pending', priority: 3, review_classes: 'x' } }));
  for (const i of store.load(folder)) store.write({ path: join(folder, i.path), fm: i.fm, body: i.body }, folder);
  const f1 = JSON.parse(readFileSync(join(folder, 'phases', '001-x.json'), 'utf8')).fields;
  assert.deepEqual([f1.status, f1.priority, f1.stage, f1.review_state, f1.review_classes], ['done', 3, 'mine', 'passed', 'x']);
  const f2 = JSON.parse(readFileSync(join(folder, 'phases', '002-x.json'), 'utf8')).fields;
  assert.deepEqual(Object.keys(f2).sort(), ['priority', 'review_classes', 'status']);
});

test('the old team code under its seam still reads the earlier words of every item and drops what it derived', t => {
  underTeamSeam(t);
  const folder = folderOf(scratch(t));
  stored(folder, mk(1, { fields: { status: 'done' } }));
  stored(folder, mk(2, { team: '', fields: { status: 'done' } }));
  stored(folder, mk(3, { fields: { status: 'in_progress', stage: 'ready', review_state: 'requested' } }));
  const [a, b, c] = store.load(folder);
  assert.deepEqual([a.fm.status, b.fm.status, c.fm.status], ['closed', 'closed', 'ready for review']);
  store.write({ path: join(folder, a.path), fm: a.fm, body: a.body }, folder);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(folder, 'phases', '001-x.json'), 'utf8')).fields), ['status']);
});

// ---- the review's findings

test('toFile without the team entry is a programming error, never an alphabetical order', () => {
  for (const entry of [undefined, null, {}, { item: null }]) assert.throws(() => toFile(mk(1), entry), TypeError);
});

test('writeDoc refuses a field called __proto__, as readDoc does', () => {
  const doc = { seq: 1, slug: '001-a', name: 'A', repository: 'r', branch: 'b', created: null, updated: T, updated_by: '', fields: JSON.parse('{"__proto__": {"x": 1}}'), body: '', history: [] };
  assert.throws(() => writeDoc(doc), e => e.field === '__proto__');
});

test('foreignRaw is null for a file whose item calls itself another number and for a number above the bound', t => {
  const home = scratch(t);
  const own = folderOf(home); mkdirSync(own, { recursive: true });
  const lib = folderOf(home, 'acme/lib');
  put(lib, mk(7, { slug: '002-x' }), 'phases/002-x.json');
  assert.equal(foreignRaw(own, 'acme/lib#2'), null);
  assert.equal(foreignRaw(own, 'acme/lib#7'), null, 'the file name does not carry 7');
  put(lib, mk(2000000000, { slug: '2000000000-x' }), 'phases/2000000000-x.json');
  assert.equal(foreignRaw(own, 'acme/lib#2000000000'), null);
  put(lib, mk(3), 'phases/003-x.json');
  assert.equal(foreignRaw(own, 'acme/lib#3').seq, 3);
});

test('contextOf scans the foreign references of the team\'s items only, not of another team\'s', t => {
  const { home, folder } = folderWithQueue(t);
  put(folderOf(home, 'acme/lib'), mk(9));
  put(folder, mk(6, { team: 'scrum', fields: { status: 'ready', depends_on: ['acme/lib#9'] } }));
  assert.equal(ctxOf(folder).ctx.items.filter(i => i.repository === 'acme/lib').length, 0);
});

test('readItems counts the numbers of file names and of live items, never the own number of an archived item', t => {
  const folder = folderOf(scratch(t));
  put(folder, mk(1)); put(folder, mk(99, { archived: true, slug: '002-x' }), 'archive/phases/002-x.json');
  assert.deepEqual([...readItems(folder).seqs].sort((a, b) => a - b), [1, 2]);
});

test('readItems in tolerant mode lists a link and a number above the bound and goes on; strict mode stops', t => {
  const home = scratch(t);
  const folder = folderOf(home); put(folder, mk(1));
  mkdirSync(join(home, 'elsewhere'), { recursive: true }); writeFileSync(join(home, 'elsewhere', 'o.json'), toFile(mk(2), parallel));
  symlinkSync(join(home, 'elsewhere', 'o.json'), join(folder, 'phases', '002-x.json'));
  writeFileSync(join(folder, 'phases', '2000000000-x.json'), toFile(mk(3), parallel));
  const r = readItems(folder, { tolerant: true });
  assert.deepEqual(r.items.map(x => x.item.seq), [1]);
  assert.deepEqual(r.bad.map(b => [b.path, b.kind]).sort(), [['phases/002-x.json', 'link'], ['phases/2000000000-x.json', 'number']]);
  assert.ok(r.bad.every(b => b.error && b.reason === b.error.message));
  assert.throws(() => readItems(folder), /Symlink destination is unsupported|above/);
  const linked = folderOf(home, 'acme/linked'); mkdirSync(linked, { recursive: true }); symlinkSync(join(home, 'elsewhere'), join(linked, 'phases'));
  assert.deepEqual(readItems(linked, { tolerant: true }).bad.map(b => [b.path, b.kind]), [['phases', 'link']]);
});
