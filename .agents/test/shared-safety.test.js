// Shared-mode safety tests for src/shared/safety.js (cli-parity job 3, SAFETY).
// Hostile inputs come from the item: '../x', '/etc/passwd', 'a;rm -rf x',
// a symlinked home, a home with another origin, and git stderr that contains
// https://u:ghp_x@github.com/... .
// Local bare repositories only (shared-fixtures.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, sharedBacklog, consumer, GIT_IDENTITY } from './shared-fixtures.js';
import {
  repoIdFromUrl, validateHome, slugify, itemSelector,
  assertInside, checkRefs, redact, git,
} from '../../src/shared/safety.js';

// The fixture helpers' internal git calls inherit process.env; give them an
// identity so the seed commits always work (same identity the fixtures use).
Object.assign(process.env, GIT_IDENTITY);

function tmp(t) {
  // realpath: macOS tmpdir() is under the /var symlink, which validateHome refuses by design;
  // the JS (non-native) realpath keeps Windows 8.3 short names, so that path form stays tested.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'safety-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('repoIdFromUrl: https, scp-style and local-path URLs', () => {
  assert.equal(repoIdFromUrl('https://github.com/SmoothSDLC/smoothsdlc-backlog.git'), 'SmoothSDLC/smoothsdlc-backlog');
  assert.equal(repoIdFromUrl('https://github.com/SmoothSDLC/smoothsdlc-backlog'), 'SmoothSDLC/smoothsdlc-backlog');
  assert.equal(repoIdFromUrl('git@github.com:SmoothSDLC/smoothsdlc-backlog.git'), 'SmoothSDLC/smoothsdlc-backlog');
  assert.equal(repoIdFromUrl('/srv/SmoothSDLC/smoothsdlc-backlog.git'), 'SmoothSDLC/smoothsdlc-backlog');
  assert.equal(repoIdFromUrl('C:\\srv\\SmoothSDLC\\smoothsdlc-backlog.git'), 'SmoothSDLC/smoothsdlc-backlog');
  assert.equal(repoIdFromUrl('  https://github.com/SmoothSDLC/smoothsdlc-backlog.git  '), 'SmoothSDLC/smoothsdlc-backlog');
  // a token in the URL changes nothing (last two parts win)
  assert.equal(repoIdFromUrl('https://u:ghp_x@github.com/SmoothSDLC/smoothsdlc-backlog.git'), 'SmoothSDLC/smoothsdlc-backlog');
  // trailing slashes are ignored, .git is stripped
  assert.equal(repoIdFromUrl('https://github.com/o/r.git/'), 'o/r');
  // fewer than two parts -> ""
  assert.equal(repoIdFromUrl('a;rm -rf x'), '');
  assert.equal(repoIdFromUrl('https://github.com/SmoothSDLC'), 'github.com/SmoothSDLC');
  assert.equal(repoIdFromUrl(''), '');
  assert.equal(repoIdFromUrl(null), '');
  assert.equal(repoIdFromUrl(undefined), '');
});

test('slugify: lowercase, runs of non-alphanumerics to one dash, no / or .., fallback phase', () => {
  assert.equal(slugify('My Item'), 'my-item');
  assert.equal(slugify('CLI parity: job 3 (security)'), 'cli-parity-job-3-security');
  assert.equal(slugify('a;rm -rf x'), 'a-rm-rf-x');
  assert.equal(slugify(''), 'phase');
  assert.equal(slugify('   '), 'phase');
  assert.equal(slugify('...---'), 'phase');
  for (const s of ['My Item', 'a;rm -rf x', 'A1 b2 C3', 'x/../y']) {
    const out = slugify(s);
    assert.match(out, /^[a-z0-9-]*$/, `slugify(${JSON.stringify(s)}) = ${out}`);
    assert.doesNotMatch(out, /[/]/);
    assert.doesNotMatch(out, /\.\./);
  }
});

