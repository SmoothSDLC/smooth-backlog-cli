// Tests for the item template: backlog fields, the same table in backlog new --help, and the owner's words for the new options.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../src/shared/frontmatter.js';
import { FIELDS } from '../../src/shared/fields.js';
import { cli, consumer, createdSlug, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const t = mkdtempSync(join(tmpdir(), 'fields-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  return { t, cons, folder: join(home, 'acme', 'demo') };
}
const run = (f, args) => cli(args, { cwd: f.cons, tmp: f.t });
const fm = (f, slug) => parse(readFileSync(join(f.folder, 'phases', `${slug}.md`), 'utf8')).fm;

test('backlog fields prints one line per field with the five columns; --json lists the same fields', () => {
  const f = fixture();
  const r = run(f, ['fields']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trimEnd().split('\n');
  assert.equal(lines.length, FIELDS.length + 1);
  assert.match(lines[0], /^key\s+shown as\s+meaning\s+set by\s+required$/);
  for (const [i, field] of FIELDS.entries()) for (const cell of field) assert.ok(lines[i + 1].includes(cell), `${field[0]}: ${cell}`);
  assert.ok(lines.some(l => /^name\s+title\s/.test(l)) && lines.some(l => /^summary\s+summary\s/.test(l)) && lines.some(l => /^body\s+description\s/.test(l)));
  const json = JSON.parse(run(f, ['fields', '--json']).stdout);
  assert.deepEqual(json.map(x => x.key), FIELDS.map(x => x[0]));
  assert.equal(run(f, ['fields', 'x']).status, 2);
});

test('backlog new --help carries the same table', () => {
  const f = fixture();
  const table = run(f, ['fields']).stdout.trimEnd();
  const help = run(f, ['new', '--help']).stdout;
  assert.ok(help.includes(table), 'the table of backlog fields is in the help of new');
  assert.ok(run(f, ['fields', '--help']).stdout.startsWith('backlog fields'));
});

test('new takes --title and --description as the owner\'s words for --name and --body, and --summary may repeat', () => {
  const f = fixture();
  const s = createdSlug(run(f, ['new', '--title', 'Parser fix', '--objective', 'o', '--summary', 'First sentence.', '--summary', 'Second sentence.', '--depends-on', 'none',
    '--description', '## Definition of done\n\n- [ ] the parser reads the sample']).stdout);
  assert.equal(s, '001-parser-fix');
  assert.equal(fm(f, s).name, 'Parser fix');
  assert.equal(fm(f, s).summary, 'First sentence.\nSecond sentence.');
  assert.ok(readFileSync(join(f.folder, 'phases', `${s}.md`), 'utf8').includes('the parser reads the sample'));
  const both = run(f, ['new', '--title', 'a', '--name', 'b', '--depends-on', 'none']);
  assert.equal(both.status, 2); assert.match(both.stderr, /--title and --name are the same option/);
  const old = createdSlug(run(f, ['new', '--name', 'Old words', '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', 'text']).stdout);
  assert.equal(fm(f, old).name, 'Old words');
});
