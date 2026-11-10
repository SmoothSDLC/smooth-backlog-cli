// R12 scenarios on real git repositories in a temporary folder: node --test numbers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocate, git, highWater, publishByRebase, publishByRerun, seed } from './numbers.mjs';

const F = 'acme/app';
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'spike';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'spike@test.invalid';
function world(t) {
  const root = mkdtempSync(join(tmpdir(), 'numbers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const clone = name => { git(root, 'clone', '-q', 'origin.git', name); return join(root, name); };
  const a = clone('a');
  git(a, 'commit', '-q', '--allow-empty', '-m', 'base'); git(a, 'push', '-q', '-u', 'origin', 'main');
  return { root, a, clone };
}
const commit = (cwd, m) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', m); };
const items = cwd => git(cwd, 'ls-files', `${F}/phases`).trim().split('\n').filter(Boolean);

test('deleting the newest item does not give its number again', t => {
  const { a } = world(t);
  allocate(a, F, 'one'); allocate(a, F, 'two'); commit(a, 'two items');
  git(a, 'rm', '-q', `${F}/phases/002-two.json`); commit(a, 'clean');
  assert.equal(allocate(a, F, 'three'), 3);
});

test('a reverted creation and a lowered or deleted counter do not give the number again', t => {
  const { a } = world(t);
  allocate(a, F, 'one'); commit(a, 'one');
  allocate(a, F, 'two'); commit(a, 'two');
  git(a, 'revert', '--no-edit', 'HEAD');
  assert.deepEqual(items(a), [`${F}/phases/001-one.json`]);
  assert.equal(highWater(a, F), 2);
  writeFileSync(join(a, F, 'numbers.json'), '{"last": 0}\n'); commit(a, 'lowered by hand');
  unlinkSync(join(a, F, 'numbers.json')); commit(a, 'deleted');
  assert.equal(allocate(a, F, 'three'), 3);
});

test('another clone published and deleted the same number: a team command re-runs on upstream and takes the next number', t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, F, 'alpha'); commit(a, 'A 1'); git(a, 'push', '-q');
  git(a, 'rm', '-q', `${F}/phases/001-alpha.json`); commit(a, 'A clean 1'); git(a, 'push', '-q');
  assert.equal(allocate(b, F, 'beta'), 1); commit(b, 'B 1'); // b has not seen A's commits yet
  let got;
  publishByRerun(b, () => { got = allocate(b, F, 'beta'); commit(b, 'B again'); });
  assert.equal(got, 2);
  assert.deepEqual(items(b), [`${F}/phases/002-beta.json`]);
});

test('the same race through a user command: the rebase is clean, the number is still renumbered above upstream', t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, F, 'alpha'); commit(a, 'A 1'); git(a, 'push', '-q');
  git(a, 'rm', '-q', `${F}/phases/001-alpha.json`); commit(a, 'A clean 1'); git(a, 'push', '-q');
  allocate(b, F, 'beta'); commit(b, 'B 1');
  publishByRebase(b, F);
  assert.deepEqual(items(b), [`${F}/phases/002-beta.json`]);
  assert.match(git(b, 'show', `HEAD:${F}/numbers.json`), /"last":2/);
});

test('two clones create at once: the counter conflict takes the larger value and the later item is renumbered', t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, F, 'alpha'); allocate(a, F, 'gamma'); commit(a, 'A 1 2'); git(a, 'push', '-q');
  allocate(b, F, 'beta'); commit(b, 'B 1');
  publishByRebase(b, F);
  assert.deepEqual(items(b), [`${F}/phases/001-alpha.json`, `${F}/phases/002-gamma.json`, `${F}/phases/003-beta.json`]);
});

test('a shallow clone refuses to hand out a number', t => {
  const { root, a } = world(t);
  allocate(a, F, 'one'); commit(a, 'one'); allocate(a, F, 'two'); commit(a, 'two'); git(a, 'push', '-q');
  git(root, 'clone', '-q', '--depth', '1', `file://${join(root, 'origin.git')}`, 's');
  assert.throws(() => allocate(join(root, 's'), F, 'x'), /shallow/);
});

