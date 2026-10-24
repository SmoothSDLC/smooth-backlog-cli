// Tests for the full-audit batch of PR #3 (an independent reviewer's reproductions, ported). One clone, one consumer repository acme/demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import * as db from '../../src/shared/db.js';
import { gitIn } from './shared-concurrency.js';

function solo(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp);
  const cons = consumer(tmp, 'acme', 'demo', 'main');
  mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(tmp, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (args, env) => cli(args, { cwd: cons, tmp, env });
  return { tmp, home, cons, folder: join(home, 'acme', 'demo'), run };
}
const NEW = (name, ...more) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', ...more];
// A complete item (the team fields update --claim needs) that is then set done in its file and ingested.
const FULL = (name, ...more) => NEW(name, '--work-class', 'docs', '--review-classes', 'docs', '--review-refs', 'references/review/docs.md', '--estimate', '5', '--body', '## Definition of done\n- [ ] x', ...more);
function finish(s, file) {
  const path = join(s.folder, 'phases', file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^status: .*$/m, 'status: done'));
  assert.equal(s.run(['query', '--all']).status, 0); // ingests the edit
}
const out = r => `${r.stdout}${r.stderr}`;

test('audit t1/t9: a refused or dry-run command leaves no untracked backlog.db that would block the next pull', t => {
  const s = solo(t);
  for (const args of [['update', '9', '--summary', 'x'], ['update', '9', '--summary', 'x', '--dry-run'], ['archive', '9'], ['archive', '9', '--dry-run'],
    ['move', '9', '--to-repository', 'other/proj'], NEW('x', '--depends-on', '99'), NEW('x', '--dry-run')]) {
    s.run(args);
    assert.equal(existsSync(join(s.folder, 'backlog.db')), false, `${args.join(' ')} left a backlog.db`);
    assert.equal(gitIn(s.home, 'status', '--porcelain'), '', `${args.join(' ')} left untracked files`);
  }
  assert.equal(s.run(NEW('real one')).status, 0); // the db is created and committed by a command that records something
  assert.equal(existsSync(join(s.folder, 'backlog.db')), true);
  assert.equal(s.run(['update', '9', '--summary', 'x']).status, 1); // an existing db stays
  assert.equal(existsSync(join(s.folder, 'backlog.db')), true);
});

test('audit t4: a done item can be neither claimed nor released back into the queue (it stays done)', t => {
  const s = solo(t);
  const made = s.run(FULL('alpha job')); assert.equal(made.status, 0, out(made));
  finish(s, '001-alpha-job.md');
  for (const args of [['update', '1', '--claim', 'amy'], ['update', '1', '--release', 'amy']]) {
    const r = s.run(args);
    assert.equal(r.status, 1, out(r));
    assert.match(out(r), /finished item cannot be (claimed|released)/);
  }
  const file = readFileSync(join(s.folder, 'phases', '001-alpha-job.md'), 'utf8');
  assert.match(file, /^status: done$/m); assert.doesNotMatch(file, /claimed_by: amy/);
});

test('audit: update --status takes only pending, in_progress or done (archived and unknown words are refused, the file is unchanged)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const file = join(s.folder, 'phases', '001-alpha-job.md'); const before = readFileSync(file, 'utf8');
  for (const word of ['archived', 'bogus']) {
    const r = s.run(['update', '1', '--status', word]);
    assert.equal(r.status, 1, out(r)); assert.match(out(r), /use pending, in_progress or done/);
    assert.equal(readFileSync(file, 'utf8'), before); assert.equal(existsSync(join(s.folder, 'archive', '001-alpha-job.md')), false);
  }
  assert.equal(s.run(['update', '1', '--status', 'in_progress']).status, 0);
});

test('audit: update --set-depends-on refuses itself and any cycle, and leaves the file as it was', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  assert.equal(s.run(NEW('beta job', '--depends-on', '1')).status, 0); // 2 -> 1
  assert.equal(s.run(NEW('gamma job', '--depends-on', '2')).status, 0); // 3 -> 2 -> 1
  const file = join(s.folder, 'phases', '001-alpha-job.md'); const before = readFileSync(file, 'utf8');
  for (const [item, dep, why] of [['1', '1', /depend on itself/], ['1', '001-alpha-job', /depend on itself/], ['1', '3', /cycle/], ['2', '3', /cycle/]]) {
    const r = s.run(['update', item, '--set-depends-on', dep]);
    assert.equal(r.status, 1, `${item} -> ${dep}: ${out(r)}`); assert.match(out(r), why);
  }
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(s.run(['update', '3', '--set-depends-on', '1,2']).status, 0); // a diamond is no cycle
});

test('audit t3: a bound session moves nothing into another repository or branch (only the source was checked)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  gitIn(s.cons, 'push', '-q', 'origin', 'HEAD:refs/heads/release');
  const bound = { TEAM_REPOSITORY: 'acme/demo', TEAM_BRANCH: 'main' };
  const file = join(s.folder, 'phases', '001-alpha-job.md'); const before = readFileSync(file, 'utf8');
  for (const [args, why] of [[['move', '1', '--to-repository', 'other/proj'], /bound to acme\/demo; it cannot move an item to other\/proj/],
    [['move', '1', '--to-branch', 'release'], /bound to branch 'main'; it cannot move an item to branch 'release'/],
    [['move', '--all-open-of-branch', 'main', '--to-branch', 'release'], /bound to branch 'main'/]]) {
    const r = s.run(args, bound);
    assert.equal(r.status, 1, out(r)); assert.match(out(r), why);
  }
  assert.equal(readFileSync(file, 'utf8'), before); assert.equal(existsSync(join(s.home, 'other')), false);
  assert.equal(s.run(['move', '1', '--to-branch', 'release']).status, 0); // an unbound session may
});

test('audit t7: query --all and --by-branch survive an item whose status is empty (shown as None)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const con = db.connect(s.folder);
  try { con.prepare('UPDATE phase SET status=NULL').run(); } finally { con.close(); } // a mirror row without a status (a hand-edited or older database)
  for (const args of [['query', '--all'], ['query', '--by-branch', 'main']]) {
    const r = s.run(args);
    assert.equal(r.status, 0, out(r)); assert.match(r.stdout, /001-alpha-job/); assert.match(r.stdout, /None/);
  }
});

test('audit t6: a BOM file keeps its front matter; a phases/ file without front matter is skipped, reported and never rewritten', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const alpha = join(s.folder, 'phases', '001-alpha-job.md');
  writeFileSync(alpha, `﻿${readFileSync(alpha, 'utf8')}`); // saved by an editor that adds a BOM
  const readme = join(s.folder, 'phases', 'README.md'); const note = '\nnotes for humans\n\n## not front matter\n';
  writeFileSync(readme, note);
  const r = s.run(NEW('beta job', '--priority', '0'));
  assert.equal(r.status, 0, out(r));
  assert.equal(readFileSync(readme, 'utf8'), note, 'the stray file is not rewritten');
  const fixed = readFileSync(alpha, 'utf8');
  assert.match(fixed, /^name: "alpha job"$/m); assert.match(fixed, /^seq: 1$/m); // fields kept, number not reused
  assert.ok(existsSync(join(s.folder, 'phases', '002-beta-job.md')));
  const q = s.run(['query', '--all']);
  assert.equal(q.status, 0, out(q)); assert.match(q.stdout, /phases\/README\.md has no front matter/);
});
