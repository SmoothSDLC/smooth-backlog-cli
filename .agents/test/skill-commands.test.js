// The template skill is the single source of the backlog skill. Every team command (a team step is the word after the item of `backlog team update`) is in SKILL.md; the skill names no
// backlog folder, file, git command or Python script; its description stays as it is (never shortened).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP } from '../../src/help.js';
import { teamHelp } from '../../src/team/help.js';

const dir = fileURLToPath(new URL('../../templates/skills/backlog/', import.meta.url));
const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
const files = d => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));
test('040: every team command is in the skill, and a team step is taught as the word after the item', () => {
  for (const c of ['backlog setup', 'backlog team update <item> <step> --team <team> --agent <you> [--<argument> <value>]...', 'backlog team pop --team <team> --agent', 'backlog show <item> --agent <you>', 'backlog team new --team <team> --agent <you> --name', 'backlog team query --team <team> --plan', 'backlog team query --team <team> --decisions', 'backlog team query --team <team> --wip']) assert.ok(skill.includes(c), c);
  // every command of help.js and of COMMANDS.md
  const shared = [...new Set([...Object.keys(HELP), ...[...readFileSync(fileURLToPath(new URL('../../COMMANDS.md', import.meta.url)), 'utf8').matchAll(/^### backlog (\S+)$/gm)].map(m => m[1])])];
  assert.ok(shared.length >= 8, shared.join());
  assert.deepEqual(shared.filter(c => !skill.includes(`\`${c}\``) && !skill.includes(`backlog ${c}`)), [], 'every shared-mode command is named');
  assert.ok(teamHelp['team update'].includes('backlog team update <item> <step>'), 'the help teaches the step as the second word');
  assert.doesNotMatch(skill, /--(?:request-review|refine-start|set-team|accept-handoff)\b/, 'the skill names no step flag of the retired spelling');
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

test('the skill is complete: front matter, size, referenced files, eval fixtures', () => {
  assert.match(skill, /^---\n(?:[\s\S]*?\n)?name: backlog\n[\s\S]*?\n---\n/);
  assert.ok(skill.split('\n').length < 500);
  for (const ref of new Set(skill.match(/(?<![\w./-])(?:scripts|references|assets|evals)\/[\w./-]+/g) || [])) assert.ok(statSync(join(dir, ref)).isFile(), ref);
  const queries = JSON.parse(readFileSync(join(dir, 'scripts/eval_queries.json'), 'utf8'));
  assert.ok(queries.filter(x => x.should_trigger === true).length >= 10 && queries.filter(x => x.should_trigger === false).length >= 8);
  assert.equal(new Set(queries.map(x => x.query)).size, queries.length);
  const cases = JSON.parse(readFileSync(join(dir, 'evals/evals.json'), 'utf8')).evals;
  assert.ok(cases.length && cases.every(x => x.prompt && x.expected_output && x.assertions));
});

test('the skill, the help and COMMANDS.md name no script, storage file or old pattern', () => {
  const bad = /\.py\b|python|oracle|backlog\.db|phases\/|scripts\/(query|update|new_phase|lib_db|move|archive)|\.transaction\.json|\.smooth-backlog-cli\.lock/i;
  for (const f of files(dir)) { const hit = readFileSync(f, 'utf8').split('\n').find(l => bad.test(l)); assert.equal(hit, undefined, `${f}: ${hit}`); }
  assert.match(skill, /The CLI is the\s+only interface to the backlog/);
  for (const [cmd, text] of Object.entries(HELP)) assert.doesNotMatch(text, /python|\.py\b|oracle/i, cmd);
  assert.doesNotMatch(readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), /python|\.py\b|oracle/i);
});
