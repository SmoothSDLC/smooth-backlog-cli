// The 27 rows of the first release's alias table (decision 20261106-AJ) are gone, and nothing is accepted in their place. Each removed
// spelling gets the generic answer of the CLI (not a backlog command, an option it does not know, or no such item), never a translation,
// and writes nothing: the item files, the index, the git state of the backlog repository, its origin and the consuming repository stay as they were.
// Local bare repositories only (shared-fixtures.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, GIT_IDENTITY, sharedBacklog } from './shared-fixtures.js';
import { HELP } from '../../src/help.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

const NOT = /^❌ backlog: (\S+) is not a backlog command \(/;
const UNKNOWN = /^❌ backlog: (?:\S+ )?(?:unrecognized arguments?:|.*takes no other argument)/;
// [row of the table, the removed spelling, exit code, the answer]. A row that is kept as a command of its own (3-7, 13, 22, 23) is listed
// with the part of its first-release spelling that no longer exists: the earlier read command query (rows 3-6), the singular word, or the dropped switch.
const REMOVED = [
  [1, ['init', 'demo'], 2, NOT],
  [2, ['init', 'clean'], 2, NOT],
  [3, ['query', '--only', 'new'], 2, NOT],
  [4, ['query', '--only', 'open'], 2, NOT],
  [5, ['query', '--only', 'done'], 2, NOT],
  [6, ['query', '--only', 'archive'], 2, NOT],
  [7, ['list', 'branch'], 2, /unrecognized arguments: branch \(usage: backlog list /],
  [8, ['branch'], 2, NOT],
  [9, ['new', 'Fix login', '--description', 'users land right', '--state', 'open', '--priority', '0'], 2, UNKNOWN],
  [10, ['set', '1', 'name', 'Better name'], 2, NOT],
  [11, ['priority', '1', '0'], 2, NOT],
  [12, ['priority', '1'], 2, NOT],
  [13, ['done', '1', '--ask'], 2, /unrecognized arguments: --ask/],
  [14, ['1', 'done'], 2, NOT],
  [15, ['move', '1', 'feature'], 2, /unrecognized arguments: feature/],
  [16, ['set', '1', 'ac', '["it works"]'], 2, NOT],
  [17, ['add', '1', 'tasks', 'one more'], 2, NOT],
  [18, ['replace', '1', 'tasks', '["a","b"]'], 2, NOT],
  [19, ['remove', '1', 'tasks', '1'], 2, NOT],
  [20, ['priority', '1', 'tasks', '2', '1'], 2, NOT],
  [21, ['new', '--name', 'X', '--ac', '["a"]', '--tasks', '["t"]', '--objective', 'o', '--summary', 's', '--depends-on', 'none'], 2, /unrecognized arguments: --ac/],
  [22, ['import', '--branch', 'feature', '--headless'], 2, /import: unrecognized argument --headless/],
  [23, ['archive', 'done', '--headless'], 2, /archive done takes no other argument \(got --headless\)/],
  [24, ['update', 'check'], 1, /^❌ no phase 'check'/],
  [24, ['update', '1.2.3'], 1, /^❌ no phase '1\.2\.3'/],
  [25, ['1', 'set', 'name', 'x'], 2, NOT],
  [26, ['next', '--headless'], 2, /unrecognized arguments: --headless/],
  [26, ['update', '1', '--ask'], 2, /unrecognized arguments: --ask/],
  [27, ['next', '--agent', 'ada'], 2, /unrecognized arguments: --agent/],
  [27, ['query', '--pop', '--agent', 'ada'], 2, NOT],
  [27, ['next', '--pop'], 2, /unrecognized arguments: --pop/],
];

// every file below a folder (the .git folder apart), by content hash
function tree(dir, base = dir, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) tree(path, base, out); else out[path.slice(base.length)] = createHash('sha1').update(readFileSync(path)).digest('hex');
  }
  return out;
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });

function build() {
  const t = mkdtempSync(join(tmpdir(), 'removed-forms-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  for (const name of ['One', 'Two']) assert.equal(cli(['new', '--name', name, '--objective', `o ${name}`, '--summary', `s ${name}`, '--depends-on', 'none'], { cwd: cons, tmp: t }).status, 0);
  git(cons, 'branch', 'feature'); git(cons, 'push', '-q', 'origin', 'feature');
  const origin = join(t, 'origins', 'acme', 'backlog-repo.git');
  const state = () => JSON.stringify({ files: tree(home), consumer: tree(cons), home: [git(home, 'status', '--porcelain'), git(home, 'rev-parse', 'HEAD')], cons: [git(cons, 'status', '--porcelain'), git(cons, 'rev-parse', 'HEAD')], origin: git(origin, 'for-each-ref') });
  return { t, cons, state, run: args => cli(args, { cwd: cons, tmp: t }) };
}

test('all 27 rows of the first release\'s alias table are answered generically (exit code, message) and write nothing', () => {
  assert.deepEqual([...new Set(REMOVED.map(r => r[0]))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
  const f = build();
  for (const [row, args, code, answer] of REMOVED) {
    const before = f.state();
    const r = f.run(args);
    const label = `row ${row}: ${args.join(' ')}: ${r.stdout}${r.stderr}`;
    assert.equal(r.status, code, label);
    assert.match(r.status === 1 ? r.stdout : r.stderr, answer, label);
    assert.equal(f.state(), before, `${label}: something was written`);
  }
});

test('backlog update with nothing named prints the help of update (exit 2) and installs and writes nothing', () => {
  const f = build();
  const before = f.state();
  const r = f.run(['update']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, HELP.update);
  assert.equal(r.stderr, '');
  assert.equal(f.state(), before);
});
