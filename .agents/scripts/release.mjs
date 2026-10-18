import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
const registry = 'https://npm.pkg.github.com';
function releaseTag(version) {
  assert.match(version || '', /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Release requires an exact stable version');
  return `v${version}`;
}
async function tagCommit(tag, cwd) {
  try { return (await exec('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], { cwd })).stdout.trim(); }
  catch (error) { if (error.code === 1) return null; throw error; }
}
export function planRelease({ version, commit, tagCommit: existing, publishedIntegrity: published, artifactIntegrity }) {
  const tag = releaseTag(version); assert.match(commit || '', /^[0-9a-f]{40}$/i, 'Release requires a commit SHA');
  assert.ok(artifactIntegrity, 'Release requires the packed artifact integrity');
  assert.ok(!existing || existing === commit, 'Release tag points to a different commit; it will not be moved');
  assert.ok(!published || published === artifactIntegrity, 'This version is already published with a different artifact; refusing to overwrite it');
  return { release: true, publish: !published, tag };
}
const stable = version => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
function newestFirst(a, b) {
  const left = a.version.split('.').map(BigInt), right = b.version.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? -1 : 1;
  return 0;
}
export function selectRelease(records, commit, tags = []) {
  assert.match(commit || '', /^[0-9a-f]{40}$/i, 'Release requires a commit SHA');
  const releases = records.filter(record => stable(record.version)).sort(newestFirst);
  const matches = tags.filter(tag => tag.commit === commit && stable(tag.version));
  assert.ok(matches.length <= 1, 'Multiple release tags claim this commit; refusing to allocate another');
  const previous = releases.find(record => record.version !== matches[0]?.version);
  if (matches.length) return { version: matches[0].version, upgradeFrom: previous?.version || '' };
  const reserved = [...releases, ...tags.filter(tag => stable(tag.version))].sort(newestFirst);
  const [major, minor, patch] = (reserved[0]?.version || [0, 0, 0].join('.')).split('.').map(BigInt);
  return { version: `${major}.${minor}.${patch + 1n}`, upgradeFrom: previous?.version || '' };
}
export async function publishedReleases(name, runner = exec) {
  try {
    const result = await runner('npm', ['view', `${name}@*`, '--json', '--registry', registry], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    const value = JSON.parse(result.stdout), records = Array.isArray(value) ? value : [value];
    assert.ok(records.length && records.every(record => typeof record.version === 'string' && record.dist?.integrity), 'Registry release metadata is incomplete');
    return records;
  } catch (error) {
    let response; try { response = JSON.parse(error.stdout); } catch {}
    if (response?.error?.code === 'E404') return [];
    throw new Error('Registry release history check failed; verify package access, authentication, and network connectivity');
  }
}
export async function stampRelease({ root, version, commit }) {
  releaseTag(version); assert.match(commit || '', /^[0-9a-f]{40}$/i, 'Release requires a commit SHA');
  const pkgPath = join(root, 'package.json'), lockPath = join(root, 'package-lock.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')), lock = JSON.parse(await readFile(lockPath, 'utf8'));
  pkg.version = lock.version = lock.packages[''].version = version;
  delete pkg.private; delete lock.packages[''].private;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
export async function hasPackageChanges(cwd, tag) {
  try {
    await exec('git', ['diff', '--quiet', tag, 'HEAD', '--', 'bin/', 'src/', 'templates/', 'package.json', 'package-lock.json', 'LICENSE', 'NOTICE'], { cwd });
    return false;
  } catch (error) { if (error.code === 1) return true; throw error; }
}
export async function releaseTags(cwd = process.cwd()) {
  const { stdout } = await exec('git', ['for-each-ref', '--format=%(refname:strip=2)', 'refs/tags/v*'], { cwd });
  const tags = [];
  for (const tag of stdout.trim().split('\n').filter(Boolean)) {
    if (stable(tag.slice(1))) tags.push({ version: tag.slice(1), commit: await tagCommit(tag, cwd) });
  }
  return tags;
}
export function versionFromTag(ref) {
  assert.ok(ref?.startsWith('refs/tags/v'), 'Publishing requires a version tag; branch dispatches cannot publish');
  const version = ref.slice('refs/tags/v'.length); releaseTag(version); return version;
}
export async function dispatchPublish({ repository, tag, token, request = fetch }) {
  assert.match(repository || '', /^[\w.-]+\/[\w.-]+$/, 'GitHub repository is required');
  assert.equal(tag, releaseTag(tag.slice(1)), 'Publishing requires a stable version tag');
  const response = await request(`https://api.github.com/repos/${repository}/actions/workflows/publish.yml/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: tag }), signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `Tag publishing dispatch failed (HTTP ${response.status}); rerun the main release workflow to retry`);
}
export async function publishedIntegrity(name, version, runner = exec) {
  try {
    const result = await runner('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json', '--registry', registry], { timeout: 30000 });
    const integrity = JSON.parse(result.stdout); assert.equal(typeof integrity, 'string'); return integrity;
  } catch (error) {
    let response; try { response = JSON.parse(error.stdout); } catch {}
    if (response?.error?.code === 'E404') return null;
    throw new Error('Registry version check failed; verify package access, authentication, and network connectivity');
  }
}
export async function tagRelease({ version, commit, cwd = process.cwd() }) {
  const tag = releaseTag(version); assert.match(commit || '', /^[0-9a-f]{40}$/i, 'Release requires a commit SHA');
  const existing = await tagCommit(tag, cwd);
  assert.ok(!existing || existing === commit, 'Release tag already points to a different commit; it will not be moved');
  if (!existing) await exec('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'tag', '-a', tag, commit, '-m', `Release ${version}`], { cwd });
  await exec('git', ['push', 'origin', `refs/tags/${tag}`], { cwd });
  return tag;
}
async function run() {
  const root = resolve(import.meta.dirname, '../..');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const commit = process.env.GITHUB_SHA;
  if (process.argv[2] === 'tag-main') {
    assert.ok(process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'push', 'Release versions are assigned only after a main push');
    const records = await publishedReleases(pkg.name), tags = await releaseTags(root), assignment = selectRelease(records, commit, tags);
    const latest = records.filter(record => stable(record.version)).sort(newestFirst)[0];
    if (!tags.some(tag => tag.commit === commit) && latest && await tagCommit(releaseTag(latest.version), root) && !await hasPackageChanges(root, releaseTag(latest.version))) {
      console.log('Public runtime unchanged since the latest release; skipping publication'); return;
    }
    const tag = await tagRelease({ version: assignment.version, commit, cwd: root });
    await dispatchPublish({ repository: process.env.GITHUB_REPOSITORY, tag, token: process.env.GH_TOKEN });
    console.log(`Main workflow created ${tag} and dispatched publishing at that immutable tag`); return;
  }
  assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME), 'Publishing requires a tag push or tag dispatch');
  const version = versionFromTag(process.env.GITHUB_REF);
  assert.equal(await tagCommit(releaseTag(version), root), commit, 'Tag must point to the exact release commit');
  if (process.argv[2] === 'prepare') {
    assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
    const records = (await publishedReleases(pkg.name)).filter(record => stable(record.version) && newestFirst(record, { version }) > 0).sort(newestFirst);
    await stampRelease({ root, version, commit });
    await appendFile(process.env.GITHUB_OUTPUT, `release=true\nversion=${version}\nupgrade_from=${records[0]?.version || ''}\n`);
    console.log(`Publishing fixed version ${version} from its tag`); return;
  }
  assert.equal(process.argv[2], 'plan', 'Use release.mjs tag-main, prepare, or plan');
  assert.equal(process.env.RELEASE_VERSION, version, 'Packed release version must match its tag');
  const tag = releaseTag(version);
  const plan = planRelease({ version, commit, artifactIntegrity: process.env.RELEASE_INTEGRITY, tagCommit: await tagCommit(tag), publishedIntegrity: await publishedIntegrity(pkg.name, version) });
  assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
  await appendFile(process.env.GITHUB_OUTPUT, `release=${plan.release}\npublish=${plan.publish}\n`);
  console.log(`Verify release ${version}; npm publication ${plan.publish ? 'required' : 'already complete'}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => { process.stderr.write(`Release automation failed: ${error.message}\n`); process.exitCode = 1; });
}