test('itemSelector: digits -> {number}, anything else -> {slug}, empty -> null', () => {
  assert.deepEqual(itemSelector('5'), { number: 5 });
  assert.deepEqual(itemSelector(' 12 '), { number: 12 });
  assert.deepEqual(itemSelector('007'), { number: 7 });
  assert.deepEqual(itemSelector('003-cli-parity-job-3-path-input-and-credential-safety-for-the-shared-mode'),
    { slug: '003-cli-parity-job-3-path-input-and-credential-safety-for-the-shared-mode' });
  assert.deepEqual(itemSelector('abc'), { slug: 'abc' });
  // any non-digit ident is a slug
  assert.deepEqual(itemSelector('a;rm -rf x'), { slug: 'a;rm -rf x' });
  assert.deepEqual(itemSelector('/etc/passwd'), { slug: '/etc/passwd' });
  assert.deepEqual(itemSelector('../x'), { slug: '../x' });
  assert.deepEqual(itemSelector('5x'), { slug: '5x' });
  assert.equal(itemSelector(''), null);
  assert.equal(itemSelector('   '), null);
  assert.equal(itemSelector(null), null);
  assert.equal(itemSelector(undefined), null);
});

test('validateHome: a good shared clone passes and returns the path', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  assert.equal(await validateHome(home), home);
});

test('validateHome: a relative path is refused before any git call', async () => {
  await assert.rejects(validateHome('home'), /not an absolute path/);
});

test('validateHome: a missing path is refused with its message', async () => {
  const d = tmp(test);
  const missing = join(d, 'nohome');
  await assert.rejects(
    validateHome(missing),
    (e) => e.message === `BACKLOG_HOME=${missing} does not exist; expected a clone of SmoothSDLC/smoothsdlc-backlog on main (unset BACKLOG_HOME to use ~/git/smoothsdlc-backlog)`,
  );
});

test('validateHome: a directory that is not the top folder of a git repository', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const sub = join(home, 'subdir');
  mkdirSync(sub);
  await assert.rejects(validateHome(sub),
    new RegExp(`${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is not the top folder of a git repository; expected a clone of SmoothSDLC/smoothsdlc-backlog on main`));
});

test('validateHome: a symlinked home is refused (item: no symlink on the path, via src/storage.js:8-17)', async () => {
  const d = tmp(test);
  const real = sharedBacklog(d);
  const link = join(d, 'links', 'home');
  mkdirSync(join(d, 'links'));
  symlinkSync(real, link);
  await assert.rejects(validateHome(link), /Symlink destination is unsupported/);
});

test('validateHome: a home with another origin is refused', async () => {
  const d = tmp(test);
  const other = consumer(d, 'Acme', 'widgets');
  await assert.rejects(validateHome(other), /has origin 'Acme\/widgets'; expected SmoothSDLC\/smoothsdlc-backlog/);
});

test('validateHome: a home on another branch is refused', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  spawnSync('git', ['-C', home, 'checkout', '-q', '-b', 'dev']);
  await assert.rejects(validateHome(home), /is on branch 'dev'; the backlog repository stays on main/);
});

test('validateHome: a detached home says detached HEAD', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  spawnSync('git', ['-C', home, 'checkout', '-q', '--detach']);
  await assert.rejects(validateHome(home), /is on branch 'detached HEAD'; the backlog repository stays on main/);
});

test('assertInside: a path inside the root returns the relative path; the root itself is ""', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const phases = join(home, 'phases');
  mkdirSync(phases);
  assert.equal(await assertInside(home, phases), 'phases');
  assert.equal(await assertInside(home, join(phases, '001-a.md')), join('phases', '001-a.md'));
  assert.equal(await assertInside(home, home), '');
});

test('assertInside: ../x and /etc/passwd are refused (item hostile inputs)', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  await assert.rejects(assertInside(home, '../x'), /Unsafe path/);
  await assert.rejects(assertInside(home, '/etc/passwd'), /Unsafe path/);
});

