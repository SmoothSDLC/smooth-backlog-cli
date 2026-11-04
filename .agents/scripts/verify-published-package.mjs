#!/usr/bin/env node
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runNpm } from '../../src/process.js';
const exec = promisify(execFile);
const packageName = '@smoothsdlc/smooth-backlog-cli';
const registry = 'https://npm.pkg.github.com';

export async function verifyInstalled({ prefix, expectedVersion, verifyRegistry = false, upgradeFrom }) {
  const work = await fs.mkdtemp(join(tmpdir(), 'backlog-release-check-'));
  try {
    const modules = await runNpm(['root', '--global', '--prefix', prefix]);
    const installed = join(modules, ...packageName.split('/'));
    const bin = join(installed, 'bin/backlog.js');
    const metadata = JSON.parse(await fs.readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(metadata.name, packageName); assert.equal(metadata.version, upgradeFrom || expectedVersion);
    const shim = process.platform === 'win32' ? join(prefix, 'backlog.cmd') : join(prefix, 'bin/backlog'); await fs.access(shim);
    const repo = join(work, 'repo'), config = join(work, 'config');
    await fs.mkdir(repo); await fs.mkdir(join(config, 'smooth-backlog-cli'), { recursive: true });
    await fs.writeFile(join(config, 'smooth-backlog-cli/config.json'), JSON.stringify({ schema_version: 1, weekly: false, auto: false }));
    const env = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config, BACKLOG_CLI_BRANCH: '', BACKLOG_CLI_REPONAME: '', PATH: (process.platform === 'win32' ? prefix : join(prefix, 'bin')) + delimiter + process.env.PATH };
    const options = { cwd: repo, env, windowsHide: true, timeout: 30000 };
    const git = args => exec('git', args, options);
    await git(['init', '-b', 'main']); await git(['config', 'user.email', 'release-test@example.invalid']); await git(['config', 'user.name', 'Published package verification']); await git(['commit', '--allow-empty', '-m', 'verification root']);
    let commands = 0;
    const cli = async (...args) => {
      const { stdout } = await exec(process.execPath, [bin, '--json', ...args], options); commands++;
      const result = JSON.parse(stdout); assert.equal(result.ok, true); return result.data;
    };
    const fail = async (...args) => {
      try { await exec(process.execPath, [bin, '--json', ...args], options); assert.fail('Expected command to reject invalid input'); }
      catch (error) { assert.equal(error.code, 2); assert.equal(JSON.parse(error.stdout).ok, false); commands++; }
    };
    assert.equal((await exec(process.execPath, [bin, '--version'], options)).stdout.trim(), upgradeFrom || expectedVersion);
    assert.match((await exec(process.execPath, [bin, '--help'], options)).stdout, /backlog/);
    for (const vendor of ['.agents', '.claude', '.github', '.qwen']) await fs.mkdir(join(repo, vendor));
    const init = await cli('init'); assert.equal(init.installed_agents.length, 4);
    const first = await cli('new', 'First published task', '--description', 'Verify the downloaded CLI', '--ac', 'The installed commands work');
    if (upgradeFrom) {
      const updated = await cli('update', 'auto'); assert.equal(updated.installed, expectedVersion);
      assert.equal((await exec(process.execPath, [bin, '--version'], options)).stdout.trim(), expectedVersion);
      assert.equal((await cli()).id, first.id, 'A published-version upgrade must retain the permanent item identity');
      const stored = JSON.parse(await fs.readFile(join(repo, '.backlog/config.json'), 'utf8'));
      assert.equal(stored.generated_version, expectedVersion);
    }
    const second = await cli('new', 'Second published task', '--description', 'Verify ordering', '--ac', 'Priorities normalize');
    assert.match(first.id, /^[0-9a-f-]{36}$/); assert.equal(second.priority, 1);
    await cli('1', 'priority', '0'); assert.equal((await cli()).id, second.id);
    await cli('0', 'add', 'tasks', 'Inspect,Downloaded artifacts are executable');
    await cli('set', '0', 'tasks', 'Validate,Generated instructions exist');
    assert.equal((await cli('priority', '0', 'tasks', '2', '1')).tasks[0].name, 'Validate');
    await cli('remove', '0', 'tasks', '2');
    await cli('set', '0', 'outcomes', '["Complete"]', '--force');
    await fail('archive', '0', '--force');
    await cli(second.id, 'done');
    const done = await cli('list', 'done'); assert.equal(done[0].id, second.id); assert.ok(done[0].item_completed_at);
    await cli('archive', 'done'); const archive = await cli('list', 'archive'); assert.equal(archive[0].id, second.id); assert.ok(archive[0].item_archived_at);
    await git(['switch', '-c', 'feature']);
    const feature = await cli('new', 'Feature', '--description', 'Cross-branch isolation', '--ac', 'Wrong-branch writes fail');
    await git(['switch', 'main']); await fail('set', feature.id, 'name', 'Forbidden');
    assert.equal((await cli('list', '--branch', 'feature'))[0].id, feature.id);
    await cli('import', '--branch', 'feature'); assert.deepEqual((await cli('list')).map(x => x.id), [first.id, feature.id]);
    assert.equal((await cli('list', 'branch')).find(x => x.branch === 'main').total, 3);
    const backup = await cli('init', 'backup'); await fs.access(join(backup.backup, 'backlog_manifest.json'));
    assert.equal((await cli('list')).length, 2);
    if (verifyRegistry) {
      const check = await cli('update', 'check'); assert.match(check.latest, /^\d+\.\d+\.\d+$/);
      // Verify auto-enable for this real custom-prefix installation without upgrading an older artifact.
      if (check.latest === expectedVersion) await cli('update', 'auto');
    }
    await cli('update', 'disable'); await cli('update', 'off');
    for (const vendor of ['.agents', '.claude', '.github', '.qwen']) {
      const skill = join(repo, vendor, 'skills/backlog');
      assert.match(await fs.readFile(join(skill, 'SKILL.md'), 'utf8'), /name: backlog/);
      await fs.access(join(skill, 'scripts/install-backlog-cli.sh'));
      await fs.access(join(skill, 'references/commands.md'));
    }
    await cli('init', 'clean'); assert.deepEqual(await cli('list'), []);
    return { ok: true, package: packageName, version: expectedVersion, platform: process.platform, node: process.versions.node, commands, installed_agents: init.installed_agents.length, ...(upgradeFrom ? { upgraded_from: upgradeFrom, permanent_identity_preserved: true } : {}) };
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
