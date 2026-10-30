// Item 047: an item whose file name is 250 bytes long takes every shared-mode write (the temporary file of the atomic
// write once added 41 characters to the item's file name and passed the 255-byte limit: ENAMETOOLONG). Local bare repos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';

const dirs = [];
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

test('047: update, replan, close and new work beside an item with a 250-byte file name', () => {
  const t = mkdtempSync(join(tmpdir(), 'long-name-'));
  dirs.push(t);
  const home = sharedBacklog(t);
  const cons = consumer(t, 'acme', 'demo', 'main');
  mkdirSync(join(t, 'config', 'smooth-backlog-cli'), { recursive: true });
  writeFileSync(join(t, 'config', 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}');
  const run = args => { const r = cli(args, { cwd: cons, tmp: t, env: { QWEN_CODE_AGENT_ID: 'tester' } }); assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}${r.stderr}`); return r; };
  const NEW = name => ['new', '--name', name, '--objective', 'o', '--summary', 's', '--depends-on', 'none', '--body', '## Definition of done\n\n- [ ] it holds'];
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ').slice(0, 242); // slug 242 + "001-" + ".md" = 249-250 bytes
  run(NEW(long));
  run(NEW('second item'));
  const phases = join(home, 'acme', 'demo', 'phases');
  const file = readdirSync(phases).find(n => n.startsWith('001-'));
  assert.ok(Buffer.byteLength(file) >= 245 && Buffer.byteLength(file) <= 255, `${file} is ${Buffer.byteLength(file)} bytes`);
  const slug = file.replace(/\.md$/, '');
  run(['query', '--phase', slug, '--agent', 'tester']);
  run(['update', slug, '--note', 'a note', '--by', 'tester']);
  run(['update', '--replan', '2,1']);
  run(['query', '--phase', slug, '--agent', 'tester']);
  run(['update', slug, '--status', 'done', '--by', 'tester']); // the close of an item without review_refs, with the reflow
  run(NEW('third item'));
  assert.deepEqual(readdirSync(phases).filter(n => n.endsWith('.tmp')), []); // no temporary file left
});