test('assertInside: a symlink component on the way down is refused (src/storage.js:8-17)', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const real = join(home, 'real');
  mkdirSync(real);
  symlinkSync(real, join(home, 'link'));
  await assert.rejects(assertInside(home, join(home, 'link', 'f.md')), /Symlink destination is unsupported/);
});

test('checkRefs: relative refs without .. pass (including an empty list)', () => {
  assert.doesNotThrow(() => checkRefs(['references/review/security.md', 'references/review/code.md']));
  assert.doesNotThrow(() => checkRefs([]));
  assert.doesNotThrow(() => checkRefs(['a;rm -rf x'])); // relative, no .., not absolute
});

test('checkRefs: absolute refs, .. refs and empty refs are refused (item hostile inputs)', () => {
  assert.throws(() => checkRefs(['/etc/passwd']), /absolute/);
  assert.throws(() => checkRefs(['../x']), /\.\./);
  assert.throws(() => checkRefs(['references/../x.md']), /\.\./);
  assert.throws(() => checkRefs(['']), /empty/);
  assert.throws(() => checkRefs('references/review/security.md'), /list/);
});

test('redact: user:token@ is stripped from URLs in git stderr (item hostile input)', () => {
  assert.equal(redact('remote: https://u:ghp_x@github.com/SmoothSDLC/smoothsdlc-backlog.git (fetch)'),
    'remote: https://github.com/SmoothSDLC/smoothsdlc-backlog.git (fetch)');
  assert.equal(redact('hint: git:tok@host:22/org/repo.git'), 'hint: host:22/org/repo.git');
  assert.equal(redact('error: https://u:ghp_x@github.com/a/b.git then https://y:z@h.com/c/d.git'),
    'error: https://github.com/a/b.git then https://h.com/c/d.git');
});

test('redact: the whole user-info of a URL goes, whatever characters the password holds (review P1)', () => {
  for (const pw of ['p=ss', 'p%40ss', "p=%!$&'()*+,;:x", 'a@b', 'p%3Ass@w']) {
    assert.equal(redact(`fatal: unable to access 'https://user:${pw}@example.com/org/repo.git/'`),
      "fatal: unable to access 'https://example.com/org/repo.git/'", pw);
  }
  assert.equal(redact('push ssh://tok@host:2222/o/r.git and ftp://u:p;q@h/x'), 'push ssh://host:2222/o/r.git and ftp://h/x');
});

test('redact: colon-less userinfo and plain text are left intact; non-strings are stringified', () => {
  assert.equal(redact('remote: git@github.com:SmoothSDLC/smoothsdlc-backlog.git'),
    'remote: git@github.com:SmoothSDLC/smoothsdlc-backlog.git');
  assert.equal(redact('hint: see a b c'), 'hint: see a b c');
  assert.equal(redact('u@h'), 'u@h');
  assert.equal(redact(123), '123');
  assert.equal(redact(''), '');
});

test('git: runs git with an argv array and returns {stdout, stderr, code}', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const ok = await git(['rev-parse', '--show-toplevel'], home);
  assert.equal(ok.code, 0);
  // git prints the long, forward-slash real path (Windows) or the resolved path (macOS)
  assert.equal(realpathSync.native(ok.stdout.trim()), realpathSync.native(home));
  assert.equal(typeof ok.stderr, 'string');
  const bad = await git(['rev-parse', '--verify', 'no-such-ref'], home);
  assert.notEqual(bad.code, 0);
  assert.ok(bad.stderr.length > 0, 'a failed git call reports its stderr');
  const gone = await git(['rev-parse', '--show-toplevel'], join(d, 'nohome'));
  assert.notEqual(gone.code, 0);
  assert.equal(gone.stdout, '');
});

test('git: never a shell — a hostile commit message survives as one argv element (item hostile input)', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const made = await git(['commit', '-q', '--allow-empty', '-m', 'a;rm -rf x'], home);
  assert.equal(made.code, 0);
  const log = await git(['log', '-1', '--format=%s'], home);
  assert.equal(log.stdout.trim(), 'a;rm -rf x');
});

