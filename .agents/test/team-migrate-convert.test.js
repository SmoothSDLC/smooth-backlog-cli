// B22a: the conversion of one markdown item to the JSON item (pure; chapter 02 section 5 row by row, chapter 06 sections 4.5 and 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkKept, convertItem } from '../../src/team/migrate-convert.js';
import { readDoc, writeDoc } from '../../src/shared/item-json.js';
import { parseEvent } from '../../src/shared/item-file.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/shared/', import.meta.url));
const md = (header, body = 'body\n') => `---\n${header}\n---\n${body}`;
const BASE = "phase: 001-a\nseq: 1\nname: A\nstatus: pending";
const conv = (header, opts = {}, body) => convertItem(md(header, body), { folderRepo: 'acme/app', ...opts });
const fails = (header, re, opts = {}, body) => assert.throws(() => conv(header, opts, body), e => e.code === 'HEADER_UNREADABLE' && re.test(e.message) && !e.message.includes('---'), header);

test('the six fixture forms convert, and the JSON reads back to what the header held', () => {
  for (const f of readdirSync(FIXTURES).filter(n => n.endsWith('.md'))) {
    // the codec fixtures carry no identity: the three keys the conversion needs are added in front where the file lacks them
    const text = readFileSync(FIXTURES + f, 'utf8');
    const lack = [['phase', '001-a'], ['seq', '1'], ['name', 'A']].filter(([k]) => !new RegExp(`^${k}:`, 'm').test(text)).map(([k, v]) => `${k}: ${v}\n`).join('');
    const r = convertItem(text.replace(/^---\n/, `---\n${lack}`), { folderRepo: 'acme/app' });
    assert.deepEqual(readDoc(r.json), r.item, f);
    assert.equal(r.item.body, r.body, f);
    for (const k of ['priority', 'work_class', 'review_classes']) assert.equal(k in r.item.fields, false, `${f}: ${k} is dropped`);
  }
});

