// `backlog team define --json` and the workflow answers redact each value of its answer, never the serialized text: a URL value then an email value keep every key.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('team define --json: the lead and a member that are a URL and an email are redacted one by one', () => {
  const t = mkdtempSync(join(tmpdir(), 'team-json-redact-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  writeFileSync(join(home, 'teams.json'), '{}');
  const sh = (...a) => spawnSync('git', a, { cwd: home, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  sh('add', '-f', 'teams.json'); sh('commit', '-q', '-m', 'teams'); sh('push', '-q');
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  const file = join(t, 'def.json');
  writeFileSync(file, JSON.stringify({ name: 'gold', lead: 'https://u:p@host.example', members: ['a@b.example', 'bob'], review: [] }));
  const r = cli(['team', 'define', '--file', file, '--json'], { cwd: cons, tmp: t, plain: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['ok', 'team', 'status', 'entry']);
  assert.equal(out.entry.lead, 'https://host.example');
  assert.deepEqual(out.entry.members, ['a@b.example', 'bob']);
});

// A shared backlog with a registry of flows, and a consuming repository to run in.
function world(files) {
  const t = mkdtempSync(join(tmpdir(), 'team-json-redact-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const sh = (...a) => spawnSync('git', a, { cwd: home, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  writeFileSync(join(home, 'teams.json'), '{}');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(home, name), text);
  sh('add', '-f', '.'); sh('commit', '-q', '-m', 'seed'); sh('push', '-q');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, cons: consumer(t, 'acme', 'demo', 'main') };
}
const FLOW = JSON.parse(readFileSync(join(process.cwd(), 'templates', 'workflows', 'team.json'), 'utf8'));
const MIXED = 'https://u:p@host.example\na@b.example'; // a URL with credentials, then an email, with a line break between

test('team workflow --file --json: a refused definition answers valid JSON with each error redacted', () => {
  const { t, cons } = world({});
  const file = join(t, 'flow.json');
  writeFileSync(file, JSON.stringify({ ...FLOW, workflow: 'w', finished: [MIXED] }));
  const r = cli(['team', 'workflow', '--file', file, '--json'], { cwd: cons, tmp: t, plain: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['ok', 'errors']);
  assert.ok(out.errors.includes('finished: https://host.example\na@b.example is no status'), r.stdout);
  assert.ok(!r.stdout.includes('u:p@'), r.stdout);
});

test('team workflow --show: the pretty JSON keeps every key and redacts each value', () => {
  const { t, cons } = world({ 'workflows.json': JSON.stringify({ w: { ...FLOW, workflow: 'w', note: MIXED, other: 'bob' } }) });
  const r = cli(['team', 'workflow', '--show', 'w'], { cwd: cons, tmp: t, plain: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), Object.keys({ ...FLOW, workflow: 'w', note: 0, other: 0 }));
  assert.equal(out.note, 'https://host.example\na@b.example');
  assert.equal(out.other, 'bob');
  assert.ok(!r.stdout.includes('u:p@'), r.stdout);
});

// shortcut: a flow name is limited to letters, digits, . _ - so no value of this answer can hold a credential; the test pins the keys and values only.
test('team workflow --file --json: the registered answer is valid JSON with every key', () => {
  const { t, cons } = world({});
  const file = join(t, 'flow.json');
  writeFileSync(file, JSON.stringify({ ...FLOW, workflow: 'w' }));
  const r = cli(['team', 'workflow', '--file', file, '--json'], { cwd: cons, tmp: t, plain: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { ok: true, workflow: 'w', status: 'registered' });
});
