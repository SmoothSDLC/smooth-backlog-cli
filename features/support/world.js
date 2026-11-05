// The world of one scenario: a temporary consuming repository (with a bare origin) and the backlog's storage location.
// location 'remote': the item files live in a clone of a backlog repository (BACKLOG_HOME, a bare origin in the temp dir).
// location 'local': the item files live inside the consuming repository itself. Nothing touches the user's real backlog.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GIT_IDENTITY, ORIGIN_URL, cli as runCli, consumer, sharedBacklog } from '../../.agents/test/shared-fixtures.js';

export const LOCATIONS = ['remote', 'local'];

export function makeWorld(location) {
  const tmp = mkdtempSync(join(tmpdir(), `backlog-feature-${location}-`));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  const config = join(tmp, 'config');
  mkdirSync(config, { recursive: true });
  // the storage setting: a backlog repository named (remote), or nothing named at all (local: the shell's own setting is cleared)
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: config, HOME: join(tmp, 'userhome'), BACKLOG_ORIGIN_URL: '', BACKLOG_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  if (location === 'remote') { env.BACKLOG_ORIGIN_URL = ORIGIN_URL; env.BACKLOG_HOME = sharedBacklog(tmp); }
  // local: nothing configured — the CLI's default, .backlog inside the repository with its config, created on first use
  const world = {
    location, tmp, repo, env, agentEnv: {}, agent: 0, last: null,
    // every command runs from inside the consuming repository, as a user or agent would
    run(args, extra = {}) {
      const agent = this.agentEnv.BACKLOG_AGENT ? {} : { BACKLOG_AGENT: `person-${++this.agent}` };
      this.last = { args, ...runCli(args, { cwd: this.repo, env: { ...env, ...agent, ...this.agentEnv, ...extra.env } }) };
      return this.last;
    },
    backlogRepo() { return env.BACKLOG_HOME || this.repo; },
    gitIn(cwd, ...a) { const p = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); },
    git(...a) { const p = spawnSync('git', a, { cwd: this.repo, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); },
    dispose() { rmSync(tmp, { recursive: true, force: true }); },
    // the backlog folder: the clone, or .backlog inside the repository
    home() { return env.BACKLOG_HOME || join(this.repo, '.backlog'); },
    // the team configuration <home>/teams.json, merged key by key
    configureTeam(name, fields) {
      const file = join(this.home(), 'teams.json');
      mkdirSync(this.home(), { recursive: true });
      let cfg = {}; try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
      cfg[name] = { ...(cfg[name] ?? {}), ...fields };
      writeFileSync(file, JSON.stringify(cfg, null, 2));
    },
    hasItemFolder() { return existsSync(join(this.repo, '.backlog')) || (env.BACKLOG_HOME && existsSync(join(env.BACKLOG_HOME, 'acme', 'demo'))); },
  };
  return world;
}
