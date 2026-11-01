// Tests for `backlog update --status done` on reviewed and old items - cli-parity job 15 (TEAM): a reviewed item
// finishes through --close only.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { dump, parse } from '../../src/shared/frontmatter.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']; // test_team_compat.OLD

// One shared home with acme/demo and one item made by `new`.
function fixture(name, extra) {
  const t = mkdtempSync(join(tmpdir(), 'team-done-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const args = ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low',
    '--body', '## Definition of done\n\n- [ ] the test\'s check holds', ...extra];
  const r = cli(['new', ...args], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase phases/')[1].split('.md')[0];
  return { t, home, cons, slug, file: join(home, 'acme', 'demo', 'phases', `${slug}.md`) };
}
const update = (f, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { QWEN_CODE_AGENT_ID: '', QWEN_CODE_SESSION_ID: '' } });
const q = (f, agent) => cli(['query', '--phase', f.slug, '--agent', agent], { cwd: f.cons, tmp: f.t, env: { QWEN_CODE_AGENT_ID: '', QWEN_CODE_SESSION_ID: '' } });
const status = f => parse(readFileSync(f.file, 'utf8')).fm.status;

test('--status done is refused until both review stages passed (port of test_status_done_refused_until_review_passed)', () => {
  const f = fixture('reviewed job', ['--review-refs', 'references/review/code.md']);
  const ok = update(f, [f.slug, '--claim', 'cody']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const r = update(f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('missing the Cody review stage'), r.stdout);
  assert.equal(r.stdout, `❌ ${f.slug}: missing the Cody review stage: a Cody agent (not the author session) must pass the review first, then codex or claude\n`);
  assert.equal(status(f), 'in_progress');
});

test('--status done on an item without review_refs needs both stages (port of test_status_done_on_item_without_review_refs, item 088)', () => {
  const f = fixture('old item without review_refs', []);
  const { fm, body } = parse(readFileSync(f.file, 'utf8')); // as an old item looks: none of the team keys (depends_on is not one)
  for (const k of ['work_class', 'review_classes', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']) delete fm[k];
  writeFileSync(f.file, dump(fm, body));
  let r = update(f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('missing the Cody review stage'), r.stdout);
  r = update(f, [f.slug, '--set-review-refs', 'references/review/code.md', '--by', 'cody']); // the lead (cody, the default) completes it
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = update(f, [f.slug, '--request-review', 'any', '--note', 'the work']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  q(f, 'cody-card1');
  r = update(f, [f.slug, '--start-review', '--by', 'cody-card1']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = update(f, [f.slug, '--review', 'pass', '--by', 'cody-card1', '--comments', 'fine per references/review/code.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = update(f, [f.slug, '--request-review', 'codex', '--note', 'the external stage']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  q(f, 'codex');
  r = update(f, [f.slug, '--start-review', '--by', 'codex']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = update(f, [f.slug, '--review', 'pass', '--by', 'codex', '--comments', 'fine per references/review/code.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = update(f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(status(f), 'done');
});

