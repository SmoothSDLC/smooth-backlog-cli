// The inputs of a team command: which team it acts for, who calls it, the session, the repository and the branch it acts on.
// Each input is read from the flag, then the environment variable, then (the team only) the configuration passed in as data.
// An empty value counts as not given. Nothing here reads a file, the configuration or git.
import { Refusal } from './rules/expression.js';

const V = name => `SMOOTH_BACKLOG_CLI_${name}`;
// The flag names every team command reserves; a step argument may not use one of them.
export const FLAG_NAMES = ['team', 'agent', 'session', 'repository', 'branch', 'json', 'dry-run', 'help', 'version', 'show-all', 'ask'];
// The forms that may act over every team; new, update, pop and the one-team query forms act for one team.
export const SHOW_ALL = ['query', 'query <item>', 'query rules', 'validate', 'migrate'];
const ONE_TEAM_QUERY = ['plan', 'check', 'filter', 'steps'];

// The form of a command from its words, with or without the leading `team`: `query`, `query <item>`, `query rules`, `query plan`, ...
export function formOf(argv) {
  const [first, ...rest] = argv[0] === 'team' ? argv.slice(1) : argv;
  if (first !== 'query') return first;
  const word = rest[0];
  if (!word || word.startsWith('-')) return 'query';
  return ['rules', ...ONE_TEAM_QUERY].includes(word) ? `query ${word}` : 'query <item>';
}

const given = (...values) => values.map(v => (typeof v === 'string' ? v.trim() : v)).find(v => v) || '';

export function resolveInputs({ command, flags = {}, env = {}, config = {} }) {
  const agent = given(flags.agent, env[V('AGENT')]);
  const session = given(flags.session, env[V('SESSION')]);
  const repository = given(flags.repository, env[V('TEAM_REPOSITORY')]);
  const branch = given(flags.branch, env[V('TEAM_BRANCH')]);
  const team = given(flags.team, env[V('TEAM_NAME')], config.team);
  const base = { agent, session, repository, branch };

  if (flags['show-all'] && !given(flags.team)) { // given together, --team decides and --show-all is ignored
    if (!SHOW_ALL.includes(command)) throw new Refusal(`--show-all acts over every team; backlog team ${command} acts for one team: give --team <name> instead`, 2);
    checkRepository(repository);
    return { team: null, all: true, ...base };
  }
  if (!team) throw new Refusal(`a team command needs a team: give --team <name>, or set the ${V('TEAM_NAME')} variable, or set the "team" key in .backlog/config.json`, 2);
  if (!agent && ['new', 'update', 'pop'].includes(command)) throw new Refusal(`this team command needs the agent: give --agent <name>, or set the ${V('AGENT')} variable`, 2);
  checkRepository(repository);
  return { team, all: false, ...base };
}

// The repository, when given, is the one the command acts on and must read owner/name.
function checkRepository(repository) {
  if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Refusal(`${V('TEAM_REPOSITORY')}='${repository}': expected owner/name`, 2);
}
