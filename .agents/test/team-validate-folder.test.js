// `backlog team validate` over the items of a folder it cannot read in full: every problem is a finding with its fix, nothing stops the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'backlog.js');
const GOOD = { people: { a: ['lead'], b: ['member'] }, item: { status: { type: 'text', values: ['open', 'done'], final: ['done'], default: 'open', description: 's' }, depends_on: { type: 'items', description: 'd' } }, rules: { table: [{ id: 'take', step: 'claim', do: { set: { status: 'done' } } }], pop: [], filters: {} } };
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const doc = (seq, fields, extra = {}) => JSON.stringify({ seq, slug: `${String(seq).padStart(3, '0')}-x`, name: 'x', team: 't', repository: 'local/repository', branch: 'main', created: null, updated: '2026-11-10T00:00:00Z', updated_by: '', fields, body: '', history: [], ...extra });

function world(t) {
  const root = mkdtempSync(join(tmpdir(), 'val-folder-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'app'); const bl = join(top, '.backlog');
  mkdirSync(bl, { recursive: true });
  git(top, 'init', '-q', '-b', 'main'); writeFileSync(join(bl, 'config.json'), '{"backlog_repository": ".backlog"}\n'); git(top, 'commit', '-q', '--allow-empty', '-m', 'i');
  writeFileSync(join(bl, 'teams.json'), JSON.stringify({ t: GOOD }));
  const rp = join(bl, 'local', 'repository'); mkdirSync(join(rp, 'phases'), { recursive: true });
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, 'xdg'), SMOOTH_BACKLOG_CLI_HOME: '', SMOOTH_BACKLOG_CLI_TEAM_NAME: '', SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY: '', SMOOTH_BACKLOG_CLI_TEAM_BRANCH: '', SMOOTH_BACKLOG_CLI_AGENT: '' };
  const validate = () => { const p = spawnSync(process.execPath, [BIN, 'team', 'validate', '--team', 't', '--json'], { cwd: top, env, encoding: 'utf8' }); return { status: p.status, findings: p.stdout.trim().startsWith('[') ? JSON.parse(p.stdout) : [], text: p.stdout + p.stderr }; };
  return { root, rp, validate };
}
const errorsOf = r => r.findings.filter(f => f.severity === 'error');

test('a link among the items is a finding with its fix, and the other findings are still there', t => {
  const w = world(t);
  writeFileSync(join(w.rp, 'phases', '001-x.json'), doc(1, { status: 'open', depends_on: [77] }));
  writeFileSync(join(w.root, 'o.json'), doc(2, { status: 'open' }));
  symlinkSync(join(w.root, 'o.json'), join(w.rp, 'phases', '002-x.json'));
  const r = w.validate();
  assert.equal(r.status, 2, r.text);
  const link = errorsOf(r).find(f => f.path.endsWith('phases/002-x.json'));
  assert.match(link.problem, /^the item file cannot be read \(Symlink destination is unsupported/);
  assert.ok(link.fix);
  assert.ok(r.findings.some(f => f.path.endsWith('phases/001-x.json') && /names no item 77/.test(f.problem)), 'the finding of the readable item stays');
});

test('a number above the bound is one finding, from the number check', t => {
  const w = world(t);
  writeFileSync(join(w.rp, 'phases', '001-x.json'), doc(1, { status: 'open' }));
  writeFileSync(join(w.rp, 'phases', '2000000000-x.json'), doc(2000000000, { status: 'open' }));
  const r = w.validate();
  assert.equal(r.status, 2, r.text);
  const big = errorsOf(r);
  assert.equal(big.length, 1, JSON.stringify(big));
  assert.match(big[0].problem, /^item 2000000000-x\.json: the number in the file name is above 1000000000/);
  assert.equal(big[0].fix, 'restore the file or the history it names');
});

test('an unreadable live item keeps the earlier wording; an unreadable archived file is no finding and archived items are not checked', t => {
  const w = world(t);
  writeFileSync(join(w.rp, 'phases', '001-x.json'), 'nope');
  writeFileSync(join(w.rp, 'phases', '002-x.json'), '{"name": "x"}');
  writeFileSync(join(w.rp, 'phases', '003-x.json'), '[]');
  mkdirSync(join(w.rp, 'archive', 'phases'), { recursive: true });
  writeFileSync(join(w.rp, 'archive', 'phases', '004-x.json'), 'broken');
  writeFileSync(join(w.rp, 'archive', 'phases', '005-x.json'), doc(5, { status: 'open' }, { team: 'gone' }));
  const r = w.validate();
  const by = n => errorsOf(r).filter(f => f.path.endsWith(`phases/00${n}-x.json`));
  assert.match(by(1)[0].problem, /^the item file cannot be read \(Unexpected token/);
  assert.equal(by(2)[0].problem, 'the item file cannot be read (it is not an item)');
  assert.equal(by(3)[0].problem, 'the item file cannot be read (it is not an item)');
  assert.equal(r.findings.filter(f => /004|005/.test(f.path)).length, 0);
  assert.equal(errorsOf(r).length, 3);
});

test('the own number of an archived item does not make a reference resolve', t => {
  const w = world(t);
  writeFileSync(join(w.rp, 'phases', '001-x.json'), doc(1, { status: 'open', depends_on: [99] }));
  mkdirSync(join(w.rp, 'archive', 'phases'), { recursive: true });
  writeFileSync(join(w.rp, 'archive', 'phases', '002-x.json'), doc(99, { status: 'open' }, { slug: '002-x' }));
  assert.ok(w.validate().findings.some(f => /names no item 99/.test(f.problem)));
});
