// Tests for the full-audit batch of PR #3 (an independent reviewer's reproductions, ported). One clone, one consumer repository acme/demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG_NAME, BACKLOG_OWNER, cli, consumer, itemPath, itemRel, sharedBacklog, archivedPath, reEscape, changeItem, readHeader, bomItem } from './shared-fixtures.js';
import * as index from '../../src/shared/index.js';
import { gitIn } from './shared-concurrency.js';

function solo(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = sharedBacklog(tmp);
  const cons = consumer(tmp, 'acme', 'demo', 'main');
  mkdirSync(join(tmp, 'config', 'smooth-backlog-cli'), { recursive: true });
  const run = (args, env) => cli(args, { cwd: cons, tmp, env });
  return { tmp, home, cons, folder: join(home, 'acme', 'demo'), run };
}
const NEW = (name, ...more) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', ...more];
// A complete item (the team fields update --claim needs) that is then set done in its file and ingested.
const FULL = (name, ...more) => NEW(name, '--review-refs', 'references/review/docs.md', '--estimate', '5', '--body', '## Definition of done\n- [ ] x', ...more);
function finish(s, slug) {
  const path = itemPath(s.folder, slug);
  changeItem(path, { fm: { status: 'done' } });
  assert.equal(s.run(['list', 'all-branches']).status, 0); // ingests the edit
}
const out = r => `${r.stdout}${r.stderr}`;

test('audit t1/t9: a refused or dry-run command leaves nothing untracked that would block the next pull, and no backlog.db is ever created', t => {
  const s = solo(t);
  for (const args of [['update', '9', '--summary', 'x'], ['update', '9', '--summary', 'x', '--dry-run'], ['archive', '9'], ['archive', '9', '--dry-run'],
    ['move', '9', '--to-repository', 'other/proj'], NEW('x', '--depends-on', '99'), NEW('x', '--dry-run')]) {
    s.run(args);
    assert.equal(existsSync(join(s.folder, 'backlog.db')), false, `${args.join(' ')} left a backlog.db`);
    assert.equal(gitIn(s.home, 'status', '--porcelain'), '', `${args.join(' ')} left untracked files`);
  }
  assert.equal(s.run(NEW('real one')).status, 0);
  assert.equal(existsSync(join(s.folder, 'backlog.db')), false);
  assert.equal(gitIn(s.home, 'status', '--porcelain'), '');
});

test('audit t4: a done item can be neither claimed nor released back into the queue (it stays done)', t => {
  const s = solo(t);
  const made = s.run(FULL('alpha job')); assert.equal(made.status, 0, out(made));
  finish(s, '001-alpha-job');
  for (const args of [['update', '1', '--claim', 'amy'], ['update', '1', '--release', 'amy']]) {
    const r = s.run(args);
    assert.equal(r.status, 1, out(r));
    assert.match(out(r), /finished item cannot be (claimed|released)/);
  }
  const file = itemPath(s.folder, '001-alpha-job');
  assert.equal(readHeader(file, 'status'), 'done'); assert.ok(![readHeader(file, 'owner'), readHeader(file, 'claimed_by')].includes('amy'));
});

test('audit: update --status refuses archived (backlog archive moves a finished item), takes any other word of a plain item', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const file = itemPath(s.folder, '001-alpha-job'); const before = readFileSync(file, 'utf8');
  const r = s.run(['update', '1', '--status', 'archived']);
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /backlog archive moves a finished item to archive\//);
  assert.equal(readFileSync(file, 'utf8'), before); assert.equal(existsSync(archivedPath(s.folder, '001-alpha-job')), false);
  assert.equal(s.run(['update', '1', '--status', 'bogus']).status, 0);
  assert.equal(s.run(['update', '1', '--status', 'in_progress']).status, 0);
});

test('audit: update --set-depends-on refuses itself and any cycle, and leaves the file as it was', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  assert.equal(s.run(NEW('beta job', '--depends-on', '1')).status, 0); // 2 -> 1
  assert.equal(s.run(NEW('gamma job', '--depends-on', '2')).status, 0); // 3 -> 2 -> 1
  const file = itemPath(s.folder, '001-alpha-job'); const before = readFileSync(file, 'utf8');
  for (const [item, dep, why] of [['1', '1', /depend on itself/], ['1', '001-alpha-job', /depend on itself/], ['1', '3', /cycle/], ['2', '3', /cycle/]]) {
    const r = s.run(['update', item, '--set-depends-on', dep]);
    assert.equal(r.status, 1, `${item} -> ${dep}: ${out(r)}`); assert.match(out(r), why);
  }
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(s.run(['update', '3', '--set-depends-on', '1,2']).status, 0); // a diamond is no cycle
});

