// `backlog team define --json` redacts each value of its answer, never the serialized text: a URL value then an email value keep every key.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
