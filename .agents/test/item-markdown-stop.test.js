// The switch to JSON items: a folder of markdown items stops every command that reads items (exit 2, one line), an item that cannot be read is named
// with its key and never a path, and what the CLI writes is the codec's text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, createdSlug, damageItem, GIT_IDENTITY, itemPath, readItem, sharedBacklog, writeItem, writeUnreadableItem } from './shared-fixtures.js';
import { dumpItem } from '../../src/shared/item-file.js';

const STOP = acme => `❌ backlog: the items of ${acme} are markdown files; run backlog team migrate once to convert every item to JSON\n`;
const MD = '---\nphase: 001-a\nseq: 1\nname: A\nstatus: pending\n---\nBody.\n';

function world(t) {
  const dir = mkdtempSync(join(tmpdir(), 'md-stop-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = sharedBacklog(dir); const cons = consumer(dir, 'acme', 'demo', 'main');
  mkdirSync(join(dir, 'config', 'smooth-backlog-cli'), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: home, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  const run = (...args) => cli(args, { cwd: cons, tmp: dir });
  const folder = join(home, 'acme', 'demo');
  const publish = m => { git('add', '-A'); git('commit', '-q', '-m', m); git('push', '-q'); };
  return { dir, home, git, run, folder, publish };
}
const markdown = (folder, name = '001-a.md', text = MD) => { mkdirSync(join(folder, 'phases'), { recursive: true }); writeFileSync(join(folder, 'phases', name), text); };

test('a folder of markdown items stops list, show, new and update: exit 2, the one line, nothing written', t => {
  const w = world(t);
  markdown(w.folder);
  w.publish('markdown item');
  for (const args of [['list'], ['show', '1'], ['new', '--name', 'x'], ['update', '1', '--status', 'closed']]) {
    const r = w.run(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stderr, STOP('acme/demo'), args.join(' '));
  }
  assert.equal(w.git('status', '--porcelain'), '', 'no command wrote anything');
  assert.equal(readFileSync(join(w.folder, 'phases', '001-a.md'), 'utf8'), MD);
});

test('a folder is never half markdown and half JSON; a .md file without a header (a README) is no item', t => {
  const w = world(t);
  assert.equal(w.run('new', '--name', 'json one').status, 0);
  markdown(w.folder, 'README.md', '# Notes\n\nNo header here.\n');
  assert.equal(w.run('list').status, 0, 'a README does not stop the folder');
  markdown(w.folder, '002-b.md', MD.replace('001-a', '002-b'));
  const r = w.run('list');
  assert.equal(r.status, 2);
  assert.equal(r.stderr, STOP('acme/demo'));
  mkdirSync(join(w.folder, 'archive'), { recursive: true });
  rmSync(join(w.folder, 'phases', '002-b.md'));
  writeFileSync(join(w.folder, 'archive', '003-c.md'), MD.replace('001-a', '003-c'));
  assert.equal(w.run('list').status, 2, 'a markdown item under archive/ stops the folder too');
});

test('commands that read no item run on a markdown folder', t => {
  const w = world(t);
  markdown(w.folder);
  assert.equal(w.run('--version').status, 0);
  assert.equal(w.run('--help').status, 0);
  assert.equal(w.run('fields').status, 0);
});

test('a foreign folder of markdown items reads as no such item: a dependency on it is refused as unresolved, not stopped', t => {
  const w = world(t);
  markdown(join(w.home, 'acme', 'other'));
  const r = w.run('new', '--name', 'x', '--depends-on', 'acme/other#1');
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr + r.stdout, /markdown files/);
  assert.match(r.stderr + r.stdout, /acme\/other#1/);
});

test('an item that cannot be read is named with its key, never a path; the way out is --restore, or --<key> for a wrongly typed key of valid JSON', t => {
  const w = world(t);
  assert.equal(w.run('new', '--name', 'alpha job').status, 0);
  const file = itemPath(w.folder, '001-alpha-job');
  writeUnreadableItem(file);
  const notJson = w.run('list');
  assert.equal(notJson.status, 2);
  assert.match(notJson.stderr, /^❌ backlog: item 001-alpha-job: the file is not valid JSON \(.*\)\. Restore the item's previous version with backlog update 001-alpha-job --restore\n$/);
  assert.doesNotMatch(notJson.stderr, /phases|\.json/);
  assert.equal(w.run('update', '1', '--name', 'again').status, 2, 'a file that is not JSON offers only --restore');
  const back = w.run('update', '1', '--restore');
  assert.equal(back.status, 0, back.stdout + back.stderr);
  assert.equal(readItem(file).fm.name, 'alpha job');
  damageItem(file, 'name');
  const wrong = w.run('show', '1');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /item 001-alpha-job: the key name cannot be read \(is missing or not text\)\. Fix it with backlog update 001-alpha-job --name <value>, or restore the item's previous version with backlog update 001-alpha-job --restore\n$/);
  const fixed = w.run('update', '001-alpha-job', '--name', 'alpha job');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(readItem(file).fm.name, 'alpha job');
});

test('an item the CLI wrote is byte for byte the codec text', t => {
  const w = world(t);
  const made = w.run('new', '--name', 'alpha job');
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.equal(w.run('update', '1', '--summary', 'a summary').status, 0);
  const file = itemPath(w.folder, createdSlug(made.stdout));
  const { fm, body } = readItem(file);
  assert.equal(readFileSync(file, 'utf8'), dumpItem(fm, body));
  assert.ok(file.endsWith('.json'));
  writeItem(file, fm, body);
  assert.equal(readFileSync(file, 'utf8'), dumpItem(fm, body));
});

test('an item file that starts with a byte-order mark is read and its next write is the codec text without it', t => {
  const w = world(t);
  const made = w.run('new', '--name', 'alpha job');
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const file = itemPath(w.folder, createdSlug(made.stdout));
  writeFileSync(file, `\uFEFF${readFileSync(file, 'utf8')}`);
  const shown = w.run('show', '1');
  assert.equal(shown.status, 0, shown.stdout + shown.stderr);
  assert.equal(w.run('update', '1', '--summary', 'edited').status, 0);
  assert.ok(!readFileSync(file, 'utf8').startsWith('\uFEFF'));
  assert.equal(readItem(file).fm.summary, 'edited');
});

test('archive works on an item that has no status key', t => {
  const w = world(t);
  const made = w.run('new', '--name', 'alpha job');
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const file = itemPath(w.folder, createdSlug(made.stdout));
  const doc = JSON.parse(readFileSync(file, 'utf8')); delete doc.fields.status; writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  const body = JSON.parse(readFileSync(file, 'utf8')).body;
  assert.ok(body.length > 20);
  const r = w.run('archive', '1', '--force');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const archived = JSON.parse(execFileSync('git', ['ls-files', 'archive'], { cwd: w.folder, encoding: 'utf8' }).split('\n').filter(Boolean).map(f => readFileSync(join(w.folder, f), 'utf8'))[0]);
  assert.equal(archived.fields.status, 'archived');
  assert.equal(archived.body, body, 'archiving keeps the body');
});
