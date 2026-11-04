// The world of one scenario: a temporary consuming repository (with a bare origin) and the backlog's storage location.
// location 'remote': the item files live in a clone of a backlog repository (BACKLOG_HOME, a bare origin in the temp dir).
// location 'local': the item files live inside the consuming repository itself. Nothing touches the user's real backlog.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: config, HOME: join(tmp, 'userhome'), BACKLOG_ORIGIN_URL: ORIGIN_URL };
  mkdirSync(env.HOME, { recursive: true });
  if (location === 'remote') {
    env.BACKLOG_HOME = sharedBacklog(tmp);
    mkdirSync(join(config, 'smooth-backlog-cli'), { recursive: true });
    writeFileSync(join(config, 'smooth-backlog-cli', 'mode.json'), '{"mode":"shared"}'); // the setting the branch under review still reads
  }
  const world = {
    location, tmp, repo, env, agentEnv: {}, agent: 0, last: null,
    // every command runs from inside the consuming repository, as a user or agent would
    run(args, extra = {}) {
      const agent = this.agentEnv.QWEN_CODE_AGENT_ID ? {} : { QWEN_CODE_AGENT_ID: `person-${++this.agent}` };
      this.last = { args, ...runCli(args, { cwd: this.repo, env: { ...env, ...agent, ...this.agentEnv, ...extra.env } }) };
      return this.last;
    },
    git(...a) { const p = spawnSync('git', a, { cwd: this.repo, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); },
    dispose() { rmSync(tmp, { recursive: true, force: true }); },
    hasItemFolder() { return existsSync(join(this.repo, '.backlog')) || (env.BACKLOG_HOME && existsSync(join(env.BACKLOG_HOME, 'acme', 'demo'))); },
  };
  return world;
}
