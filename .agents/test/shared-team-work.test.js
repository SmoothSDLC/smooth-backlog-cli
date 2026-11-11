// Tests for `backlog show <item>`: the whole item (the row, every front matter field and the body) as one JSON object. Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storedFm } from '../../src/shared/item-file.js';
import { cli, consumer, createdSlug, itemPath, sharedBacklog, readItem, changeStored } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'team-work-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, home, cons, folder: join(home, 'acme', 'demo') };
}
const DOD = "## Definition of done\n\n- [ ] the test's check holds";
const NEW = name => ['--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none',
  '--estimate', '5', '--complexity', 'low', '--body', `Body of ${name}.\n\n${DOD}`];
const run = (f, args) => cli(args, { cwd: f.cons, tmp: f.t, env: { SMOOTH_BACKLOG_CLI_AGENT: '', SMOOTH_BACKLOG_CLI_SESSION: '' } });
const ok = (f, args) => { const r = run(f, args); assert.equal(r.status, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`); return r; };
// the review documents are a stored field: written into the file, as an item that names them looks
const make = (f, name) => {
  const slug = createdSlug(ok(f, ['new', ...NEW(name)]).stdout);
  changeStored(f.home, itemPath(f.folder, slug), { review_refs: ['references/review/code.md'] });
  return slug;
};
const fm = (f, slug) => readItem(itemPath(f.folder, slug)).fm;
test('show prints the whole item: the row, every front matter field and the body', () => {
  const f = fixture();
  const s = make(f, 'whole item');
  const j = JSON.parse(ok(f, ['show', s, '--json']).stdout);
  assert.equal(j.slug, s);
  assert.deepEqual(j.front_matter, storedFm(fm(f, s)));
  for (const k of ['review_refs', 'depends_on', 'estimate_min', 'complexity', 'owner']) assert.ok(k in j.front_matter, k);
  assert.ok(j.body.includes('Body of whole item.') && j.body.includes("- [ ] the test's check holds"), j.body);
  assert.deepEqual(JSON.parse(ok(f, ['show', s]).stdout), j); // the text view is the same object
});


