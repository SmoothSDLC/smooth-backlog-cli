import { promises as fs, constants, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { locked, atomicWrite, exists, safePath } from './storage.js';
import { BacklogError, input, operation } from './errors.js';
import { redact } from './shared/safety.js';
const exec = promisify(execFile);
// The CLI's self-update (backlog upgrade): checks the package registry and replaces the installed package atomically.
// npm, with a registry answer that never echoes its own output (authentication errors can carry credential-bearing URLs).
async function runNpm(args, options = {}) {
  let command = 'npm', commandArgs = args;
  if (process.platform === 'win32') {
    let candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')].filter(Boolean);
    if (!candidates.some(x => x.endsWith('npm-cli.js') && existsSync(x))) {
      const result = await exec('where.exe', ['npm'], { windowsHide: true });
      candidates = candidates.concat(result.stdout.trim().split(/\r?\n/).map(path => join(dirname(path), 'node_modules/npm/bin/npm-cli.js')));
    }
    const script = candidates.find(x => x.endsWith('npm-cli.js') && existsSync(x));
    if (!script) throw new BacklogError('NPM_REQUIRED', 'Cannot locate npm-cli.js. Install Node.js with npm and retry.', 1);
    command = process.execPath; commandArgs = [script, ...args];
  }
  try {
    const result = await exec(command, commandArgs, { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...options, env: { ...process.env, npm_config_update_notifier: 'false', npm_config_loglevel: 'error' } });
    return result.stdout.trim();
  } catch (e) {
    throw new BacklogError('NPM_FAILED', `npm ${args[0]} failed (${e.code || e.signal || 'unknown error'}). Check network access, registry authentication and filesystem permissions. GitHub Packages requires read:packages access.`, 1);
  }
}
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const registry = 'https://npm.pkg.github.com';
const hour = 3600000;
const defaultConfig = { schema_version: 1, weekly: true, auto: false };
export function configLocation() {
  const base = process.platform === 'win32' ? process.env.APPDATA || join(homedir(), 'AppData/Roaming') : process.env.XDG_CONFIG_HOME || (process.platform === 'darwin' ? join(homedir(), 'Library/Application Support') : join(homedir(), '.config'));
  return join(base, 'smooth-backlog-cli/config.json');
}
export function due(config, now = Date.now()) {
  if (!config.auto && !config.weekly) return false;
  const last = Date.parse(config.last_check_at);
  if (!Number.isFinite(last)) return true;
  const interval = config.last_check_status === 'failed' ? hour : config.auto ? 24 * hour : 7 * 24 * hour;
  return now - last >= interval;
}
function versionParts(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(Number) : null; }
function compare(a, b) { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }
export function releases(versions, current) {
  input(versionParts(current), `Installed version ${current} is not a stable semantic version. Use an explicit npm update command.`);
  const stable = (Array.isArray(versions) ? versions : [versions]).filter(x => versionParts(x)).sort(compare);
  const latest = stable.at(-1) ?? current;
  const compatible = stable.filter(x => versionParts(x)[0] === versionParts(current)[0] && compare(x, current) > 0).at(-1) ?? null;
  return { latest, compatible, major: versionParts(latest)[0] > versionParts(current)[0] };
}
async function activeDirectory(root) {
  const path = join(root, '.backlog-runtime.json'); await safePath(root, path);
  if (!await exists(path)) return root;
  const pointer = JSON.parse(await fs.readFile(path, 'utf8'));
  operation(pointer.schema_version === 1 && typeof pointer.runtime === 'string' && /^\.backlog-runtimes\/[0-9a-f-]{36}$/.test(pointer.runtime), 'Invalid installed runtime pointer; reinstall the package using npm.');
  const directory = join(root, pointer.runtime); await safePath(root, directory); return directory;
}
export async function replacePackage(target, staged, validate) {
  // Keep the npm bin and baseline runtime callable throughout copying, validation and activation.
  const relative = `.backlog-runtimes/${randomUUID()}`, runtime = join(target, relative);
  const pointerPath = join(target, '.backlog-runtime.json'); await safePath(target, runtime); await safePath(target, pointerPath);
  const previous = await exists(pointerPath) ? await fs.readFile(pointerPath, 'utf8') : null;
  let activated = false;
  try {
    await fs.mkdir(dirname(runtime), { recursive: true }); await fs.cp(staged, runtime, { recursive: true });
    await validate(runtime);
    await atomicWrite(pointerPath, JSON.stringify({ schema_version: 1, runtime: relative }) + '\n'); activated = true;
    await validate(target, runtime);
  } catch (error) {
    if (activated) {
      if (previous === null) await fs.rm(pointerPath, { force: true });
      else await atomicWrite(pointerPath, previous);
    }
    await fs.rm(runtime, { recursive: true, force: true }); throw error;
  }
  // Package-manager metadata follows activation; the active pointer is authoritative after interruption.
  await atomicWrite(join(target, 'package.json'), await fs.readFile(join(runtime, 'package.json'), 'utf8'));
  return runtime;
}
export function updater(options = {}) {
  const path = options.configPath || configLocation(), runner = options.runner || runNpm;
  const now = options.now || Date.now, version = options.version || pkg.version;
  const notice = options.notice || (message => process.stderr.write(`backlog: ${message}\n`));
  const root = resolve(options.packageRoot || packageRoot);
  const guidance = `Configure GitHub Packages with: npm config set @smoothsdlc:registry ${registry}. Authenticate securely with npm login --scope=@smoothsdlc --auth-type=legacy --registry=${registry} (read:packages); never place tokens in backlog files.`;
  const manual = `npm install --global ${pkg.name}@latest --registry=${registry}`;
  async function load() {
    if (!await exists(path)) return { ...defaultConfig };
    await safePath(dirname(path), path);
    let config; try { config = JSON.parse(await fs.readFile(path, 'utf8')); } catch { throw new BacklogError('USER_CONFIG', `Invalid user config ${path}; fix its JSON before updating.`, 1); }
    operation(config.schema_version === 1 && ['weekly', 'auto'].every(x => config[x] === undefined || typeof config[x] === 'boolean'), `Unsupported or invalid user configuration: ${path}.`);
    return { ...defaultConfig, ...config };
  }
  async function save(config) { await safePath(dirname(path), path); await atomicWrite(path, JSON.stringify(config, null, 2) + '\n'); }
  async function installation() {
    const globalRoot = resolve((await runner(['root', '--global'])).trim());
    const expected = join(globalRoot, ...pkg.name.split('/'));
    let recognized = root === expected;
    // A one-off npm --prefix need not match npm's configured global prefix.
    if (!recognized && basename(root) === 'smooth-backlog-cli' && basename(dirname(root)) === '@smoothsdlc') {
      const modules = dirname(dirname(root));
      if (basename(modules) === 'node_modules') {
        const prefix = process.platform === 'win32' ? dirname(modules) : basename(dirname(modules)) === 'lib' ? dirname(dirname(modules)) : null;
        if (prefix) {
          try {
            if (process.platform === 'win32') recognized = (await fs.readFile(join(prefix, 'backlog.cmd'), 'utf8')).replaceAll('\\', '/').includes('node_modules/@smoothsdlc/smooth-backlog-cli/bin/backlog.js');
            else recognized = await fs.realpath(join(prefix, 'bin/backlog')) === await fs.realpath(join(root, 'bin/backlog.js'));
          } catch { recognized = false; }
        }
      }
    }
    if (!recognized) throw new BacklogError('UNMANAGED_INSTALL', `Automatic replacement supports npm global and user-prefix installs. For a repository dependency, use npm install ${pkg.name}@latest in that repository to update its lockfile. For a global/user-prefix install, run: ${manual}`, 1);
    for (const target of [dirname(root), root]) {
      try { await fs.access(target, constants.W_OK); operation(!(await fs.lstat(target)).isSymbolicLink(), 'Linked package installations need a manual update.'); }
      catch { throw new BacklogError('UPDATE_PERMISSION', `Auto-update cannot write ${target} without additional permissions. It will not elevate privileges. Update manually using: ${manual}`, 1); }
    }
    return { root, scope: globalRoot.startsWith(homedir()) || root !== expected ? 'user-prefix' : 'global' };
  }
  async function install(target, location) {
    return locked(`${location.root}.update.lock`, async () => {
      const currentRoot = await activeDirectory(location.root);
      const current = JSON.parse(await fs.readFile(join(currentRoot, 'package.json'), 'utf8'));
      operation(current.name === pkg.name && versionParts(current.version), 'Installed package metadata is incompatible; update through npm.');
      if (compare(current.version, target) >= 0) return { installed: current.version, scope: location.scope };
      const stage = await fs.mkdtemp(join(tmpdir(), 'smooth-backlog-update-'));
      try {
        await runner(['install', '--global', '--prefix', stage, '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--registry', registry, `${pkg.name}@${target}`], { timeout: 120000 });
        const modules = (await runner(['root', '--global', '--prefix', stage])).trim();
        const source = join(modules, ...pkg.name.split('/'));
        const validate = async (directory, selectedRuntime = directory) => {
          const metadata = JSON.parse(await fs.readFile(join(selectedRuntime, 'package.json'), 'utf8'));
          operation(metadata.name === pkg.name && metadata.version === target && (metadata.bin?.backlog === 'bin/backlog.js' || metadata.bin === 'bin/backlog.js'), 'Update package identity, version or executable path is incompatible.');
          operation(metadata.backlogSchemaVersion === pkg.backlogSchemaVersion && metadata.backlogRuntimeVersion === 1, 'Update requires an unsupported backlog schema migration or bootstrap protocol. Read the release migration instructions and update manually using npm.');
          const floor = /^>=(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(metadata.engines?.node || '');
          operation(floor && compare(process.versions.node, `${floor[1]}.${floor[2] || 0}.${floor[3] || 0}`) >= 0, 'Update requires an unsupported Node.js runtime. Install a compatible Node version and update manually through npm.');
          const result = await exec(process.execPath, [join(directory, 'bin/backlog.js'), '--version'], { timeout: 10000, windowsHide: true });
          operation(result.stdout.trim() === target, 'Staged package failed its executable version check.');
        };
        await replacePackage(location.root, source, validate);
        return { installed: target, scope: location.scope };
      } finally { await fs.rm(stage, { recursive: true, force: true }); }
    });
  }
  async function check(config, auto, location) {
    config.last_check_at = new Date(now()).toISOString(); config.installed_version = version;
    try {
      const configured = (await runner(['config', 'get', '@smoothsdlc:registry'])).trim().replace(/\/$/, '');
      if (configured !== registry) throw new BacklogError('REGISTRY_SETUP', guidance, 1);
      let versions; try { versions = JSON.parse(await runner(['view', pkg.name, 'versions', '--json', '--registry', registry])); } catch (e) { throw e instanceof BacklogError ? e : new BacklogError('REGISTRY_RESPONSE', `Registry returned an invalid version list. ${guidance}`, 1); }
      input(Array.isArray(versions) || typeof versions === 'string', 'Registry must return a version or version array.');
      const result = releases(versions, version); config.available_version = result.latest;
      let installed = null;
      if (auto && result.compatible) { installed = await install(result.compatible, location || await installation()); config.installed_version = installed.installed; }
      if (result.major) notice(`A new major release ${result.latest} is available. Auto-update covers patch/minor releases only; run backlog upgrade to install the latest stable.`);
      else if (compare(result.latest, version) > 0 && !installed) notice(`Version ${result.latest} is available; run backlog upgrade.`);
      config.last_check_status = 'ok'; config.last_success_at = config.last_check_at; await save(config);
      return { ...result, ...(installed || {}) };
    } catch (e) { config.last_check_status = 'failed'; config.available_version ??= null; await save(config); throw e; }
  }
  async function withConfig(callback) {
    await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 }); await safePath(dirname(path), `${path}.lock`);
    return locked(`${path}.lock`, async () => callback(await load()));
  }
  return {
    async scheduled() {
      try {
        return await withConfig(async config => {
          if (!due(config, now())) return null;
          return check(config, config.auto);
        });
      } catch (e) { notice(`Automatic update check failed: ${e.message}. Backlog work can continue; retry is eligible in one hour.`); return null; }
    },
    async command(mode) {
      input(mode === undefined || ['check', 'auto', 'off', 'disable'].includes(mode) || versionParts(mode), 'Use upgrade, upgrade check, upgrade auto, upgrade off, upgrade disable, or upgrade <version> (for example 1.2.3).');
      return withConfig(async config => {
        if (mode === 'disable' || mode === 'off') { config[mode === 'disable' ? 'weekly' : 'auto'] = false; await save(config); return { weekly: config.weekly, auto: config.auto, config: path }; }
        if (mode === 'auto') { const location = await installation(); config.auto = true; await save(config); return check(config, true, location); }
        if (mode === 'check') { config.weekly = true; await save(config); return check(config, false); }
        const location = await installation();
        if (mode !== undefined) { // an exact version: npm refuses one the registry does not have; never a downgrade
          const installed = await install(mode, location); config.installed_version = installed.installed; await save(config);
          return { ...installed, ...(installed.installed === mode ? {} : { message: `Installed version ${installed.installed} is not older than ${mode}; no downgrade performed.` }) };
        }
        const result = await check(config, false);
        if (compare(result.latest, version) <= 0) return { ...result, installed: version, message: 'Already at the latest stable version; no downgrade performed.' };
        const installed = await install(result.latest, location); config.installed_version = installed.installed; await save(config); return { ...result, ...installed };
      });
    },
  };
}

