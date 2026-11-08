#!/usr/bin/env node
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
const packageName = '@smoothsdlc/smooth-backlog-cli';
const registry = 'https://npm.pkg.github.com';

// npm, with its notifier and funding messages off; the output stays private (a registry error can carry a credential-bearing URL).
export async function runNpm(args, options = {}) {
  try {
    const result = await exec('npm', args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...options, env: { ...process.env, npm_config_update_notifier: 'false', npm_config_fund: 'false', ...(options.env ?? {}) } });
    return result.stdout.trim();
  } catch (e) { throw new Error(`npm ${args[0]} failed (${e.code || e.signal || 'unknown error'}). Check network access, registry authentication and filesystem permissions.`); }
}

// The installed package runs the one command set against a repository in a temporary folder: setup deploys the skill
// into every agent folder present, the items live inside the repository (no backlog repository is configured), and the
// commands create, read, change, finish and archive items. upgradeFrom: the prefix holds an older version; the newer
// one is installed over it and the item it created is still there.
export async function verifyInstalled({ prefix, expectedVersion, verifyRegistry = false, upgradeFrom }) {
  const work = await fs.mkdtemp(join(tmpdir(), 'backlog-release-check-'));
  try {
    const modules = await runNpm(['root', '--global', '--prefix', prefix]);
    const installed = join(modules, ...packageName.split('/'));
    const bin = join(installed, 'bin/backlog.js');
    const metadata = JSON.parse(await fs.readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(metadata.name, packageName); assert.equal(metadata.version, upgradeFrom || expectedVersion);
    const shim = process.platform === 'win32' ? join(prefix, 'backlog.cmd') : join(prefix, 'bin/backlog'); await fs.access(shim);
    const repo = join(work, 'repo'), config = join(work, 'config'), home = join(work, 'home');
    await fs.mkdir(repo); await fs.mkdir(config, { recursive: true }); await fs.mkdir(home);
    const env = { ...process.env, XDG_CONFIG_HOME: config, HOME: home, BACKLOG_HOME: '', BACKLOG_ORIGIN_URL: '', BACKLOG_AGENT: 'verifier', PATH: (process.platform === 'win32' ? prefix : join(prefix, 'bin')) + delimiter + process.env.PATH };
    const options = { cwd: repo, env, windowsHide: true, timeout: 30000 };
    const git = args => exec('git', args, options);
    await git(['init', '-b', 'main']); await git(['config', 'user.email', 'release-test@example.invalid']); await git(['config', 'user.name', 'Published package verification']); await git(['commit', '--allow-empty', '-m', 'fixture root']);
    const origin = join(work, 'origin.git'); await exec('git', ['init', '--bare', '-q', origin], { windowsHide: true }); // every backlog change is pushed
    await git(['remote', 'add', 'origin', origin]); await git(['push', '-q', '-u', 'origin', 'main']);
    let commands = 0;
    const cli = async (...args) => { const { stdout } = await exec(process.execPath, [bin, ...args], options); commands++; return stdout; };
    const json = async (...args) => JSON.parse(await cli(...args, '--json'));
    const queue = async (...args) => (await json('list', ...args)).phases.filter(p => !['closed', 'done', 'archived'].includes(p.status)).map(p => p.seq); // the open items; list prints finished ones last
    const fail = async (code, ...args) => {
      try { await exec(process.execPath, [bin, ...args], options); assert.fail(`Expected backlog ${args.join(' ')} to be refused`); }
      catch (error) { assert.equal(error.code, code, `backlog ${args.join(' ')}: exit ${error.code}\n${error.stdout}${error.stderr}`); commands++; }
    };
    assert.equal((await cli('--version')).trim(), upgradeFrom || expectedVersion);
    assert.match(await cli('--help'), /backlog new --name/);
    for (const vendor of ['.agents', '.claude', '.github', '.qwen']) await fs.mkdir(join(repo, vendor));
    assert.match(await cli('setup'), /skill deployed to/);
    await cli('new', '--name', 'First published task', '--objective', 'Verify the downloaded CLI', '--summary', 'the installed commands work');
    if (upgradeFrom) {
      await runNpm(['install', '--global', '--prefix', prefix, '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--registry', registry, '--prefer-online', `${packageName}@${expectedVersion}`], { timeout: 120000 });
      assert.equal((await cli('--version')).trim(), expectedVersion);
      assert.equal((await json('show', '1')).name, 'First published task', 'an upgrade keeps the items');
    }
    await cli('new', '--name', 'Second published task', '--objective', 'Verify ordering', '--summary', 'priorities stay dense', '--priority', '0');
    assert.deepEqual(await queue(), [2, 1]);
    assert.equal((await json('next')).seq, 2);
    await cli('update', '1', '--priority', '0'); assert.equal((await json('next')).seq, 1);
    await cli('update', '1', '--append', '## Findings\n- the installed commands work');
    assert.match((await json('show', '1')).body, /the installed commands work/);
    await fail(1, 'archive', '1');
    await cli('update', '1', '--status', 'done');
    assert.equal((await json('show', '1')).status, 'closed');
    assert.match(await cli('archive', '1'), /archived/);
    assert.equal((await json('show', '1')).status, 'archived');
    await git(['switch', '-c', 'feature']);
    await cli('new', '--name', 'Feature', '--objective', 'Cross-branch isolation', '--summary', 'items follow their branch');
    assert.deepEqual(await queue(), [3]);
    assert.equal((await json('list', 'all-branches')).phases.length, 3);
    await git(['switch', 'main']); // inside the repository the items are committed on their branch: main does not carry the feature's item
    assert.deepEqual(await queue(), [2]);
    assert.equal((await json('list', 'all-branches')).phases.length, 2);
    await fail(2, 'frobnicate');
    if (verifyRegistry) {
      const latest = JSON.parse(await runNpm(['view', packageName, 'version', '--json', '--registry', registry, '--prefer-online']));
      assert.match(latest, /^\d+\.\d+\.\d+$/);
    }
    for (const vendor of ['.agents', '.claude', '.github', '.qwen']) {
      const skill = join(repo, vendor, 'skills/backlog');
      assert.match(await fs.readFile(join(skill, 'SKILL.md'), 'utf8'), /name: backlog/);
      await fs.access(join(skill, 'scripts/install-backlog-cli.sh'));
      await fs.access(join(skill, 'references/commands.md'));
    }
    return { ok: true, package: packageName, version: expectedVersion, platform: process.platform, node: process.versions.node, commands, installed_agents: 4, ...(upgradeFrom ? { upgraded_from: upgradeFrom } : {}) };
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

export async function verifyPublished(version, expectedIntegrity) {
  assert.match(version || '', /^\d+\.\d+\.\d+$/, 'Provide an exact stable release version');
  const work = await fs.mkdtemp(join(tmpdir(), 'backlog-registry-install-'));
  try {
    const prefix = join(work, 'install'), cache = join(work, 'fresh-cache');
    const spec = `${packageName}@${version}`;
    const integrity = JSON.parse(await runNpm(['view', spec, 'dist.integrity', '--json', '--registry', registry, '--cache', cache, '--prefer-online']));
    if (expectedIntegrity) assert.equal(integrity, expectedIntegrity, 'Published tarball integrity must match the artifact that was tested and published');
    await runNpm(['install', '--global', '--prefix', prefix, '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--registry', registry, '--cache', cache, '--prefer-online', spec], { timeout: 120000 });
    const verified = await verifyInstalled({ prefix, expectedVersion: version, verifyRegistry: true });
    let upgrade;
    const baseline = process.env.BACKLOG_UPGRADE_FROM;
    if (baseline && baseline !== version) {
      assert.match(baseline, /^\d+\.\d+\.\d+$/, 'Upgrade baseline must be an exact stable version');
      const oldPrefix = join(work, 'upgrade-from-published-version');
      await runNpm(['install', '--global', '--prefix', oldPrefix, '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--registry', registry, '--cache', cache, `${packageName}@${baseline}`], { timeout: 120000 });
      upgrade = await verifyInstalled({ prefix: oldPrefix, expectedVersion: version, verifyRegistry: true, upgradeFrom: baseline });
    }
    return { ...verified, registry, integrity, source: 'GitHub Packages, fresh npm cache', ...(upgrade ? { upgrade } : {}) };
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyPublished(process.argv[2] || process.env.RELEASE_VERSION, process.argv[3] || process.env.RELEASE_INTEGRITY);
    const output = JSON.stringify(result, null, 2) + '\n';
    if (process.env.BACKLOG_RELEASE_RESULT) await fs.writeFile(process.env.BACKLOG_RELEASE_RESULT, output);
    process.stdout.write(output);
  } catch (error) { process.stderr.write(`Published package verification failed: ${error.message}\n`); process.exitCode = 1; }
}
