// R23 and R25 scenarios of backlog setup: node --test setup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_DIR, deployTemplates, migrateAdvice, recordMigration } from './setup.mjs';

const SOURCE = fileURLToPath(new URL('../examples/', import.meta.url)); // stands for the CLI package's templates/teams folder
const top = t => { const d = mkdtempSync(join(tmpdir(), 'setup-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test('setup copies the five generic templates into .backlog/team-templates and says so', t => {
  const d = top(t);
  assert.equal(deployTemplates(d, SOURCE), '✅ team templates copied to .backlog/team-templates: scrum, extreme-programming, parallel, single-agent, patterns; copy one to the team file and edit it there');
  assert.deepEqual(readdirSync(join(d, TEMPLATE_DIR)).sort(), ['extreme-programming.json', 'parallel.json', 'patterns.json', 'scrum.json', 'single-agent.json']);
  assert.equal(readFileSync(join(d, TEMPLATE_DIR, 'scrum.json'), 'utf8'), readFileSync(join(SOURCE, 'scrum.json'), 'utf8'));
});

test('a second setup replaces an edited copy and removes a file the person added there, as for the skill copy', t => {
  const d = top(t);
  deployTemplates(d, SOURCE);
  writeFileSync(join(d, TEMPLATE_DIR, 'scrum.json'), '{"edited": true}');
  writeFileSync(join(d, TEMPLATE_DIR, 'my-team.json'), '{}');
  deployTemplates(d, SOURCE);
  assert.equal(readFileSync(join(d, TEMPLATE_DIR, 'scrum.json'), 'utf8'), readFileSync(join(SOURCE, 'scrum.json'), 'utf8'));
  assert.ok(!readdirSync(join(d, TEMPLATE_DIR)).includes('my-team.json'));
});

const RUN = 'backlog team migrate --show-all --dry-run, then backlog team migrate --show-all';
test('setup recommends the migration in each state of the two keys', () => {
  const cfg = { backlog_repository: '.backlog' };
  assert.equal(migrateAdvice({}, '1.4.0'), null);
  assert.equal(migrateAdvice(cfg, '1.4.0'), `ℹ️  the backlog of this repository has not been migrated to JSON items: run ${RUN}`);
  const done = recordMigration(cfg, { now: '2026-11-12T09:00:00Z', version: '1.3.2' });
  assert.deepEqual(done, { backlog_repository: '.backlog', migrated_at: '2026-11-12T09:00:00Z', migrated_by_version: '1.3.2' });
  assert.equal(migrateAdvice(done, '1.4.0'), `ℹ️  the backlog of this repository was last migrated on 2026-11-12T09:00:00Z by version 1.3.2; this is version 1.4.0: run ${RUN}`);
  assert.equal(migrateAdvice(done, '1.3.2'), 'ℹ️  the backlog of this repository was last migrated on 2026-11-12T09:00:00Z by version 1.3.2');
});