test('git: GIT_TERMINAL_PROMPT=0 reaches the child process', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const hooks = join(home, 'hooks');
  mkdirSync(hooks);
  const hook = join(hooks, 'post-checkout');
  writeFileSync(hook, '#!/bin/sh\necho "prompt=${GIT_TERMINAL_PROMPT:-unset}" > "$PWD/prompt.txt"\n');
  chmodSync(hook, 0o755);
  await git(['config', 'core.hooksPath', 'hooks'], home);
  // with the variable removed from the parent env, only git() itself can set it
  const saved = process.env.GIT_TERMINAL_PROMPT;
  delete process.env.GIT_TERMINAL_PROMPT;
  try {
    await git(['checkout', '-q', '-b', 'hooktest'], home);
    assert.equal(readFileSync(join(home, 'prompt.txt'), 'utf8').trim(), 'prompt=0');
  } finally {
    process.env.GIT_TERMINAL_PROMPT = saved;
    await git(['checkout', '-q', 'main'], home);
    await git(['branch', '-D', 'hooktest'], home);
    await git(['config', '--unset', 'core.hooksPath'], home);
    rmSync(join(home, 'prompt.txt'), { force: true });
  }
  assert.equal(existsSync(join(home, 'prompt.txt')), false);
});

test('validateHome: a home that is a clone of the right origin but a subdirectory is refused', async () => {
  const d = tmp(test);
  const home = sharedBacklog(d);
  const sub = join(home, 'phases');
  mkdirSync(sub);
  await assert.rejects(validateHome(sub), /is not the top folder of a git repository/);
});

const CRED = 'https://alice:SUPERSECRET@example.com';

test('repoIdFromUrl strips URL user-info at the single place origins are parsed: no identity carries a credential', () => {
  for (const url of [`${CRED}/repo.git`, `${CRED}/owner/name.git`, 'https://SUPERSECRET@example.com/owner/name', 'alice:SUPERSECRET@example.com:owner/name.git', 'ssh://git:SUPERSECRET@example.com/owner/name']) {
    assert.ok(!repoIdFromUrl(url).includes('SUPERSECRET'), url);
  }
  assert.equal(repoIdFromUrl(`${CRED}/owner/name.git`), 'owner/name');
  assert.equal(repoIdFromUrl('git@github.com:owner/name.git'), 'owner/name');
});

test('no command prints the credential of an origin: the invalid-origin error of --use-backlog-repo and every command run from a credentialed clone', t => {
  const dir = tmp(t);
  sharedBacklog(dir);
  const bad = join(dir, 'bad-clone');
  mkdirSync(bad);
  for (const args of [['init', '-q', '-b', 'main'], ['remote', 'add', 'origin', `${CRED}/repo.git`]]) assert.equal(spawnSync('git', args, { cwd: bad }).status, 0);
  const r = cli(['--use-backlog-repo', bad], { tmp: dir });
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes('SUPERSECRET'), r.stdout + r.stderr);

  const cons = consumer(dir, 'acme', 'demo', 'main');
  assert.equal(spawnSync('git', ['remote', 'set-url', 'origin', `${CRED}/acme/demo.git`], { cwd: cons }).status, 0);
  for (const args of [['query', '--all'], ['next'], ['pop', '--agent', 'cody'], ['update', '1', '--summary', 'x'], ['archive', '1'], ['move', '1', '--to-branch', 'x'], ['move', '1', '--to-repository', 'a/b'],
    ['new', '--name', 'n', '--objective', 'o', '--summary', 's', '--depends-on', 'none']]) {
    const o = cli(args, { cwd: cons, tmp: dir });
    assert.ok(!(o.stdout + o.stderr).includes('SUPERSECRET'), `${args[0]}: ${o.stdout}${o.stderr}`);
  }
});
