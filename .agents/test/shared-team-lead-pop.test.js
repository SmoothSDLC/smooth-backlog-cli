// Tests for `backlog team pop --team <name>`, the team lead's command that takes its team's next work item
// (front matter team = the team, no stage) with the whole item. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, itemPath, sharedBacklog, readItem, changeItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-lead-pop-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--review-refs', 'references/review/code.md',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const LEAD = { SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead' };
const run = (f, args, env = {}) => cli(args, { cwd: f.cons, tmp: f.t, env: { ...LEAD, SMOOTH_BACKLOG_CLI_AGENT: env.SMOOTH_BACKLOG_CLI_TEAM_LEAD ?? 'lead', ...env } }); // the caller is the lead unless the test names another agent
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name, ...extra) => ok(f, ['new', ...NEW(name), ...extra]).stdout.split('created phase ')[1].split(' ')[0];
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;

test('query --phase --json names the team fields an item lacks', () => {
  const f = fixture();
  const full = make(f, 'complete item');
  const bare = ok(f, ['new', '--name', 'bare item', '--depends-on', 'none']).stdout.split('created phase ')[1].split(' ')[0];
  const [a, b] = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', `${full},${bare}`, '--json']).stdout);
  assert.deepEqual(a.missing, []);
  assert.deepEqual(b.missing, ['review_refs', 'estimate_min', 'definition_of_done']);
  assert.deepEqual(JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', bare, '--json']).stdout).missing, b.missing);
});

test('an item without depends_on names it', () => {
  const f = fixture();
  const s = make(f, 'hand edited item');
  const file = itemPath(f.folder, s);
  changeItem(file, { fm: { depends_on: undefined, review_refs: undefined } });
  const x = JSON.parse(ok(f, ['team', 'query', '--team', 't1', '--phase', s, '--json']).stdout);
  assert.deepEqual(x.missing, ['review_refs', 'depends_on']);
});

