// Item 042: depends_on accepts owner/name#seq, an item of another repository's backlog in the same backlog repository.
// An unknown repository or item is refused; a not-done foreign dependency blocks claim and next-work, a done one does
// not; the status line shows it; and when the work here waits on another repository, pop and work name that item and
// its repository as the work to do first (owner 2026-10-29). Two fixture repositories, local bare repos only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('042: owner/name#seq across repositories: refused when unknown, blocks claim and next-work until done, shown and named first', () => {
  const t = mkdtempSync(join(tmpdir(), 'foreign-'));
  dirs.push(t);
  sharedBacklog(t);
  const here = consumer(t, 'acme', 'app', 'main');
  const there = consumer(t, 'acme', 'lib', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = (cwd, args, want = 0) => {
    const r = cli(args, { cwd, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester', TEAM_LEAD: 'lead' } });
    assert.ok([].concat(want).includes(r.status), `${args.join(' ')}: exit ${r.status}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const NEW = (name, deps) => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', deps, '--review-refs', 'references/review/code.md', '--estimate', '5', '--complexity', 'low', '--body', '## Definition of done\n\n- [ ] it holds'];
  run(there, ['new', '--name', 'library change', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] it holds']); // no review_refs: closed with --status done
  assert.match(run(here, NEW('needs a lost one', 'acme/nowhere#1'), 1).stdout, /no item 'acme\/nowhere#1' in the backlog repository/);
  assert.match(run(here, NEW('needs a missing item', 'acme/lib#9'), 1).stdout, /no item 'acme\/lib#9' in the backlog repository/);
  run(here, NEW('app change', 'acme/lib#1'));
  assert.match(run(here, ['query', '--status']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status pending\)/);
  run(here, ['query', '--phase', '1', '--agent', 'archy']);
  assert.match(run(here, ['update', '1', '--claim', 'archy'], 1).stdout, /dependencies not done/);
  const p = JSON.parse(run(here, ['pop', '--agent', 'archy', '--json'], 3).stdout);
  assert.equal(p.action, 'idle');
  assert.deepEqual(p.first, [{ item: 'acme/lib#1', repository: 'acme/lib', seq: 1, slug: '001-library-change', status: 'pending' }]);
  assert.match(p.instruction, /the work here waits on acme\/lib#1 \(001-library-change, status pending\): do that first in repository acme\/lib/);
  assert.equal(p.blocked[0].waiting_on[0].repository, 'acme/lib');
  const lead = run(here, ['pop', '--agent', 'lead'], 3).stdout;
  assert.match(lead, /do that first in repository acme\/lib: end the session here; the team is started in that repository/);
  const w = JSON.parse(run(here, ['work', '--agent', 'archy', '--json'], 3).stdout);
  assert.equal(w.first[0].item, 'acme/lib#1'); // the next-work command names it too
  run(there, ['query', '--phase', '1', '--agent', 'tester']);
  run(there, ['update', '1', '--status', 'done', '--by', 'tester']);
  assert.match(run(here, ['query', '--status']).stdout, /⛓ depends on acme\/lib#1 001-library-change \(status done\)/);
  run(here, ['query', '--phase', '1', '--agent', 'archy']);
  run(here, ['update', '1', '--claim', 'archy']); // done: no longer blocks
  run(here, ['query', '--phase', '1', '--agent', 'tester']);
  assert.match(run(here, ['update', '1', '--set-depends-on', 'acme/lib#7', '--by', 'tester'], 1).stdout, /no item 'acme\/lib#7' in the backlog repository/);
  run(here, ['update', '1', '--set-depends-on', 'acme/lib#1', '--by', 'tester']);
});
