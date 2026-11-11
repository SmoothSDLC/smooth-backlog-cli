// The world of one scenario: a temporary consuming repository (with a bare origin) and the backlog's storage location.
// location 'remote': the item files live in a clone of a backlog repository (SMOOTH_BACKLOG_CLI_HOME, a bare origin in the temp dir).
// location 'local': the item files live inside the consuming repository itself. Nothing touches the user's real backlog.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { putItem } from '../../.agents/test/team-fixture.js';
import { GIT_IDENTITY, ORIGIN_URL, cli, consumer, sharedBacklog } from '../../.agents/test/shared-fixtures.js';

const runCli = cli;

export const LOCATIONS = ['remote', 'local'];

export function makeWorld(location) {
  const tmp = mkdtempSync(join(tmpdir(), `backlog-feature-${location}-`));
  const repo = consumer(tmp, 'acme', 'demo', 'main');
  const config = join(tmp, 'config');
  mkdirSync(config, { recursive: true });
  // the storage setting: a backlog repository named (remote), or nothing named at all (local: the shell's own setting is cleared)
  const env = { ...GIT_IDENTITY, XDG_CONFIG_HOME: config, HOME: join(tmp, 'userhome'), SMOOTH_BACKLOG_CLI_ORIGIN_URL: '', SMOOTH_BACKLOG_CLI_HOME: '' };
  mkdirSync(env.HOME, { recursive: true });
  if (location === 'remote') { env.SMOOTH_BACKLOG_CLI_ORIGIN_URL = ORIGIN_URL; env.SMOOTH_BACKLOG_CLI_HOME = sharedBacklog(tmp); }
  // local: nothing configured — the CLI's default, .backlog inside the repository with its config, created on first use
  const world = {
    location, tmp, repo, env, agentEnv: {}, agent: 0, last: null,
    // every command runs from inside the consuming repository, as a user or agent would
    run(args, extra = {}) {
      const agent = this.agentEnv.SMOOTH_BACKLOG_CLI_AGENT ? {} : { SMOOTH_BACKLOG_CLI_AGENT: `person-${++this.agent}` };
      this.last = { args, ...runCli(args, { cwd: this.repo, env: { ...env, ...agent, ...this.agentEnv, ...extra.env }, input: extra.input }) };
      return this.last;
    },
    backlogRepo() { return env.SMOOTH_BACKLOG_CLI_HOME || this.repo; },
    gitIn(cwd, ...a) { const p = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); },
    git(...a) { const p = spawnSync('git', a, { cwd: this.repo, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }); if (p.status !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr}`); return p.stdout.trim(); },
    dispose() { rmSync(tmp, { recursive: true, force: true }); },
    // the backlog folder: the clone, or .backlog inside the repository
    home() { return env.SMOOTH_BACKLOG_CLI_HOME || join(this.repo, '.backlog'); },
    // the team file of the repository: .backlog/teams.json of the consuming repository, in both locations
    writeTeamFile(teams) {
      mkdirSync(join(this.repo, '.backlog'), { recursive: true });
      writeFileSync(join(this.repo, '.backlog', 'teams.json'), JSON.stringify(teams));
    },
    // an item of a team, written as the team commands store it into the folder of the items, then committed and pushed there
    seedTeamItem(entry, team, { name, fields }) {
      const folder = this.folder();
      // the next number: above every item file, live or archived
      const seq = Math.max(0, ...['phases', join('archive', 'phases'), 'archive'].flatMap(d => (existsSync(join(folder, d)) ? readdirSync(join(folder, d)) : [])).map(n => parseInt(n, 10) || 0)) + 1;
      const defaults = Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, 'default' in d ? d.default : null]));
      const slug = `${String(seq).padStart(3, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      putItem(folder, { seq, slug, name, team, repository: env.SMOOTH_BACKLOG_CLI_HOME ? 'acme/demo' : 'local/repository', branch: 'main', fields: { ...defaults, ...fields } }, entry);
      const top = this.backlogRepo();
      this.gitIn(top, 'add', '-A'); this.gitIn(top, 'commit', '-q', '-m', 'seed'); this.gitIn(top, 'push', '-q', 'origin', 'HEAD');
    },
    // a second checkout of the same backlog: another clone of the backlog repository (remote) or of the consuming repository (local)
    other() {
      if (!this.otherDir) {
        const source = env.SMOOTH_BACKLOG_CLI_HOME ? env.SMOOTH_BACKLOG_CLI_HOME : this.repo;
        this.otherDir = join(tmp, 'other');
        this.gitIn(tmp, 'clone', '-q', this.gitIn(source, 'remote', 'get-url', 'origin'), this.otherDir);
      }
      return this.otherDir;
    },
    runOther(args, extra = {}) {
      const dir = this.other();
      const agent = { SMOOTH_BACKLOG_CLI_AGENT: extra.env?.SMOOTH_BACKLOG_CLI_AGENT ?? 'other' };
      const home = env.SMOOTH_BACKLOG_CLI_HOME ? { SMOOTH_BACKLOG_CLI_HOME: dir } : {};
      return runCli(args, { cwd: env.SMOOTH_BACKLOG_CLI_HOME ? this.repo : dir, env: { ...env, ...home, ...agent, ...extra.env } });
    },
    // the folder of the items of this repository: <backlog>/<owner>/<name>, inside the repository the constant local/repository
    folder() { return env.SMOOTH_BACKLOG_CLI_HOME ? join(env.SMOOTH_BACKLOG_CLI_HOME, 'acme', 'demo') : join(this.repo, '.backlog', 'local', 'repository'); },
    hasItemFolder() { return existsSync(join(this.repo, '.backlog')) || (env.SMOOTH_BACKLOG_CLI_HOME && existsSync(join(env.SMOOTH_BACKLOG_CLI_HOME, 'acme', 'demo'))); },
  };
  return world;
}