test("the migration seeds its own folder from the folder's history, deleted files included, and reads no other folder", t => {
  const { a } = world(t);
  for (let n = 0; n < 3; n++) allocate(a, F, `x${n}`);
  allocate(a, 'acme/old', 'gone'); commit(a, 'items');
  git(a, 'rm', '-q', '-r', 'acme/old'); git(a, 'rm', '-q', `${F}/phases/003-x2.json`); commit(a, 'delete');
  unlinkSync(join(a, F, 'numbers.json')); commit(a, 'no counter yet');
  assert.equal(seed(a, F), 3);
  assert.equal(seed(a, 'acme/old'), 1); // another repository's folder is seeded only when its own repository migrates
});

test('upstream changed only another repository folder: the team command is not run again, its commit is rebased (R24)', t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, 'acme/other', 'theirs'); commit(a, 'other folder'); git(a, 'push', '-q');
  allocate(b, F, 'mine'); commit(b, 'B 1');
  let reran = false;
  publishByRerun(b, () => { reran = true; }, F);
  assert.equal(reran, false);
  assert.deepEqual(items(b), [`${F}/phases/001-mine.json`]);
});

// round 5: the adversarial tests of review C on numbers and publication (ADV-20 to ADV-23)
test('a number that exists only in a merge commit is never handed out again (review C M2)', t => {
  const { a } = world(t);
  allocate(a, F, 'one'); commit(a, 'one');
  git(a, 'checkout', '-q', '-b', 'side'); writeFileSync(join(a, 'side.txt'), 'x'); commit(a, 'side');
  git(a, 'checkout', '-q', 'main'); writeFileSync(join(a, 'main.txt'), 'y'); commit(a, 'main');
  git(a, 'merge', '-q', '--no-ff', '--no-commit', 'side');
  writeFileSync(join(a, F, 'phases', '005-merged.json'), '{"seq": 5}\n'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'merge with a new item');
  git(a, 'rm', '-q', `${F}/phases/005-merged.json`); commit(a, 'clean 5');
  assert.equal(highWater(a, F), 5);
  assert.equal(allocate(a, F, 'next'), 6);
});

test('a file-name number above the bound is an unreadable item, and never part of the mark once removed (review C M3)', t => {
  const { a } = world(t);
  mkdirSync(join(a, F, 'phases'), { recursive: true });
  writeFileSync(join(a, F, 'phases', '9007199254740993-odd.json'), '{}\n'); commit(a, 'planted');
  assert.throws(() => allocate(a, F, 'x'), /above 1000000000/);
  git(a, 'rm', '-q', `${F}/phases/9007199254740993-odd.json`); commit(a, 'removed');
  assert.deepEqual([allocate(a, F, 'x'), allocate(a, F, 'y')], [1, 2]);
});

test("a team re-run drops only the command's own commit: a person's unpushed commit in another folder stays (review C H3, question 2)", t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, F, 'alpha'); commit(a, 'A 1'); git(a, 'push', '-q');
  mkdirSync(join(b, 'acme', 'other'), { recursive: true }); writeFileSync(join(b, 'acme', 'other', 'draft.txt'), 'mine'); commit(b, 'person draft');
  allocate(b, F, 'beta'); commit(b, 'B team');
  let got;
  publishByRerun(b, () => { got = allocate(b, F, 'beta'); commit(b, 'B team again'); }, F);
  assert.equal(got, 2);
  assert.match(git(b, 'log', '--format=%s'), /person draft/);
  // provisional answer A of question 2: the person's commit is published with the change, as today's in-repository mode does
  assert.match(git(b, 'log', '--format=%s', 'origin/main'), /person draft/);
});

test('upstream changed only another folder: the commit is rebased as it is, and the push carries the branch as today (review C ADV-23, question 2)', t => {
  const { a, clone } = world(t);
  const b = clone('b');
  allocate(a, 'acme/other', 'theirs'); commit(a, 'other folder'); git(a, 'push', '-q');
  mkdirSync(join(b, 'acme', 'third'), { recursive: true }); writeFileSync(join(b, 'acme', 'third', 'draft.txt'), 'mine'); commit(b, 'person draft');
  allocate(b, F, 'mine'); commit(b, 'B 1');
  let reran = false;
  publishByRerun(b, () => { reran = true; }, F);
  assert.equal(reran, false);
  assert.match(git(b, 'log', '--format=%s', 'origin/main'), /person draft/); // under option B of question 2 only "B 1" would be published
});
