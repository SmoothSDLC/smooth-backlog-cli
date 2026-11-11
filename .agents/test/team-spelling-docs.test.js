// The documents name the team commands by their team spelling only: no plain `update`, `query` or `new` is shown with an option that only a team command takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TEAM_BOOL, TEAM_VALUE, cli } from './shared-fixtures.js';

const root = new URL('../../', import.meta.url).pathname;
const files = dir => readdirSync(join(root, dir)).flatMap(n => (statSync(join(root, dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const DOCS = ['COMMANDS.md', 'README.md', ...files('templates').filter(f => /\.(md|json)$/.test(f))];
// what only `backlog team <command>` takes, per plain command
const REMOVED = {
  update: [...TEAM_VALUE, ...TEAM_BOOL, 'set-team'],
  query: ['claimable', 'reviewable', 'blocked', 'decisions', 'plan', 'wip', 'lead', 'agents', 'scope'], // the retired views of backlog team query: the words documents must not show
  new: ['team', 'review-refs'],
};
// the plain command word, not the word of `backlog team update`, followed on the same line by one of its removed options
const spelling = (cmd, flags) => new RegExp(`(?<![\\w-])(?<!team )${cmd}\\b[^\\n]*?--(?:${flags.join('|')})(?![\\w-])`);

test('no document shows a plain update, query or new with an option that only a team command takes', () => {
  const found = [];
  for (const file of DOCS) {
    readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
      for (const [cmd, flags] of Object.entries(REMOVED)) if (spelling(cmd, flags).test(line)) found.push(`${file}:${i + 1} (${cmd}): ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(found, []);
});

// The step flags of the retired spelling: no help text, no document shows them with `backlog team update`.
const RETIRED = [...TEAM_VALUE, ...TEAM_BOOL, 'set-team', 'decision', 'replan', 'priority', 'close', 'status'];
const retiredUpdate = new RegExp(`team update\\b[^\\n]*?--(?:${RETIRED.join('|')})(?![\\w-])`);
test('no help text and no document shows backlog team update with a retired step flag', () => {
  const helps = [[], ['team'], ['team', 'update'], ['team', 'new'], ['team', 'pop'], ['team', 'query'], ['update']].map(h => [`help ${h.join(' ')}`, cli([...h, '--help'], {}).stdout]);
  const docs = [...DOCS.filter(f => /(COMMANDS|README|SKILL)\.md$/.test(f) || /references\/commands\.md$/.test(f))].map(f => [f, readFileSync(join(root, f), 'utf8')]);
  const found = [];
  for (const [where, text] of [...helps, ...docs]) text.split('\n').forEach((line, i) => { if (retiredUpdate.test(line)) found.push(`${where}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  assert.deepEqual(found, []);
  assert.ok(helps.every(([w, t]) => t.length > 100), 'every help text was read');
});

test('the check finds the removed spellings', () => {
  for (const [cmd, line] of [['update', 'backlog update 1 --request-review any'], ['query', 'run backlog query --claimable'], ['new', 'backlog new --team t1'], ['update', 'update <item> --set-team x']]) {
    assert.ok(spelling(cmd, REMOVED[cmd]).test(line), line);
  }
  assert.ok(!spelling('update', REMOVED.update).test('backlog team update 1 --request-review any'));
});

test('backlog fields lists the definition of an item without a team: no team rows', () => {
  const keys = cli(['fields'], {}).stdout.split('\n').map(l => l.split(' ')[0]);
  for (const key of ['team', 'review_refs', 'claimed_by', 'claimed_at']) assert.ok(!keys.includes(key), key);
});

test('the pop help and the README say a rerun can end pop idle while a ready item exists; the changelog names git 2.40', () => {
  const read = f => readFileSync(join(root, f), 'utf8');
  const idle = /rerun[^\n]*idle[^\n]*exit 3[^\n]*ready item/i;
  assert.match(read('src/team/help.js'), idle);
  assert.match(read('README.md'), idle);
  assert.match(read('CHANGELOG.md'), /older git[^\n]*2\.40|git 2\.40[^\n]*refus/i);
});
