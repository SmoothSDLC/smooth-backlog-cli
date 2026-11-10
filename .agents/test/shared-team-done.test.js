// Tests for `backlog update --status done` on reviewed and old items - cli-parity job 15 (TEAM): a reviewed item
// finishes through --close only.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { dump, parseItem as parse } from '../../src/shared/frontmatter.js';

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
  const args = ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--estimate', '5', '--complexity', 'low',
    '--body', '## Definition of done\n\n- [ ] the test\'s check holds', ...extra];
  const r = cli(['new', ...args], { cwd: cons, tmp: t });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slug = r.stdout.split('created phase ')[1].split(' ')[0];
  return { t, home, cons, slug, file: join(home, 'acme', 'demo', 'phases', `${slug}.md`) };
}
const update = (f, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const q = (f, agent) => cli(['show', f.slug, '--agent', agent], { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const status = f => parse(readFileSync(f.file, 'utf8')).fm.status;

const TEAM = { SMOOTH_BACKLOG_CLI_TEAM_NAME: 't1', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: 'acme/demo', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: 'main' };
const asTeam = (f, agent, args) => cli(['update', ...args], { cwd: f.cons, tmp: f.t, env: { ...TEAM, SMOOTH_BACKLOG_CLI_AGENT: agent, SMOOTH_BACKLOG_CLI_SESSION: '' } });

test('--status done is refused on a team item: its status moves by the team steps', () => {
  const f = fixture('reviewed job', ['--review-refs', 'docs/review/code.md']);
  writeFileSync(join(f.home, 'teams.json'), JSON.stringify({ t1: { lead: 'lead', members: ['ann'], review: [{ team: 'reviewers', count: 1 }] }, reviewers: { lead: 'rex', members: ['rex', 'ria'] } }));
  const set = asTeam(f, 'lead', [f.slug, '--set-team', 't1']);
  assert.equal(set.status, 0, set.stdout + set.stderr);
  const ok = asTeam(f, 'lead', [f.slug, '--claim', 'lead']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const r = asTeam(f, 'lead', [f.slug, '--status', 'done']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes("backlog team update takes no --status: the status of a team item moves by its steps (--claim, --request-review, --start-review, --review, --close)"), r.stdout);
  assert.equal(status(f), 'in progress');
});

test('--status done on an old teamless item without review_refs closes it without a review', () => {
  const f = fixture('old item without review_refs', []);
  const { fm, body } = parse(readFileSync(f.file, 'utf8')); // as an old item looks: none of the team keys (depends_on is not one)
  for (const k of ['work_class', 'review_classes', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']) delete fm[k];
  writeFileSync(f.file, dump(fm, body));
  const r = update(f, [f.slug, '--status', 'done']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(status(f), 'closed');
});
