// The checks of items and numbers against the team file: one test per row of the tables, and every finding says how to fix it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itemFindings, numberFindings } from '../../src/team/rules/validate-items.js';

const def = (extra = {}) => ({ status: { type: 'text', values: ['open', 'done'], final: ['done'] }, depends_on: { type: 'item' }, tags: { type: 'list', values: ['a', 'b'] }, ...extra });
const file = { alpha: { people: {}, item: def(), rules: {} }, beta: { people: {}, item: def(), rules: {} } };
const P = n => `o/r/phases/${String(n).padStart(3, '0')}-x.json`;
const item = (seq, fields = {}, team = 'alpha', path = P(seq)) => ({ path, seq, team, fields: { status: 'open', ...fields } });
const run = (items, opts) => itemFindings(file, items, opts);
const one = (items, opts) => { const r = run(items, opts); assert.equal(r.length, 1, JSON.stringify(r)); assert.ok(r[0].fix); assert.equal(r[0].rule, null); return r[0]; };

test('a clean item gives no finding', () => assert.deepEqual(run([item(1)]), []));

test('a team without an entry is an error', () => {
  const f = one([item(1, {}, 'gone')]);
  assert.deepEqual([f.severity, f.team, f.path, f.problem], ['error', 'gone', P(1), 'team gone has no entry in teams.json']);
});

test('a value outside the values is an error, entry by entry for a list', () => {
  assert.equal(one([item(1, { status: 'refining' })]).problem, 'status "refining" is not a value of status of team alpha');
  const r = run([item(1, { tags: ['a', 'x', 'y'] })]);
  assert.deepEqual(r.map(f => [f.severity, f.problem]), [['error', 'tags "x" is not a value of tags of team alpha'], ['error', 'tags "y" is not a value of tags of team alpha']]);
  assert.deepEqual(run([item(1, { tags: ['a', 'b'] })]), []);
});

test('a field the definition does not declare is a warning', () => {
  const f = one([item(1, { stage: 'x' })]);
  assert.deepEqual([f.severity, f.problem], ['warning', 'field stage is not declared by the item definition of team alpha; rules cannot read it']);
});

test('an item field naming no item is a warning; a live item and a given number resolve', () => {
  const f = one([item(1, { depends_on: 99 })]);
  assert.deepEqual([f.severity, f.problem], ['warning', 'field depends_on names no item 99']);
  assert.deepEqual(run([item(1, { depends_on: 2 }), item(2)]), []);
  assert.deepEqual(run([item(1, { depends_on: 7 })], { seqs: new Set([1, 7]) }), []);
});

test('a foreign reference that does not resolve is a warning', () => {
  const ref = 'p/q#4';
  assert.equal(one([item(1, { depends_on: ref })], { foreign: () => null }).problem, 'field depends_on names no item p/q#4');
  assert.deepEqual(run([item(1, { depends_on: ref })], { foreign: () => ({ seq: 4 }) }), []);
  assert.deepEqual(run([item(1, { depends_on: ref })]), [], 'without a resolver the reference is not judged');
});

test('a seq that differs from the file name is an error', () => {
  const f = one([item(5, {}, 'alpha', P(3))]);
  assert.deepEqual([f.severity, f.problem], ['error', "seq 5 differs from the file name's number 3"]);
});

test('archived items are not checked', () => {
  assert.deepEqual(run([item(1, { status: 'bogus' }, 'gone', 'o/r/archive/001-x.json')]), []);
});

test('teams not asked for are skipped unless all', () => {
  const items = [item(1, { status: 'bad' }), item(2, { status: 'bad' }, 'beta')];
  assert.deepEqual(run(items, { team: 'beta' }).map(f => f.team), ['beta']);
  assert.deepEqual(run(items, { team: 'beta', all: true }).map(f => f.team), ['alpha', 'beta']);
  assert.equal(run(items).length, 2);
});

test('items of no team and odd input give no finding and no throw', () => {
  assert.deepEqual(run([{ path: P(1), seq: 1, fields: {} }]), []);
  for (const bad of [null, undefined, 5, [null, 3, {}], [{ team: 'alpha', fields: 5, path: 7 }]]) assert.doesNotThrow(() => itemFindings(file, bad));
  for (const f of [null, [], 'x']) assert.doesNotThrow(() => itemFindings(f, [item(1)]));
  assert.doesNotThrow(() => itemFindings({ alpha: { item: 5 } }, [item(1)]));
});

// numbers
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'pipe' });
const repo = () => {
  const top = mkdtempSync(join(tmpdir(), 'vitems-'));
  git(top, 'init', '-q');
  const folder = join(top, 'o', 'r');
  mkdirSync(join(folder, 'phases'), { recursive: true });
  return { top, folder };
};

test('numbers.json below the high-water mark is a warning; at the mark it is clean', () => {
  const { top, folder } = repo();
  writeFileSync(join(folder, 'numbers.json'), '{"last":5}\n');
  git(top, 'add', '.'); git(top, 'commit', '-qm', 'one');
  assert.deepEqual(numberFindings({ folder }), []);
  writeFileSync(join(folder, 'numbers.json'), '{"last":2}\n');
  const [f, ...rest] = numberFindings({ folder });
  assert.equal(rest.length, 0);
  assert.deepEqual([f.severity, f.team, f.path, f.problem], ['warning', null, 'o/r/numbers.json', 'o/r/numbers.json says 2, but number 5 was used']);
  assert.match(f.fix, /set last to 5/);
});

test('a shallow clone is a warning and the history check is skipped', () => {
  const { top, folder } = repo();
  writeFileSync(join(folder, 'numbers.json'), '{"last":1}\n');
  git(top, 'add', '.'); git(top, 'commit', '-qm', 'one');
  writeFileSync(join(folder, 'numbers.json'), '{"last":2}\n');
  git(top, 'commit', '-qam', 'two');
  const shallow = join(mkdtempSync(join(tmpdir(), 'vitems-')), 'c');
  git(top, 'clone', '-q', '--depth', '1', `file://${top}`, shallow);
  const [f, ...rest] = numberFindings({ folder: join(shallow, 'o', 'r') });
  assert.equal(rest.length, 0);
  assert.deepEqual([f.severity, f.problem, f.fix], ['warning', 'the clone is shallow: numbers are checked only against the history it holds', 'git fetch --unshallow']);
});

test('an unreadable numbers.json is an error finding, not a throw', () => {
  const { folder } = repo();
  writeFileSync(join(folder, 'numbers.json'), 'nope');
  const [f] = numberFindings({ folder });
  assert.equal(f.severity, 'error');
  assert.ok(f.fix);
  assert.doesNotThrow(() => numberFindings({}));
});