test('an open item of a team with an entry is converted: envelope, fields, body and the text of the file', () => {
  const r = conv("phase: 007-x\nseq: 7\nname: X\nteam: t1\nrepository: acme/other\nbranch: b\ncreated: '2026-01-01T00:00:00Z'\nupdated: '2026-01-02T00:00:00Z'\nupdated_by: ann\nstatus: pending\nobjective: o", { order: ['status', 'objective'] });
  assert.deepEqual([r.slug, r.seq], ['007-x', 7]);
  assert.deepEqual(r.doc, { seq: 7, slug: '007-x', name: 'X', team: 't1', repository: 'acme/other', branch: 'b', created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', updated_by: 'ann', fields: { status: 'pending', objective: 'o' }, body: 'body\n', history: [] });
  assert.equal(r.json, readFileSync(new URL('./fixtures/migrate/team-item.json', import.meta.url), 'utf8'));
});

test('absent created and updated_by become null and empty text; absent repository, branch and updated take the envelope defaults; a present repository is kept', () => {
  const r = conv(BASE);
  assert.deepEqual([r.item.created, r.item.updated_by, r.item.repository, r.item.branch, r.item.updated], [null, '', 'acme/app', '', '']);
  assert.equal(conv(`${BASE}\nrepository: acme/else`).item.repository, 'acme/else');
});

test('both spellings of the header give the same item', () => {
  const old = conv("phase: 001-a\nseq: 1\nname: A\nupdated: T\nupdated_by: ann\nclaimed_by: bob\nclaimed_at: S");
  const now = conv("phase: 001-a\nseq: 1\ntitle: A\nlast_updated: T\nlast_updated_by: ann\nowner: bob\nowned_since: S");
  assert.equal(old.json, now.json);
  assert.deepEqual([old.item.name, old.item.updated, old.item.updated_by, old.item.fields], ['A', 'T', 'ann', { owner: 'bob', owned_since: 'S' }]);
});

test('the mapping table, row by row', () => {
  const r = conv(`${BASE}\npriority: 3\nwork_class:\n- x\nreview_classes: [y]\ncompleted_at: Z\nstage: refined\nreview_state: none\nrefiner: bob\nreviews:\n- a b\nunknown_key: 1\nflag: true\nnothing: null`);
  assert.deepEqual(r.item.fields, { status: 'pending', completed: 'Z', stage: 'refined', review_state: 'none', refiner: 'bob', reviews: ['a b'], unknown_key: 1, flag: true, nothing: null });
  assert.equal('completed' in conv(`${BASE}\ncompleted: C\ncompleted_at: Z`).item.fields, true);
  assert.deepEqual(conv(`${BASE}\ncompleted: C\ncompleted_at: Z`).item.fields, { status: 'pending', completed: 'C', completed_at: 'Z' });
  assert.equal(conv(`${BASE}\nteam: ''`).item.team, undefined, 'an empty team is no key');
});

test('the holder: claimed_by and claimed_at fill owner and owned_since only when those are empty; two names are a failure; nothing is invented', () => {
  assert.deepEqual(conv(`${BASE}\nclaimed_by: bob\nclaimed_at: S`).item.fields, { status: 'pending', owner: 'bob', owned_since: 'S' });
  assert.deepEqual(conv(`${BASE}\nowner: alice`).item.fields, { status: 'pending', owner: 'alice' }, 'the user an item belongs to stays; no owned_since is made up');
  assert.deepEqual(conv(`${BASE}\nclaimed_by: bob`).item.fields, { status: 'pending', owner: 'bob' });
  assert.deepEqual(conv(`${BASE}\nowner: ''\nclaimed_by: bob`).item.fields, { status: 'pending', owner: 'bob' });
  assert.deepEqual(conv(`${BASE}\nowner: alice\nclaimed_by: ''`).item.fields, { status: 'pending', owner: 'alice' });
  assert.deepEqual(conv(`${BASE}\nowner: bob\nclaimed_by: bob`).item.fields, { status: 'pending', owner: 'bob' });
  fails(`${BASE}\nowner: alice\nclaimed_by: bob`, /owner and claimed_by both hold a name/);
});

test('depends_on: none, a list of numbers, a slug of the folder, a foreign form, an unresolved slug', () => {
  const slugs = new Map([['003-c', 3]]);
  const dep = (v, o = { slugs }) => conv(`${BASE}\ndepends_on: ${v}`, o);
  assert.deepEqual(dep('none').item.fields.depends_on, []);
  assert.deepEqual(dep('[]').item.fields.depends_on, []);
  assert.deepEqual(dep('3, 5').item.fields.depends_on, [3, 5]);
  assert.deepEqual(conv(`${BASE}\ndepends_on:\n- 73\n- 007`).item.fields.depends_on, [73, 7]);
  assert.deepEqual(dep('003-c').item.fields.depends_on, [3]);
  assert.deepEqual(dep('003-c', { slugs: { '003-c': 3 } }).item.fields.depends_on, [3]);
  const foreign = dep('acme/app#4');
  assert.deepEqual([foreign.item.fields.depends_on, foreign.warnings], [['acme/app#4'], []]);
  const gone = dep('9-gone, 003-c');
  assert.deepEqual([gone.item.fields.depends_on, gone.warnings], [['9-gone', 3], ['depends_on 9-gone names no item of the folder']]);
  assert.equal('depends_on' in conv(BASE).item.fields, false, 'an absent key stays absent');
});

test('history: a line is split at its first two spaces and the rest is the note, unchanged', () => {
  const sha = 'a3b13516ad9b15b5017f8de45426cbeb5c827594';
  const r = conv(`${BASE}\nevents:\n- "2026-11-08T06:30:02Z state_change pr2/topology-after-pr1 ${sha} set"\n- "2026-11-05T22:39:44Z planning_event - - added x at rank end"\n- 2026-11-05T22:39:44Z claimed\n- 2026-11-05T22:39:44Z\n- "2026-11-05T22:39:44Z  two  spaces"`);
  const e = r.item.history;
  assert.deepEqual(e[0], { at: '2026-11-08T06:30:02Z', by: '', session: '', step: 'state_change', changes: {}, note: `pr2/topology-after-pr1 ${sha} set` });
  assert.equal(e[1].note, '- - added x at rank end');
  assert.deepEqual([e[2].step, e[2].note, e[3].at, e[3].step, e[3].note], ['claimed', '', '2026-11-05T22:39:44Z', '', '']);
  assert.deepEqual([e[4].step, e[4].note], ['', 'two  spaces']);
  assert.deepEqual(conv(`${BASE}\nevents: []`).item.history, []);
  assert.deepEqual(conv(BASE).item.history, []);
  fails(`${BASE}\nevents: abc`, /events is not a list/);
  fails(`${BASE}\nevents:\n- 5`, /events holds an entry that is not text/);
});

test('a history line round-trips through the old-line reader with its branch and commit, and a short line prints without undefined', () => {
  const sha = 'a3b13516ad9b15b5017f8de45426cbeb5c827594';
  const e = conv(`${BASE}\nevents:\n- "T state_change main ${sha} set"\n- T claimed`).item.history;
  assert.deepEqual(parseEvent(`${e[0].at} ${e[0].step} ${e[0].note}`), { ts: 'T', event: 'state_change', branch: 'main', commit_sha: sha, note: 'set' });
  assert.deepEqual(parseEvent(`${e[1].at} ${e[1].step} ${e[1].note}`), { ts: 'T', event: 'claimed', branch: '', commit_sha: '', note: '' });
});

test('a BOM and CRLF give LF in the body', () => {
  const r = convertItem(`﻿---\r\n${BASE.replaceAll('\n', '\r\n')}\r\n---\r\nline one\r\nline two\r\n`, { folderRepo: 'r' });
  assert.equal(r.body, 'line one\nline two\n');
  assert.equal(r.item.body, 'line one\nline two\n');
});

test('seq and phase must match the file name; a phase may be absent when the file name gives it', () => {
  assert.equal(conv('seq: 8\nname: A', { fileName: '008-a.md' }).slug, '008-a');
  assert.equal(conv(BASE, { fileName: '001-a' }).slug, '001-a');
  fails('phase: 008-a\nseq: 7\nname: A', /seq 7 differs from the file name's number 8/, { fileName: '008-a.md' });
  fails('phase: 008-b\nseq: 8\nname: A', /phase 008-b differs from the file name/, { fileName: '008-a.md' });
  fails('seq: 8\nname: A', /phase is missing/);
});

test('every failure is "the header cannot be read (<reason>)" and names a key, never the text', () => {
  fails('phase: 001-a\nname: A', /seq is missing/);
  fails("phase: 001-a\nseq: '4'\nname: A", /seq is missing or not a whole number/);
  fails('phase: 001-a\nseq: 1', /name is missing/);
  fails('phase: 001-a\nseq: 1\nname: 5', /name is not text/);
  fails(`${BASE}\nstatus: done`, /status is written twice/);
  fails(`${BASE}\ntitle: B`, /name and title hold different values/);
  fails(`${BASE}\nslug: x`, /slug is a key of the file/);
  fails(`${BASE}\nteam: 3`, /team is not text/);
  fails(`${BASE}\nupdated: 3`, /updated is not text/);
  assert.throws(() => convertItem('no header here\n'), /the header cannot be read \(there is no front-matter block\)/);
  assert.throws(() => convertItem(md('phase: 1\nseq: 1\nname: [broken')), e => /^the header cannot be read \(/.test(e.message) && e.field === 'name');
  assert.doesNotThrow(() => conv(`${BASE}\ntitle: A`), 'two spellings with the same value are one value');
});

test('a header key called history, fields or body converts as a field', () => {
  assert.deepEqual(conv(`${BASE}\nhistory: h\nfields: f\nbody: b`).item.fields, { status: 'pending', history: 'h', fields: 'f', body: 'b' });
});

test('the fields come out in the order of the definition, then alphabetically', () => {
  const r = conv(`${BASE}\nzeta: 1\nalpha: 2\nobjective: o`, { order: ['objective', 'status'] });
  assert.deepEqual(Object.keys(JSON.parse(r.json).fields), ['objective', 'status', 'alpha', 'zeta']);
});

test('the key-by-key check names the first key that would change, an extra key and a changed body', () => {
  const r = conv(`${BASE}\nobjective: o\nowner: ann\ndepends_on: 3\nevents:\n- T claimed`);
  assert.doesNotThrow(() => checkKept(r.fm, r.body, r.item, undefined));
  const tampered = (mut) => { const item = structuredClone(r.item); mut(item); return item; };
  const stops = (mut, key, body = r.body) => assert.throws(() => checkKept(r.fm, body, tampered(mut), undefined), e => e.field === key && e.message === `the header cannot be read (${key} would change)`);
  stops(i => { i.fields.objective = 'x'; }, 'objective');
  stops(i => { i.fields.owner = 'x'; }, 'owner');
  stops(i => { i.fields.depends_on = [4]; }, 'depends_on');
  stops(i => { i.history[0].note = 'x'; }, 'events');
  stops(i => { i.history = []; }, 'events');
  stops(i => { i.name = 'x'; }, 'name');
  stops(i => { i.slug = 'x'; }, 'phase');
  stops(i => { i.fields.extra = 1; }, 'extra');
  stops(() => {}, 'body', 'other\n');
});

test('convertItem refuses a document text that does not hold what the header held (its own call of the check)', () => {
  const text = md(`${BASE}\nobjective: o\nevents:\n- T claimed`);
  const faulty = edit => (doc, o) => writeDoc(edit(structuredClone(doc)), o);
  assert.throws(() => convertItem(text, { write: faulty(d => { d.fields.objective = 'x'; return d; }) }), e => e.field === 'objective' && /objective would change/.test(e.message));
  assert.throws(() => convertItem(text, { write: faulty(d => { d.history = []; return d; }) }), e => e.field === 'events');
  assert.throws(() => convertItem(text, { write: faulty(d => { d.body = 'x'; return d; }) }), e => e.field === 'body');
  assert.doesNotThrow(() => convertItem(text, { write: faulty(d => d) }));
});

test('a quoted history line with trailing spaces converts and the note keeps them; a tail of spaces after the step is no content', () => {
  const r = conv(`${BASE}\nevents:\n- 'T claimed main abc some note  '\n- 'T claimed '\n- 'T '`);
  assert.equal(r.item.history[0].note, 'main abc some note  ');
  assert.deepEqual(r.item.history.slice(1).map(e => [e.at, e.step, e.note]), [['T', 'claimed', ''], ['T', '', '']]);
});

test('a holder that is null stays null and an empty one stays empty text', () => {
  assert.equal(conv(`${BASE}\nowner: ~`).item.fields.owner, null);
  assert.equal(conv(`${BASE}\nowner:`).item.fields.owner, null);
  assert.equal(conv(`${BASE}\nowner: ''`).item.fields.owner, '');
  assert.equal(conv(`${BASE}\nclaimed_by: ''`).item.fields.owner, '');
  assert.equal(conv(`${BASE}\nowner: ~\nclaimed_by: bob`).item.fields.owner, 'bob');
});

test('a seq outside 1 to MAX_SEQ is refused, with or without a file name', () => {
  for (const seq of [0, -1, 1000000001, 2000000000]) {
    fails(`phase: 001-a\nseq: ${seq}\nname: A`, new RegExp(`seq ${seq} is outside the numbers the CLI can use`));
    fails(`phase: 001-a\nseq: ${seq}\nname: A`, /seq/, { fileName: '001-a.md' });
  }
  assert.equal(conv('phase: 001-a\nseq: 1000000000\nname: A').seq, 1000000000);
});

test('the module is pure: no disk, no store, no team file', () => {
  const src = readFileSync(fileURLToPath(new URL('../../src/team/migrate-convert.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /node:fs|shared\/store|teams-file|teams-load|\.load\(|\.write\(/);
});
