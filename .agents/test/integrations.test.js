import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixture } from './helpers.js';
test('all four detected agent integrations install the backlog skill', t => {
  const f = fixture(t);
  for (const name of ['.agents', '.claude', '.github', '.qwen']) mkdirSync(join(f.root, name));
  assert.equal(f.cli('init').installed_agents.length, 4);
  const skill = readFileSync(resolve('templates/skills/backlog/SKILL.md'), 'utf8');
  for (const name of ['.agents', '.claude', '.github', '.qwen']) assert.equal(readFileSync(join(f.root, name, 'skills/backlog/SKILL.md'), 'utf8'), skill, name);
  const manifest = f.json('skills/agent-types/manifest.json'); assert.equal(manifest.agents.length, 4);
});
test('refresh replaces backlog skill edits and leaves unrelated vendor skills alone', t => {
  const f = fixture(t); mkdirSync(join(f.root, '.qwen/skills/other'), { recursive: true });
  writeFileSync(join(f.root, '.qwen/skills/other/SKILL.md'), 'unrelated'); f.cli('init');
  writeFileSync(join(f.root, '.qwen/skills/backlog/SKILL.md'), 'user edit'); f.cli('init', 'backup');
  assert.match(readFileSync(join(f.root, '.qwen/skills/backlog/SKILL.md'), 'utf8'), /name: backlog/);
  assert.equal(readFileSync(join(f.root, '.qwen/skills/other/SKILL.md'), 'utf8'), 'unrelated');
});
test('the product skill is complete: front matter, size, referenced files, fixtures', () => {
  const root = resolve('templates/skills/backlog'); const text = readFileSync(join(root, 'SKILL.md'), 'utf8');
  assert.match(text, /^---\n(?:[\s\S]*?\n)?name: backlog\n[\s\S]*?\n---\n/); assert.ok(text.split('\n').length < 500);
  for (const ref of new Set(text.match(/(?<![\w./-])(?:scripts|references|assets|evals)\/[\w./-]+/g) || [])) assert.ok(existsSync(join(root, ref)), ref);
  const queries = JSON.parse(readFileSync(join(root, 'scripts/eval_queries.json'), 'utf8'));
  assert.ok(queries.filter(x => x.should_trigger === true).length >= 10 && queries.filter(x => x.should_trigger === false).length >= 8);
  assert.equal(new Set(queries.map(x => x.query)).size, queries.length);
  const cases = JSON.parse(readFileSync(join(root, 'evals/evals.json'), 'utf8')).evals;
  assert.ok(cases.length && cases.every(x => x.prompt && x.expected_output && x.assertions));
});
test('item 058: the built-in skill and the help name no Python script and no old pattern', async () => {
  const bad = /\.py\b|python|oracle|backlog\.db|phases\/|scripts\/(query|update|new_phase|lib_db|move|archive)|\.transaction\.json|\.smooth-backlog-cli\.lock/i; // the DoD's grep, plus storage file names
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const file of walk(resolve('templates/skills/backlog'))) {
    const hit = readFileSync(file, 'utf8').split('\n').find(l => bad.test(l)); assert.equal(hit, undefined, `${file}: ${hit}`);
  }
  assert.match(readFileSync(resolve('templates/skills/backlog/SKILL.md'), 'utf8'), /The CLI is the\s+only interface to the backlog/);
  const { HELP } = await import('../../src/help.js');
  for (const [cmd, text] of Object.entries(HELP)) assert.doesNotMatch(text, /python|\.py\b|oracle/i, cmd);
  assert.doesNotMatch(readFileSync(resolve('COMMANDS.md'), 'utf8'), /python|\.py\b|oracle/i);
});
test('using a new CLI version refreshes stale generated integrations', async t => {
  const { refreshIntegrations } = await import('../../src/integrations.js'); const f = fixture(t); f.cli('init');
  const config = f.json('config.json'); config.generated_version = '0.9.0'; writeFileSync(f.file('config.json'), JSON.stringify(config));
  writeFileSync(f.file('skills/backlog/SKILL.md'), 'old generated skill');
  await refreshIntegrations({ root: f.root }, '1.0.0');
  assert.match(readFileSync(f.file('skills/backlog/SKILL.md'), 'utf8'), /name: backlog/);
  assert.equal(f.json('config.json').generated_version, '1.0.0');
});
