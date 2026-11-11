// An item without a team and without the split marker keeps no stage (solo work) and is claimable by the plain update.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readItem } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'unrefined-claim-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, cons, user: join(t, 'user'), folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none',
  '--estimate', '5', '--complexity', 'low', '--body', DOD];
const reader = args => ['--by', '--claim', '--release'].map(k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)).find(Boolean);
const run = (f, args, env = {}) => {
  const o = { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '', SMOOTH_BACKLOG_CLI_TEAM_LEAD: 'lead', HOME: f.user, ...env } };
  if (args[0] === 'update' && reader(args)) cli(['show', args[1], '--agent', reader(args)], o);
  return cli(args, o);
};
const ok = (f, args, env) => { const r = run(f, args, env); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
const make = (f, name) => createdSlug(ok(f, ['new', ...NEW(name)]).stdout);
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;

test('an item without a team and without the split marker stays claimable: no stage is solo work, ready', () => {
  const f = fixture();
  const s = make(f, 'solo item');
  ok(f, ['update', s, '--claim', 'amy']);
  assert.equal(fm(f, s).claimed_by, 'amy');
});
