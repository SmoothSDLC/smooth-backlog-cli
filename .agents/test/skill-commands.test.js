// Item 040: the template skill is the single source of the backlog skill in shared mode. Every team flag of
// `backlog update` (the ones a member or the lead uses) and every team command is in SKILL.md; the skill names no
// backlog folder, file, git command or Python script; its description stays as it is (never shortened).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP } from '../../src/help.js';
import { TEAM_BOOL, TEAM_VALUE } from '../../src/shared/update.js';

const dir = fileURLToPath(new URL('../../templates/skills/backlog/', import.meta.url));
const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
const files = d => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));
// --force (claim while holding another active item) is no member step: one active item per member (spec section 6)
const NOT_TAUGHT = new Set(['force']);

test('040: every team flag of backlog update and every team command is in the skill', () => {
  const missing = [...TEAM_VALUE, ...TEAM_BOOL].filter(f => !NOT_TAUGHT.has(f) && !new RegExp(`--${f}(?![\\w-])`).test(skill));
  assert.deepEqual(missing, [], `flags missing from SKILL.md: ${missing.join(', ')}`);
  for (const c of ['backlog setup', 'backlog work --agent', 'backlog query --phase', 'backlog new --split-from', 'backlog query --plan', 'backlog query --decisions', 'backlog query --wip']) assert.ok(skill.includes(c), c);
  // every command of help.js and of COMMANDS.md, and every flag of the update help that a team session or the lead uses
  const shared = [...new Set([...Object.keys(HELP), ...[...readFileSync(fileURLToPath(new URL('../../COMMANDS.md', import.meta.url)), 'utf8').matchAll(/^### backlog (\S+)$/gm)].map(m => m[1])])];
  assert.ok(shared.length >= 9, shared.join());
  assert.deepEqual(shared.filter(c => !skill.includes(`\`${c}\``) && !skill.includes(`backlog ${c}`)), [], 'every shared-mode command is named');
  const teamFlags = HELP.update.split(/\n(?= {2}--)/).filter(b => /\bteam\b|lead|member/.test(b)).map(b => /^ {2}--([\w-]+)/.exec(b)?.[1]).filter(Boolean);
  assert.ok(teamFlags.length >= 15, teamFlags.join());
  assert.deepEqual(teamFlags.filter(f => !NOT_TAUGHT.has(f) && !new RegExp(`--${f}(?![\\w-])`).test(skill)), [], 'every team flag of the update help is taught');
  assert.match(skill, /review request, a changes verdict it gives and its close end its session \(never the lead's\)/);
  assert.match(skill, /END THE SESSION NOW/);
  assert.match(skill, /Act only as yourself/);
});

test('040: the skill names no backlog folder, item file, git command or Python backlog script; its description is unchanged', () => {
  for (const f of files(dir)) assert.doesNotMatch(readFileSync(f, 'utf8'), /phases\/|backlog\.db|update\.py|query\.py|git (add|commit|push)/, f);
  assert.ok(skill.includes(`description: >
  Use this skill when planning, prioritizing, recording progress, or completing
  this repository's backlog work, even if the user asks what to work on next
  without naming the backlog. Manage branch-local tasks and evidence through
  smooth-backlog-cli. It does not manage unrelated project trackers or Git branch cleanup.
`));
});