// The update notice (decision AI). A command a person runs at a terminal starts the scheduled check of the user's configuration beside it
// (about weekly, about daily with automatic updates, an hour after a failed check; nothing when `backlog upgrade disable` turned it off), and once
// the command is done waits for it at most `limit` milliseconds more. Its warning is written to standard error then; it never changes the output or the
// exit code of the command, and a check that fails or runs out of time is a warning at most. The commands in QUIET and every non-terminal run start nothing.
// Returns the function to await when the command is done.
const QUIET = ['--version', 'version', '--help', 'help', '-h', 'upgrade', 'setup'];
export function startNotice(argv, { terminal = process.stderr.isTTY, make = updater, limit = 1500, write = text => process.stderr.write(text) } = {}) {
  if (!terminal || !argv.length || QUIET.includes(argv[0]) || argv.includes('--help')) return async () => {};
  const messages = []; const abort = new AbortController();
  const check = Promise.resolve().then(() => make({ notice: message => messages.push(message), runner: (args, options) => runNpm(args, { ...options, signal: abort.signal }) }).scheduled()).catch(() => {});
  const upTo = async (promise, ms) => { let timer; try { await Promise.race([promise, new Promise(done => { timer = setTimeout(done, ms); })]); } finally { clearTimeout(timer); } };
  return async () => {
    await upTo(check, limit);
    abort.abort(); await upTo(check, 200); // a check still running is stopped; it records itself as failed (tried again in an hour) and says so
    try { for (const message of messages) write(`backlog: ${redact(message)}\n`); } catch { /* a closed standard error is no failure of the command */ }
  };
}

const say = text => process.stdout.write(`${redact(text)}\n`);
// backlog upgrade [check|auto|off|disable|<version>]
export async function run(args) {
  const json = args.includes('--json'); const [mode, extra] = args.filter(x => x !== '--json');
  input(extra === undefined, 'upgrade takes one word: check, auto, off, disable or a version');
  const result = await updater().command(mode);
  if (json) { say(JSON.stringify(result)); return 0; }
  if (result.config) say(`weekly check: ${result.weekly ? 'on' : 'off'}; automatic update: ${result.auto ? 'on' : 'off'}`);
  if (result.latest) say(`installed ${pkg.version}; latest stable ${result.latest}`);
  if (result.installed && result.installed !== pkg.version) say(`✅ now at ${result.installed}; the next command runs it`);
  if (result.message) say(result.message);
  return 0;
}
