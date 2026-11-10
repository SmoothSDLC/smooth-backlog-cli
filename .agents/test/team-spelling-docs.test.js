// The documents name the team commands by their team spelling only: no plain `update`, `query` or `new` is shown with an option that only a team command takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TEAM_BOOL, TEAM_VALUE } from '../../src/team/update.js';
import { hooks as teamQuery } from '../../src/team/query.js';
import { cli } from './shared-fixtures.js';

const root = new URL('../../', import.meta.url).pathname;
const files = dir => readdirSync(join(root, dir)).flatMap(n => (statSync(join(root, dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const DOCS = ['COMMANDS.md', 'README.md', ...files('templates').filter(f => /\.(md|json)$/.test(f))];
// what only `backlog team <command>` takes, per plain command
const REMOVED = {
  update: [...TEAM_VALUE, ...TEAM_BOOL, 'set-team'],
  query: [...teamQuery.bool, ...teamQuery.value],
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
