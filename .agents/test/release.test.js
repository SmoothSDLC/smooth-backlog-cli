import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planRelease, tagRelease, publishedIntegrity, publishedReleases, selectRelease, stampRelease, versionFromTag, dispatchPublish, releaseTags, hasPackageChanges } from '../scripts/release.mjs';
const commit = 'a'.repeat(40), previous = 'b'.repeat(40), artifactIntegrity = 'sha512-current';
const version = '4.7.9', tag = `v${version}`;
test('the immutable tag version publishes only its exact artifact and commit', () => {
  assert.deepEqual(planRelease({ version, commit, artifactIntegrity, tagCommit: commit }), { release: true, publish: true, tag });
  assert.throws(() => planRelease({ version, commit, artifactIntegrity, tagCommit: previous, publishedIntegrity: 'sha512-previous' }), /tag points to a different commit/);
});
test('rerunning a published commit verifies it again without overwriting its npm version', () => {
  for (const tagCommit of [undefined, commit]) {
    assert.deepEqual(planRelease({ version, commit, artifactIntegrity, tagCommit, publishedIntegrity: artifactIntegrity }), { release: true, publish: false, tag });
  }
});
test('release planning rejects conflicting artifacts, conflicting unpublished tags, and unsafe versions', () => {
  assert.throws(() => planRelease({ version, commit, artifactIntegrity, publishedIntegrity: 'sha512-other' }), /different artifact/i);
  assert.throws(() => planRelease({ version, commit, artifactIntegrity, tagCommit: previous }), /tag.*different commit/i);
  assert.throws(() => planRelease({ version: version + '; echo unsafe', commit, artifactIntegrity }), /stable version/i);
});
test('release tags are pushed to the exact validated commit and cannot be moved', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'smooth-backlog-release-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = join(dir, 'remote.git'), repo = join(dir, 'repo');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' });
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['config', 'user.name', 'Release test']); git(['config', 'user.email', 'release-test@example.invalid']);
  git(['remote', 'add', 'origin', remote]); git(['commit', '--allow-empty', '-m', 'validated release']);
  const sha = git(['rev-parse', 'HEAD']);
  assert.equal(await tagRelease({ version, commit: sha, cwd: repo }), tag);
  assert.equal(git(['rev-parse', tag + '^{commit}']), sha);
  assert.match(git(['ls-remote', 'origin', 'refs/tags/' + tag + '^{}']), new RegExp('^' + sha));
  assert.equal(await tagRelease({ version, commit: sha, cwd: repo }), tag);
  assert.deepEqual(await releaseTags(repo), [{ version, commit: sha }]);
  assert.deepEqual(selectRelease([], sha, await releaseTags(repo)), { version, upgradeFrom: '' });
  git(['commit', '--allow-empty', '-m', 'later change']);
  await assert.rejects(tagRelease({ version, commit: git(['rev-parse', 'HEAD']), cwd: repo }), /tag.*different commit/i);
  assert.equal(git(['rev-parse', tag + '^{commit}']), sha);
  writeFileSync(join(repo, 'README.md'), 'Documentation only'); git(['add', '.']); git(['commit', '-m', 'docs']);
  assert.equal(await hasPackageChanges(repo, tag), false);
  mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/cli.js'), 'export const changed = true;'); git(['add', '.']); git(['commit', '-m', 'runtime']);
  assert.equal(await hasPackageChanges(repo, tag), true);
});

test('registry absence is distinguished from authentication and network failures', async () => {
  assert.equal(await publishedIntegrity('pkg', version, async () => ({ stdout: JSON.stringify('sha512-value') })), 'sha512-value');
  assert.equal(await publishedIntegrity('pkg', version, async () => { throw { stdout: JSON.stringify({ error: { code: 'E404' } }) }; }), null);
  for (const code of ['E401', 'E403', 'ECONNRESET']) {
    await assert.rejects(publishedIntegrity('pkg', version, async () => { throw { stdout: JSON.stringify({ error: { code } }) }; }), /registry version check failed/i);
  }
});

test('main assigns the next patch from registry and reserved tags and reruns reuse the assigned tag', () => {
  const records = [{ version: '4.7.8' }, { version: '4.7.9' }, { version: '9.0.0-beta.1' }];
  assert.deepEqual(selectRelease(records, commit), { version: '4.7.10', upgradeFrom: version });
  const tags = [{ version: '4.7.10', commit: previous }];
  assert.equal(selectRelease(records, commit, tags).version, '4.7.11');
  assert.deepEqual(selectRelease(records, previous, tags), { version: '4.7.10', upgradeFrom: version });
  assert.throws(() => selectRelease(records, previous, [...tags, { version: '4.7.11', commit: previous }]), /multiple release tags/i);
});

test('publishing stamps only the tag version into package metadata and its lockfile', async t => {
  const root = mkdtempSync(join(tmpdir(), 'smooth-backlog-stamp-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = { name: '@example/fixture', version: '0.0.0-development', private: true };
  writeFileSync(join(root, 'package.json'), JSON.stringify(metadata));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: metadata.version, packages: { '': { ...metadata } } }));
  const selected = versionFromTag('refs/tags/' + tag);
  await stampRelease({ root, version: selected, commit });
  for (let i = 0; i < 2; i++) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'))), lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
    assert.equal(pkg.version, selected); assert.equal(pkg.private, undefined);
    assert.equal(lock.version, selected); assert.equal(lock.packages[''].version, selected); assert.equal(lock.packages[''].private, undefined);
    await stampRelease({ root, version: selected, commit });
  }
  assert.throws(() => versionFromTag('refs/heads/main'), /version tag/);
  assert.throws(() => versionFromTag('refs/tags/vbad'), /stable version/);
});

test('the default workflow token dispatches publishing at the immutable tag and reports failures', async () => {
  let call;
  await dispatchPublish({ repository: 'owner/repo', tag, token: 'test-token', request: async (url, options) => { call = { url, options }; return { ok: true }; } });
  assert.match(call.url, /\/actions\/workflows\/publish.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(call.options.body), { ref: tag });
  assert.equal(call.options.method, 'POST');
  await assert.rejects(dispatchPublish({ repository: 'owner/repo', tag, request: async () => ({ ok: false, status: 403 }) }), /dispatch failed.*403/);
});

test('registry history handles one or many releases and distinguishes absence from failures', async () => {
  const record = { version, dist: { integrity: artifactIntegrity } };
  for (const value of [record, [record]]) assert.deepEqual(await publishedReleases('pkg', async () => ({ stdout: JSON.stringify(value) })), [record]);
  assert.deepEqual(await publishedReleases('pkg', async () => { throw { stdout: JSON.stringify({ error: { code: 'E404' } }) }; }), []);
  for (const code of ['E401', 'E403', 'ECONNRESET']) await assert.rejects(publishedReleases('pkg', async () => { throw { stdout: JSON.stringify({ error: { code } }) }; }), /history check failed/);
  await assert.rejects(publishedReleases('pkg', async () => ({ stdout: '{}' })), /history check failed/);
});