test('audit t7: list all-branches and team query --by-branch survive an item whose status is empty (shown as None)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const file = itemPath(s.folder, '001-alpha-job');
  changeItem(file, { fm: { status: null } }); // a hand-edited item without a status
  for (const args of [['list', 'all-branches'], ['team', 'query', '--team', 't1', '--by-branch', 'main']]) {
    const r = s.run(args);
    assert.equal(r.status, 0, out(r)); assert.match(r.stdout, /001-alpha-job/); assert.match(r.stdout, /None/);
  }
});

test('audit t6: a BOM file keeps its front matter; a phases/ file without front matter is skipped, reported and never rewritten', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const alpha = itemPath(s.folder, '001-alpha-job');
  bomItem(alpha); // saved by an editor that adds a BOM
  const readme = join(s.folder, 'phases', 'README.md'); const note = '\nnotes for humans\n\n## not front matter\n';
  writeFileSync(readme, note);
  const r = s.run(NEW('beta job', '--priority', '0'));
  assert.equal(r.status, 0, out(r));
  assert.equal(readFileSync(readme, 'utf8'), note, 'the stray file is not rewritten');
  assert.equal(readHeader(alpha, 'name'), 'alpha job'); assert.equal(readHeader(alpha, 'seq'), 1); // fields kept, number not reused
  assert.ok(existsSync(itemPath(s.folder, '002-beta-job')));
  const q = s.run(['list', 'all-branches']);
  assert.equal(q.status, 0, out(q)); assert.match(q.stdout, /phases\/README\.md has no front matter/);
});

test('review: archive stamps the status of a file that starts with a BOM and keeps the BOM', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  assert.equal(s.run(NEW('beta job')).status, 0);
  const path = itemPath(s.folder, '001-alpha-job');
  bomItem(path);
  const r = s.run(['archive', '1', '--force']);
  assert.equal(r.status, 0, out(r));
  const moved = readFileSync(archivedPath(s.folder, '001-alpha-job', 'phases'), 'utf8');
  assert.ok(moved.startsWith('\uFEFF---\n')); assert.match(moved, /^status: "archived"$/m);
  assert.doesNotMatch(moved, /status: "pending"/);
});

test('review: a phases/ file without front matter is no item for new, query or update (no fake mirror row, never rewritten)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0);
  const readme = join(s.folder, 'phases', 'README.md'); const note = 'notes for humans\n';
  writeFileSync(readme, note);
  assert.equal(s.run(NEW('beta job')).status, 0);
  const q = s.run(['show', 'README']);
  assert.doesNotMatch(q.stdout, /README\b.*pending|phase README/i, out(q));
  const u = s.run(['update', 'README', '--summary', 'test']);
  assert.equal(u.status, 1, out(u));
  assert.equal(readFileSync(readme, 'utf8'), note);
  assert.equal(index.rows(s.folder).rows.filter(r => r.slug.startsWith('README')).length, 0);
});

test('review: update --seq refuses a number another item holds (archived ones included)', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0); assert.equal(s.run(NEW('beta job')).status, 0);
  const file = itemPath(s.folder, '002-beta-job');
  const r = s.run(['update', '2', '--seq', '1']);
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /already item 001-alpha-job/);
  assert.equal(s.run(['archive', '1', '--force']).status, 0);
  const again = s.run(['update', '2', '--seq', '1']);
  assert.equal(again.status, 1, out(again));
  assert.equal(readHeader(file, 'seq'), 2);
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
  const bare = join(s.tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  gitIn(s.home, 'push', '-q', 'origin', 'HEAD:refs/heads/side');
  gitIn(s.home, 'fetch', '-q', 'origin');
  gitIn(s.home, 'branch', '--set-upstream-to=origin/side');
  gitIn(s.home, 'config', 'push.default', 'upstream');
  const side = gitIn(bare, 'rev-parse', 'side');
  const r = s.run(NEW('alpha job'));
  assert.equal(r.status, 0, out(r));
  assert.match(gitIn(bare, 'ls-tree', '-r', '--name-only', 'main'), new RegExp(reEscape(`acme/demo/${itemRel('001-alpha-job')}`)));
  assert.equal(gitIn(bare, 'rev-parse', 'side'), side, 'side is untouched');
  assert.equal(s.run(['update', '1', '--summary', 'again']).status, 0); // later pulls follow main too
});

