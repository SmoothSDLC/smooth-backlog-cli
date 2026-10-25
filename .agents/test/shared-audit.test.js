// Tests for the full-audit batch of PR #3 (an independent reviewer's reproductions, ported). One clone, one consumer repository acme/demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  writeFileSync(alpha, `\uFEFF${readFileSync(alpha, 'utf8')}`); // saved by an editor that adds a BOM
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

test('review: archive stamps the status of a file that starts with a BOM and keeps the BOM', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  assert.equal(s.run(NEW('beta job')).status, 0);
  const path = join(s.folder, 'phases', '001-alpha-job.md');
  writeFileSync(path, `\uFEFF${readFileSync(path, 'utf8')}`);
  const r = s.run(['archive', '1', '--force']);
  assert.equal(r.status, 0, out(r));
  const moved = readFileSync(join(s.folder, 'archive', 'phases', '001-alpha-job.md'), 'utf8');
  assert.ok(moved.startsWith('\uFEFF---\n')); assert.match(moved, /^status: archived$/m);
  assert.doesNotMatch(moved, /status: "pending"/);
});

test('review: a phases/ file without front matter is no item for new, query or update (no fake mirror row, never rewritten)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const readme = join(s.folder, 'phases', 'README.md'); const note = 'notes for humans\n';
  writeFileSync(readme, note);
  assert.equal(s.run(NEW('beta job')).status, 0);
  const q = s.run(['query', '--phase', 'README']);
  assert.doesNotMatch(q.stdout, /README\b.*pending|phase README/i, out(q));
  const u = s.run(['update', 'README', '--summary', 'test']);
  assert.equal(u.status, 1, out(u));
  assert.equal(readFileSync(readme, 'utf8'), note);
  const con = db.connect(s.folder);
  try { assert.equal(con.prepare("SELECT COUNT(*) AS n FROM phase WHERE slug LIKE 'README%'").get().n, 0); } finally { con.close(); }
});

test('review: update --seq refuses a number another item holds (archived ones included)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0); assert.equal(s.run(NEW('beta job')).status, 0);
  const file = join(s.folder, 'phases', '002-beta-job.md');
  const r = s.run(['update', '2', '--seq', '1']);
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /already item 001-alpha-job/);
  assert.equal(s.run(['archive', '1', '--force']).status, 0);
  const again = s.run(['update', '2', '--seq', '1']);
  assert.equal(again.status, 1, out(again));
  assert.match(readFileSync(file, 'utf8'), /^seq: 2$/m);
  assert.equal(s.run(['update', '2', '--seq', '7']).status, 0);
});

test('review: releasing a claim after --request-review does not let the author review her own work', t => {
  const s = solo(t);
  const made = s.run(FULL('alpha job')); assert.equal(made.status, 0, out(made));
  for (const args of [['update', '1', '--claim', 'alice'], ['update', '1', '--request-review', 'bob', '--note', 'please look'], ['update', '1', '--release', 'alice']]) {
    const r = s.run(args); assert.equal(r.status, 0, out(r));
  }
  const own = s.run(['update', '1', '--review', 'pass', '--by', 'alice', '--comments', 'references/review/docs.md']);
  assert.equal(own.status, 1, out(own)); assert.match(out(own), /cannot review its own work/);
  const start = s.run(['update', '1', '--start-review', '--by', 'alice']);
  assert.equal(start.status, 1, out(start));
  const other = s.run(['update', '1', '--review', 'pass', '--by', 'bob', '--comments', 'checked against references/review/docs.md']);
  assert.equal(other.status, 0, out(other)); // another agent still can
});

test('review: a clone whose upstream is origin/side and push.default=upstream still publishes to origin/main', t => {
  const s = solo(t);
  const bare = join(s.tmp, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  gitIn(s.home, 'push', '-q', 'origin', 'HEAD:refs/heads/side');
  gitIn(s.home, 'fetch', '-q', 'origin');
  gitIn(s.home, 'branch', '--set-upstream-to=origin/side');
  gitIn(s.home, 'config', 'push.default', 'upstream');
  const side = gitIn(bare, 'rev-parse', 'side');
  const r = s.run(NEW('alpha job'));
  assert.equal(r.status, 0, out(r));
  assert.match(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main'), /acme\/demo\/phases\/001-alpha-job\.md/);
  assert.equal(gitIn(bare, 'rev-parse', 'side'), side, 'side is untouched');
  assert.equal(s.run(['update', '1', '--summary', 'again']).status, 0); // later pulls follow main too
});

test('review P1: a command killed (kill -9) mid-mutation is rolled back by the next command before it publishes anything', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0); assert.equal(s.run(NEW('beta job')).status, 0);
  const bare = join(s.tmp, 'origins', 'SmoothSDLC', 'smoothsdlc-backlog.git');
  const item = join(s.folder, 'phases', '001-alpha-job.md'); const before = readFileSync(item, 'utf8');
  const link = `${s.tmp}-link`; symlinkSync(s.tmp, link); t.after(() => rmSync(link, { force: true })); // the child spells the clone as macOS's /var does, the next command as /private/var
  const child = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'shared-audit-child.js'), join(link, 'home'), join(link, 'home', 'acme', 'demo')], { encoding: 'utf8' });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(existsSync(item), false, 'the child died after its move');
  const r = s.run(['update', '2', '--summary', 'next']);
  assert.equal(r.status, 0, out(r)); assert.match(r.stderr, /rolled back a command that was killed/);
  assert.equal(readFileSync(item, 'utf8'), before, 'item 1 is back, still pending');
  assert.equal(existsSync(join(s.folder, 'archive', 'phases', '001-alpha-job.md')), false);
  const con = db.connect(s.folder);
  try { assert.deepEqual({ ...con.prepare('SELECT status, path FROM phase WHERE seq=1').get() }, { status: 'pending', path: 'phases/001-alpha-job.md' }); } finally { con.close(); }
  const tree = gitIn(bare, 'ls-tree', '-r', '--name-only', 'main');
  assert.match(tree, /acme\/demo\/phases\/001-alpha-job\.md/); assert.doesNotMatch(tree, /archive/);
  assert.equal(gitIn(s.home, 'status', '--porcelain'), '');
});

test('review: update --seq is refused while another item (archived included) depends on the item', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0); assert.equal(s.run(NEW('beta job', '--depends-on', '1')).status, 0);
  const r = s.run(['update', '1', '--seq', '3']);
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /002-beta-job depends on 001-alpha-job/);
  assert.equal(s.run(['update', '2', '--set-depends-on', 'none']).status, 0);
  assert.equal(s.run(['update', '1', '--seq', '3']).status, 0);
});
