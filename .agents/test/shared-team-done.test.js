// Tests for `backlog update --status done` on reviewed and old items - cli-parity job 15 (TEAM). Oracle: update.py:243-250
// (a reviewed item finishes through --close only). Port of tests/test_team_done.py (2 cases), each also run on a python
// twin: the printed lines and exit status must match update.py. Parity checks skip when SMOOTH_BACKLOG_SCRIPTS is not
// configured or PyYAML is missing. Local bare repos only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, ORACLE_SKIP, py, sharedBacklog } from './shared-fixtures.js';
import { dump, parse } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const oracle = py('update.py', ['--help']) !== null;
const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']; // test_team_compat.OLD

// One shared home with acme/demo and one item made by `new`; side 'py' makes it with new_phase.py, 'js' with the CLI.
function fixture(side, name, extra) {
  const t = mkdtempSync(join(tmpdir(), 'team-done-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const args = ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low',
    '--body', '## Definition of done\n\n- [ ] the test\'s check holds', ...extra];
  const r = side === 'py' ? py('new_phase.py', args, { cwd: cons, tmp: t }) : cli(['new', ...args], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase phases/')[1].split('.md')[0];
  return { t, home, cons, slug, file: join(home, 'acme', 'demo', 'phases', `${slug}.md`) };
}
const update = (side, f, args) => (side === 'py' ? py('update.py', args, { cwd: f.cons, tmp: f.t }) : cli(['update', ...args], { cwd: f.cons, tmp: f.t }));
const status = f => parse(readFileSync(f.file, 'utf8')).fm.status;

test('--status done is refused until the review passed (port of test_status_done_refused_until_review_passed)', () => {
  const f = fixture('js', 'reviewed job', ['--review-refs', 'references/review/code.md']);
  const ok = update('js', f, [f.slug, '--claim', 'cody']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const r = update('js', f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('use --request-review, then --close after a passing review'), r.stdout);
  assert.equal(r.stdout, `❌ ${f.slug}: has review_refs and review_state none; use --request-review, then --close after a passing review\n`);
  assert.equal(status(f), 'in_progress');
});

test('--status done on an item without review_refs finishes as before (port of test_status_done_on_item_without_review_refs)', () => {
  const f = fixture('js', 'old item finishes as before', []);
  const { fm, body } = parse(readFileSync(f.file, 'utf8')); // as an old item looks: none of the team keys
  for (const k of OLD) delete fm[k];
  writeFileSync(f.file, dump(fm, body));
  const r = update('js', f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(status(f), 'done');
});

test('both cases print and exit as update.py', t => {
  if (!oracle) return t.skip(ORACLE_SKIP);
  const norm = s => String(s).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g, 'TS');
  const reviewed = ['--review-refs', 'references/review/code.md'];
  const outs = ['py', 'js'].map(side => {
    const f = fixture(side, 'reviewed job', reviewed);
    assert.equal(update(side, f, [f.slug, '--claim', 'cody']).status, 0);
    const refused = update(side, f, [f.slug, '--status', 'done']);
    const g = fixture(side, 'old item', []);
    const { fm, body } = parse(readFileSync(g.file, 'utf8'));
    for (const k of OLD) delete fm[k];
    writeFileSync(g.file, dump(fm, body));
    const done = update(side, g, [g.slug, '--status', 'done']);
    return [refused, done].map(r => [r.status, norm(r.stdout), r.stderr]);
  });
  assert.deepEqual(outs[1], outs[0]);
});