test('review P1: a command killed (kill -9) mid-mutation is rolled back by the next command before it publishes anything', t => {
  const s = solo(t);
  assert.equal(s.run(NEW('alpha job')).status, 0); assert.equal(s.run(NEW('beta job')).status, 0);
  const bare = join(s.tmp, 'origins', BACKLOG_OWNER, `${BACKLOG_NAME}.git`);
  const item = itemPath(s.folder, '001-alpha-job'); const before = readFileSync(item, 'utf8');
  const link = `${s.tmp}-link`; symlinkSync(s.tmp, link); t.after(() => rmSync(link, { force: true })); // the child spells the clone as macOS's /var does, the next command as /private/var
  const child = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'shared-audit-child.js'), join(link, 'home'), join(link, 'home', 'acme', 'demo')], { encoding: 'utf8' });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(existsSync(item), false, 'the child died after its move');
  const r = s.run(['update', '2', '--summary', 'next']);
  assert.equal(r.status, 0, out(r)); assert.match(r.stderr, /rolled back a command that was killed/);
  assert.equal(readFileSync(item, 'utf8'), before, 'item 1 is back, still pending');
  assert.equal(existsSync(archivedPath(s.folder, '001-alpha-job', 'phases')), false);
  const one = index.rows(s.folder).rows.find(r => r.seq === 1);
  assert.deepEqual({ status: one.status, path: one.path }, { status: 'pending', path: itemRel('001-alpha-job') });
  const tree = gitIn(bare, 'ls-tree', '-r', '--name-only', 'main');
  assert.match(tree, new RegExp(reEscape(`acme/demo/${itemRel('001-alpha-job')}`))); assert.doesNotMatch(tree, /archive/);
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

test('review: a scalar comma depends_on ("1,2") counts as two references in move, --seq and the cycle check', t => {
  const s = solo(t);
  for (const n of ['alpha job', 'beta job', 'gamma job']) assert.equal(s.run(NEW(n)).status, 0);
  const path = itemPath(s.folder, '003-gamma-job');
  changeItem(path, { fm: { depends_on: '1,2' } }); // a hand-written scalar
  const mv = s.run(['move', '2', '--to-repository', 'other/proj']);
  assert.equal(mv.status, 1, out(mv)); assert.match(out(mv), /003-gamma-job depends on 002-beta-job/);
  const seq = s.run(['update', '2', '--seq', '9']);
  assert.equal(seq.status, 1, out(seq)); assert.match(out(seq), /003-gamma-job depends on 002-beta-job/);
  const cyc = s.run(['update', '1', '--set-depends-on', '3']); // 3 -> "1,2" -> 1
  assert.equal(cyc.status, 1, out(cyc)); assert.match(out(cyc), /cycle/);
});

test('review: after the author released her claim, pop and query --reviewable still do not offer her the review of her own work', t => {
  const s = solo(t);
  writeFileSync(join(s.home, 'teams.json'), JSON.stringify({ t1: { review: [{ stage: 'peer' }] } })); // t1 asks one peer review of its work
  assert.equal(s.run(FULL('alpha job')).status, 0);
  assert.equal(s.run(['update', '1', '--set-team', 't1', '--status', 'ready']).status, 0); // the team views and team pop reach only the items of t1
  for (const args of [['update', '1', '--claim', 'alice'], ['update', '1', '--request-review', 'bob', '--note', 'look'], ['update', '1', '--release', 'alice']]) assert.equal(s.run(args).status, 0);
  const rev = who => s.run(['team', 'query', '--team', 't1', '--reviewable', '--agent', who]);
  assert.doesNotMatch(rev('alice').stdout, /001-alpha-job/);
  assert.match(rev('bob').stdout, /001-alpha-job/);
  const pop = who => s.run(['team', 'pop', '--team', 't1', '--json', '--agent', who]);
  const mine = pop('alice'); assert.doesNotMatch(mine.stdout, /"action":\s*"review"/, mine.stdout);
  const theirs = pop('bob'); assert.match(theirs.stdout, /"action":\s*"review"/, theirs.stdout + theirs.stderr);
});

test('review P2: the cycle check follows the outgoing edges of an item whose file has no phase field (slug from the file name, as ingestion)', t => {
  const s = solo(t);
  for (const n of ['alpha job', 'beta job']) assert.equal(s.run(NEW(n)).status, 0);
  const path = itemPath(s.folder, '002-beta-job');
  changeItem(path, { fm: { phase: undefined } });
  assert.equal(s.run(['list', 'all-branches']).status, 0); // ingests the edit
  assert.equal(s.run(['update', '2', '--set-depends-on', '1']).status, 0);
  const r = s.run(['update', '1', '--set-depends-on', '2']);
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /cycle/);
});
