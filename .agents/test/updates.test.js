import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.js';
const load = () => import('../../src/updates.js');

test('weekly, auto daily, and failure hourly scheduling obey persisted attempts', async t => {
  const { due } = await load(); const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(due({ weekly: true, auto: false }, now), true);
  assert.equal(due({ weekly: false, auto: false }, now), false);
  assert.equal(due({ weekly: true, auto: false, last_check_at: new Date(now - 6 * 86400000).toISOString(), last_check_status: 'ok' }, now), false);
  assert.equal(due({ weekly: true, auto: true, last_check_at: new Date(now - 86400000).toISOString(), last_check_status: 'ok' }, now), true);
  assert.equal(due({ weekly: true, last_check_at: new Date(now - 3599000).toISOString(), last_check_status: 'failed' }, now), false);
  assert.equal(due({ weekly: true, last_check_at: new Date(now - 3600000).toISOString(), last_check_status: 'failed' }, now), true);
});
test('stable release selection excludes prereleases, prevents downgrade and identifies latest within installed major', async () => {
  const { releases } = await load();
  assert.deepEqual(releases(['0.9.0', '1.0.0', '1.2.1', '1.3.0-beta.1', '2.0.0', '999.bad'], '1.0.0'), { latest: '2.0.0', compatible: '1.2.1', major: true });
  assert.equal(releases(['0.9.0'], '1.0.0').compatible, null);
});
test('not-due invocations do not call npm or rewrite user config', async t => {
  const { updater } = await load(); const f = fixture(t); const path = join(f.dir, 'user.json');
  const text = JSON.stringify({ schema_version: 1, weekly: true, auto: false, last_check_status: 'ok', last_check_at: '2026-10-16T11:59:00.000Z' }); await fs.writeFile(path, text);
  const u = updater({ configPath: path, now: () => Date.parse('2026-10-16T12:00:00Z'), runner: () => { throw new Error('Unexpected npm'); } });
  assert.equal(await u.scheduled(), null); assert.equal(await fs.readFile(path, 'utf8'), text);
});
test('registry check persists one attempt and major-version notice without auto-installing a major', async t => {
  const { updater } = await load(); const f = fixture(t); const path = join(f.dir, 'user.json'); const calls = [];
  const runner = async args => {
    calls.push(args);
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","2.0.0"]';
    throw new Error(`Unexpected npm ${args}`);
  };
  const notices = []; const u = updater({ configPath: path, runner, notice: x => notices.push(x), version: '1.0.0' });
  const result = await u.scheduled(); assert.equal(result.latest, '2.0.0'); assert.match(notices.join('\n'), /major.*backlog update/i);
  const saved = JSON.parse(await fs.readFile(path, 'utf8')); assert.equal(saved.last_check_status, 'ok'); assert.equal(saved.available_version, '2.0.0');
  const before = calls.length; await u.scheduled(); assert.equal(calls.length, before);
});
test('failed scheduled registry access is nonfatal, records failure, and retries after an hour', async t => {
  const { updater } = await load(); const f = fixture(t); const path = join(f.dir, 'user.json'); let now = 10000000, calls = 0;
  const u = updater({ configPath: path, now: () => now, runner: async () => { calls++; throw new Error('offline'); }, notice: () => {} });
  await u.scheduled(); assert.equal(JSON.parse(await fs.readFile(path, 'utf8')).last_check_status, 'failed');
  const before = calls; now += 3599999; await u.scheduled(); assert.equal(calls, before); now++;
  await u.scheduled(); assert.equal(calls, before + 1);
});
test('missing GitHub registry returns exact configuration instructions', async t => {
  const { updater } = await load(); const f = fixture(t);
  const u = updater({ configPath: join(f.dir, 'user.json'), runner: async () => 'undefined', notice: () => {} });
  await assert.rejects(u.command('check'), /npm config set @smoothsdlc:registry https:\/\/npm.pkg.github.com/);
});
test('auto enabling refuses an unmanaged install without persisting auto=true', async t => {
  const { updater } = await load(); const f = fixture(t); const path = join(f.dir, 'user.json');
  const u = updater({ configPath: path, packageRoot: f.root, runner: async () => join(f.dir, 'elsewhere'), notice: () => {} });
  await assert.rejects(u.command('auto'), /npm install.*global/);
  await assert.rejects(fs.readFile(path), { code: 'ENOENT' });
});
test('disabling weekly notices and turning auto off are independent user preferences', async t => {
  const { updater } = await load(); const f = fixture(t); const path = join(f.dir, 'user.json');
  await fs.writeFile(path, JSON.stringify({ schema_version: 1, weekly: true, auto: true }));
  const u = updater({ configPath: path, runner: () => { throw new Error('Unexpected network'); } });
  await u.command('disable'); let saved = JSON.parse(await fs.readFile(path, 'utf8')); assert.equal(saved.weekly, false); assert.equal(saved.auto, true);
  await u.command('off'); saved = JSON.parse(await fs.readFile(path, 'utf8')); assert.equal(saved.weekly, false); assert.equal(saved.auto, false);
});
async function runtimePackage(path, version, extra = {}) {
  await fs.mkdir(join(path, 'bin'), { recursive: true }); await fs.mkdir(join(path, 'src'), { recursive: true });
  await fs.writeFile(join(path, 'package.json'), JSON.stringify({ name: '@smoothsdlc/smooth-backlog-cli', version, bin: { backlog: 'bin/backlog.js' }, engines: { node: '>=24' }, backlogSchemaVersion: 1, backlogRuntimeVersion: 1, ...extra }));
  await fs.copyFile(new URL('../../bin/backlog.js', import.meta.url), join(path, 'bin/backlog.js'));
  await fs.writeFile(join(path, 'src/main.js'), `export async function run() { process.stdout.write('${version}\\n'); }`);
}
test('runtime activation keeps the executable stable and rolls back a failed activation', async t => {
  const { replacePackage } = await load(); const f = fixture(t); const target = join(f.dir, 'installed'), staged = join(f.dir, 'staged');
  await runtimePackage(target, '1.0.0'); await runtimePackage(staged, '1.1.0');
  let validations = 0;
  await assert.rejects(replacePackage(target, staged, async path => { validations++; if (path === target) throw new Error('broken executable'); }), /broken executable/);
  assert.equal(validations, 2); assert.equal(await fs.readFile(join(target, 'src/main.js'), 'utf8'), "export async function run() { process.stdout.write('1.0.0\\n'); }");
  const { spawnSync } = await import('node:child_process');
  assert.equal(spawnSync(process.execPath, [join(target, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), '1.0.0');
  await replacePackage(target, staged, async () => {});
  assert.equal(spawnSync(process.execPath, [join(target, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), '1.1.0');
});
test('auto installs only a staged compatible release while retaining the major notice', async t => {
  const { updater } = await load(); const f = fixture(t); const modules = join(f.dir, 'global', 'node_modules');
  const root = join(modules, '@smoothsdlc/smooth-backlog-cli'); await runtimePackage(root, '1.0.0');
  const runner = async args => {
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.1.0","2.0.0"]';
    if (args[0] === 'root') return args.includes('--prefix') ? join(args[args.indexOf('--prefix') + 1], 'node_modules') : modules;
    if (args[0] === 'install') {
      assert.equal(args.at(-1), '@smoothsdlc/smooth-backlog-cli@1.1.0');
      const prefix = args[args.indexOf('--prefix') + 1]; const path = join(prefix, 'node_modules/@smoothsdlc/smooth-backlog-cli'); await runtimePackage(path, '1.1.0'); return '';
    }
    throw new Error(`Unexpected npm ${args}`);
  };
  const path = join(f.dir, 'user.json'); const notices = [];
  const u = updater({ packageRoot: root, configPath: path, runner, version: '1.0.0', notice: x => notices.push(x) });
  const result = await u.command('auto'); assert.equal(result.installed, '1.1.0');
  assert.equal(JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8')).version, '1.1.0');
  assert.equal(JSON.parse(await fs.readFile(path, 'utf8')).auto, true); assert.match(notices.join(' '), /major/);
});
test('auto enable refuses a real nonwritable package directory without elevation', { skip: process.platform === 'win32' }, async t => {
  const { spawnSync } = await import('node:child_process'); const f = fixture(t);
  const modules = join(f.dir, 'global/node_modules'); const root = join(modules, '@smoothsdlc/smooth-backlog-cli');
  await fs.chmod(f.dir, 0o755); await fs.mkdir(root, { recursive: true });
  await fs.chmod(join(modules, '@smoothsdlc'), 0o555);
  const cfg = join(f.dir, 'usercfg'); await fs.mkdir(cfg, { mode: 0o777 }); await fs.chmod(cfg, 0o777);
  const script = `import { updater } from ${JSON.stringify(new URL('../../src/updates.js', import.meta.url).href)};
    const u = updater({ packageRoot: process.argv[1], configPath: process.argv[3], runner: async () => process.argv[2], notice: () => {} });
    try { await u.command('auto'); console.log(JSON.stringify({unexpected:true})); } catch(e) { console.log(JSON.stringify({code:e.code,message:e.message})); }`;
  const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
  try {
    const p = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, modules, join(cfg, 'config.json')], { encoding: 'utf8', ...identity });
    assert.equal(p.status, 0, p.stderr); const result = JSON.parse(p.stdout); assert.equal(result.code, 'UPDATE_PERMISSION'); assert.match(result.message, /will not elevate/);
  } finally { await fs.chmod(join(modules, '@smoothsdlc'), 0o755); }
});
test('a custom --prefix installation is manageable even when npm default prefix differs', async t => {
  const { updater } = await load(); const f = fixture(t); const prefix = join(f.dir, 'custom');
  const modules = process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib/node_modules');
  const root = join(modules, '@smoothsdlc/smooth-backlog-cli'); await runtimePackage(root, '1.0.0');
  const binDir = process.platform === 'win32' ? prefix : join(prefix, 'bin'); await fs.mkdir(binDir, { recursive: true });
  if (process.platform === 'win32') await fs.writeFile(join(binDir, 'backlog.cmd'), '@node "%~dp0\\node_modules\\@smoothsdlc\\smooth-backlog-cli\\bin\\backlog.js" %*');
  else await fs.symlink(join(root, 'bin/backlog.js'), join(binDir, 'backlog'));
  const path = join(f.dir, 'user.json');
  const runner = async args => args[0] === 'root' ? join(f.dir, 'different-default/node_modules') : 'undefined';
  const u = updater({ packageRoot: root, configPath: path, runner, notice: () => {} });
  await assert.rejects(u.command('auto'), e => e.code === 'REGISTRY_SETUP');
  assert.equal(JSON.parse(await fs.readFile(path, 'utf8')).auto, true);
});
test('a stale auto updater cannot downgrade a package another process upgraded to a major release', async t => {
  const { updater } = await load(); const f = fixture(t); const modules = join(f.dir, 'global/node_modules'), root = join(modules, '@smoothsdlc/smooth-backlog-cli');
  await runtimePackage(root, '1.0.0');
  const runner = async args => {
    if (args[0] === 'root') return args.includes('--prefix') ? join(args[args.indexOf('--prefix') + 1], 'node_modules') : modules;
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.1.0","2.0.0"]';
    if (args[0] === 'install') { const version = args.at(-1).split('@').at(-1); await runtimePackage(join(args[args.indexOf('--prefix') + 1], 'node_modules/@smoothsdlc/smooth-backlog-cli'), version); return ''; }
    throw new Error('Unexpected npm command');
  };
  const first = updater({ packageRoot: root, version: '1.0.0', configPath: join(f.dir, 'first.json'), runner, notice: () => {} });
  const stale = updater({ packageRoot: root, version: '1.0.0', configPath: join(f.dir, 'second.json'), runner, notice: () => {} });
  await first.command(); await stale.command('auto');
  const { spawnSync } = await import('node:child_process');
  assert.equal(spawnSync(process.execPath, [join(root, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), '2.0.0');
});
test('unsupported schema/runtime releases fail before activation and staging enforces npm engines', async t => {
  const { updater } = await load(); const f = fixture(t); const modules = join(f.dir, 'global/node_modules'), root = join(modules, '@smoothsdlc/smooth-backlog-cli'); await runtimePackage(root, '1.0.0');
  const runner = async args => {
    if (args[0] === 'root') return args.includes('--prefix') ? join(args[args.indexOf('--prefix') + 1], 'node_modules') : modules;
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.1.0"]';
    if (args[0] === 'install') { assert.ok(args.includes('--engine-strict')); await runtimePackage(join(args[args.indexOf('--prefix') + 1], 'node_modules/@smoothsdlc/smooth-backlog-cli'), '1.1.0', { backlogSchemaVersion: 2 }); return ''; }
  };
  const u = updater({ packageRoot: root, version: '1.0.0', configPath: join(f.dir, 'user.json'), runner, notice: () => {} });
  await assert.rejects(u.command('auto'), /schema|migration/i);
  const { spawnSync } = await import('node:child_process'); assert.equal(spawnSync(process.execPath, [join(root, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), '1.0.0');
});
test('termination at the activation boundary always leaves a callable stable executable', { skip: process.platform === 'win32' }, async t => {
  const { spawnSync } = await import('node:child_process'); const f = fixture(t); const root = join(f.dir, 'installed'), staged = join(f.dir, 'staged');
  await runtimePackage(root, '1.0.0'); await runtimePackage(staged, '1.1.0');
  const script = `import { promises as fs } from 'node:fs'; import { join } from 'node:path';
    import { replacePackage } from ${JSON.stringify(new URL('../../src/updates.js', import.meta.url).href)};
    const root = process.argv[1], staged = process.argv[2], rename = fs.rename;
    fs.rename = async (from, to) => { await rename(from,to); if (from === root || to === join(root,'.backlog-runtime.json')) process.kill(process.pid,'SIGKILL'); };
    await replacePackage(root,staged,async()=>{});`;
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, staged], { encoding: 'utf8' }); assert.equal(p.signal, 'SIGKILL');
  const version = spawnSync(process.execPath, [join(root, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }); assert.equal(version.status, 0, version.stderr); assert.equal(version.stdout.trim(), '1.1.0');
});
test('an incompatible Node floor is rejected even if a controlled staging runner ignores npm engine enforcement', async t => {
  const { updater } = await load(); const f = fixture(t); const modules = join(f.dir, 'global/node_modules'), root = join(modules, '@smoothsdlc/smooth-backlog-cli'); await runtimePackage(root, '1.0.0');
  const runner = async args => {
    if (args[0] === 'root') return args.includes('--prefix') ? join(args[args.indexOf('--prefix') + 1], 'node_modules') : modules;
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.1.0"]';
    if (args[0] === 'install') { await runtimePackage(join(args[args.indexOf('--prefix') + 1], 'node_modules/@smoothsdlc/smooth-backlog-cli'), '1.1.0', { engines: { node: '>=999' } }); return ''; }
  };
  await assert.rejects(updater({ packageRoot: root, version: '1.0.0', configPath: join(f.dir, 'user.json'), runner, notice: () => {} }).command('auto'), /Node.js runtime/);
  const { spawnSync } = await import('node:child_process'); assert.equal(spawnSync(process.execPath, [join(root, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), '1.0.0');
});
test('a complete CLI upgrade runs the new runtime and refreshes repository integrations', async t => {
  const { updater } = await load(); const { spawnSync } = await import('node:child_process'); const f = fixture(t); f.cli('init'); const item = f.create('Survives upgrade');
  const modules = join(f.dir, 'global/node_modules'), root = join(modules, '@smoothsdlc/smooth-backlog-cli');
  const source = new URL('../../', import.meta.url); const baseMetadata = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const copy = async (target, version) => {
    await fs.mkdir(target, { recursive: true });
    for (const dir of ['src', 'bin', 'templates']) await fs.cp(new URL(`${dir}/`, source), join(target, dir), { recursive: true });
    await fs.writeFile(join(target, 'package.json'), JSON.stringify({ ...baseMetadata, version }));
  };
  await copy(root, '1.0.0');
  const runner = async args => {
    if (args[0] === 'root') return args.includes('--prefix') ? join(args[args.indexOf('--prefix') + 1], 'node_modules') : modules;
    if (args[0] === 'config') return 'https://npm.pkg.github.com';
    if (args[0] === 'view') return '["1.0.0","1.0.1"]';
    if (args[0] === 'install') { await copy(join(args[args.indexOf('--prefix') + 1], 'node_modules/@smoothsdlc/smooth-backlog-cli'), '1.0.1'); return ''; }
  };
  const u = updater({ packageRoot: root, configPath: join(f.dir, 'auto.json'), context: { root: f.root }, runner, version: '1.0.0', notice: () => {} });
  assert.equal((await u.command('auto')).installed, '1.0.1'); assert.equal(f.json('config.json').generated_version, '1.0.1');
  const p = spawnSync(process.execPath, [join(root, 'bin/backlog.js'), 'list', '--json'], { cwd: f.root, env: f.env, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr || p.stdout); assert.equal(JSON.parse(p.stdout).data[0].id, item.id);
  const version = spawnSync(process.execPath, [join(root, 'bin/backlog.js'), '--version'], { encoding: 'utf8' }); assert.equal(version.stdout.trim(), '1.0.1');
});
test('custom-prefix recognition compares physical paths across macOS-style parent directory aliases', { skip: process.platform === 'win32' }, async t => {
  const { updater } = await load(); const f = fixture(t); const prefix = join(f.dir, 'physical-prefix');
  const realRoot = join(prefix, 'lib/node_modules/@smoothsdlc/smooth-backlog-cli'); await runtimePackage(realRoot, '1.0.0');
  await fs.mkdir(join(prefix, 'bin')); await fs.symlink(join(realRoot, 'bin/backlog.js'), join(prefix, 'bin/backlog'));
  const alias = join(f.dir, 'prefix-alias'); await fs.symlink(prefix, alias, 'dir');
  const root = join(alias, 'lib/node_modules/@smoothsdlc/smooth-backlog-cli');
  const runner = async args => args[0] === 'root' ? join(f.dir, 'other/node_modules') : 'undefined';
  await assert.rejects(updater({ packageRoot: root, configPath: join(f.dir, 'user.json'), runner, notice: () => {} }).command('auto'), e => e.code === 'REGISTRY_SETUP');
});
test('registry setup guidance uses the GitHub Packages legacy login flow required by npm 9+', async t => {
  const { updater } = await load(); const f = fixture(t);
  const u = updater({ configPath: join(f.dir, 'user.json'), runner: async () => 'undefined', notice: () => {} });
  await assert.rejects(u.command('check'), /npm login --scope=@smoothsdlc --auth-type=legacy --registry=https:\/\/npm.pkg.github.com/);
});
