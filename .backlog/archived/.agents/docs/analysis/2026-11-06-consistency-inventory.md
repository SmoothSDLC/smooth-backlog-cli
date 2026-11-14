# Consistency inventory of the branch at ed08c8d (2026-11-06) — deterministic greps, no judgement

Owner rule of 2026-11-06: ONE behaviour for every command; the backlog source comes ONLY from the repository's backlog config; the default scope is ONLY the current branch, any wider scope is an option (flag or interactive question); NO backwards compatibility (upgrade/migrate or fail); every behaviour is explained in `backlog --help`, the README and the supporting docs.

## A. Where the backlog location can come from (src, outside tests)
### environment variables read
      5 process.env.BACKLOG_AGENT
      3 process.env.TEAM_NAME
      2 process.env.XDG_CONFIG_HOME
      2 process.env.HOME
      2 process.env.BACKLOG_SESSION
      2 process.env.BACKLOG_LOCK_WAIT_MS
      2 process.env.BACKLOG_HOME
      1 process.env.USER
      1 process.env.TEAM_REPOSITORY
      1 process.env.TEAM_LEAD
      1 process.env.TEAM_BRANCH
      1 process.env.GIT_CONFIG_COUNT
      1 process.env.BACKLOG_TEST_SELF
      1 process.env.BACKLOG_RUN_LOCK_HELD
      1 process.env.BACKLOG_REVIEW_STALE_SECONDS
      1 process.env.BACKLOG_ORIGIN_URL
      1 process.env.APPDATA
### files read for the location (store.js resolveHome)
16:import { CONFIG, configuredHome, NEUTRAL_NAME, originSetting, topOf } from './setup.js';
23:// The one storage setting: the folder that holds the items. Named by BACKLOG_HOME, by the repository's configuration
31:  const setting = originSetting();
33:  let home = process.env.BACKLOG_HOME;
34:  if (!home) home = configuredHome() ?? undefined; // the repository's .smooth-backlog.json comes before the per-user record
36:    const records = (() => { try { return readdirSync(configDir()).filter(d => existsSync(join(configDir(), d, 'home'))); } catch { return []; } })();
38:    if (chosen) { try { home = readFileSync(join(configDir(), chosen, 'home'), 'utf8').trim(); } catch { /* unreadable record */ } }
40:      return { home: null, remote: true, ask: { code: 4, text: `two backlog records (${records.join(', ')}) and no setting name one of them: run backlog setup in this repository, or set BACKLOG_HOM
48:    if (!existsSync(join(top, CONFIG))) writeFileSync(join(top, CONFIG), `${JSON.stringify({ backlog_repository: '.backlog' }, null, 2)}\n`);
61:  home = resolve(expand(home || join('~/git', name)));

## B. Scope options per command (which commands can reach beyond the current branch)
query: 21:'all' 21:'branches' 22:'by-branch' 22:'branch' 22:'scope' 34:'scope' 170:'branch' 171:'by-branch' 275:'by-branch' 276:'by-branch' 
update: 22:'branch' 242:'branch' 
new: 
move: 21:'to-branch' 81:'branch' 94:'to-branch' 95:'to-branch' 95:'to-branch' 100:'to-branch' 102:'to-branch' 111:'to-branch' 112:'to-branch' 112:'to-branch' 114:'to-branch' 116:'to-branch' 
archive: 
pop: 22:'all' 23:'by-branch' 23:'branch' 23:'scope' 45:'scope' 87:'branch' 260:'branch' 347:'branch' 351:'branch' 353:'by-branch' 
team-pop: 24:'scope' 24:'branch' 25:'all' 31:'all' 
src/shared/aliases.js:6:  { form: 'init clean [name] [--all-branches]', runs: 'a typed yes, then every item of the curre
src/shared/clean.js:1:// `backlog init clean [--all-branches]`: after a typed confirmation, removes every item of the cu
src/shared/clean.js:2:// --all-branches of every branch of the repository, as one published change, then runs setup (con
src/shared/clean.js:24:  const bad = flags.find(x => x !== '--all-branches');
src/shared/clean.js:25:  if (bad) return die(`unrecognized arguments: ${bad} (usage: init clean [--all-branches])`);

## C. Backwards-compatibility paths
### the 1.x command names (aliases): rows
27
### old stored keys read (frontmatter.js STORED/LOADED)
260:// The codec above is generic. An item file carries the owner's words: title, last_updated, last_updated_by, owner and owned_since. An
261:// earlier file carries name, updated, updated_by, claimed_by and claimed_at, read forever. In memory a loaded item keeps the earlier
264:const STORED = { name: 'title', updated: 'last_updated', updated_by: 'last_updated_by', claimed_at: 'owned_since' };
271:    if (k === 'claimed_by') out.owner = v || fm.owner || ''; // the holder; none: the user the item belongs to
272:    else if (k === 'claimed_at') out.owned_since = v || (fm.claimed_by ? fm.updated || fm.created || '1970-01-01T00:00:00Z' : v); // a holder is told apart 
273:    else if (k === 'owner') { if (!('claimed_by' in fm)) out.owner = v; }
277:  if (fm.claimed_by && !('claimed_at' in fm)) out.owned_since = fm.updated || fm.created || '1970-01-01T00:00:00Z'; // the holder is told apart by owned_sin
281:// The front matter as the code reads it, from the stored form (an earlier file passes as it is; its new key, when it has both, wins).
285:    if (k === 'owner' && !('claimed_by' in fm)) { // the holder while owned_since is set, else the user the item belongs to
286:      out.claimed_by = fm.owned_since ? v : '';
### shims and notices
src/shared/update.js:149:  if (moved && !fromTeam) process.stderr.write(`moved: use backlog team update <item> --team <t> --agent <a> --${moved}\n`);
src/help.js:583:(and the other steps) still works and prints "moved: use backlog team update ..." on standard error.
### wording that points at an earlier release
src/shared/archive.js:1
src/shared/query.js:3
src/shared/team.js:2
src/shared/aliases.js:5
src/shared/views.js:2
src/shared/move.js:2
src/shared/new.js:2
src/shared/update.js:3
src/shared/pop.js:2
src/shared/lifecycle.js:7
src/shared/safety.js:1
src/shared/sync.js:1
src/main.js:2
src/help.js:2
### env fallbacks for team scope (TEAM_NAME, TEAM_REPOSITORY, TEAM_BRANCH, TEAM_LEAD)
src/shared/archive.js:38:// A team session (TEAM_REPOSITORY/TEAM_BRANCH) works only on items of its own repository and branch; every command that sele
src/shared/query.js:164:  try { folder = store.folder(home, repo); } catch (e) { return die(e.message); } // TEAM_REPOSITORY=../x passes the owner/nam
src/shared/query.js:170:  const branch = a.branch || teamScope().branch || (await git(['branch', '--show-current'], cwd)).stdout.trim(); // lib_db.git
src/shared/team-cli.js:2:// comes from --team, else TEAM_NAME, else the repository configuration's `team`; the agent from --agent (--by), else BACKLOG
src/shared/team-cli.js:37:  const team = got.team || strip(process.env.TEAM_NAME || '') || strip(String(cfg.team ?? ''));
src/shared/team-cli.js:39:  if (!team) throw new Error('a team command needs --team <name> (or TEAM_NAME, or a team in .backlog/config.json)');
src/shared/team.js:19:// The team lead: TEAM_LEAD, else the lead of the session's team in the backlog configuration (teams.json); no built-in name.
src/shared/team.js:20:export const teamLead = name => strip(name || process.env.TEAM_LEAD || teamsConfig()[teamName()]?.lead || '');
src/shared/team.js:36:// lib_db.team_name / in_team: the caller's team: TEAM_NAME (set by the team runner, an override), else the --team of the runnin
src/shared/team.js:40:export const teamName = () => strip(process.env.TEAM_NAME || '') || sessionTeam;
src/shared/team.js:50:  const repo = strip(process.env.TEAM_REPOSITORY || '');
src/shared/team.js:51:  input(!repo || /^[\w.-]+\/[\w.-]+$/.test(repo), `TEAM_REPOSITORY='${repo}': expected owner/name`);
src/shared/team.js:52:  return { repo, branch: strip(process.env.TEAM_BRANCH || '') };
src/shared/team.js:55:// TEAM_BRANCH, else the caller's branch ('' when detached).
### restored first-release module
211 src/upgrade.js

## D. Scope of each command today (verified in a scratch backlog with two branches, run from branch main)
| command | default scope today | how it reaches beyond the current branch today | against the owner rule |
|---|---|---|---|
| next | current branch | flags --all, --branch <name> | wider scope by flag |
| query / list | current branch | flags --all, --branch, --by-branch, --scope; --phase <item> reads an item of ANY branch (verified) | wider scope by flag; --phase ignores the branch |
| update <item> | ANY branch: `update 1 --note x` from main changed an item that belongs to feature, no refusal (verified) | by item number | default is not the current branch |
| archive <item> | ANY branch (the only refusal seen was about the item's status) | by item number | default is not the current branch |
| move <item> --to-branch | moves an item between branches by definition | its own argument | explicit by nature |
| import --branch <source> | pulls the open items of another branch into the current one | its own argument | explicit by nature |
| archive done | current branch (verified) | none | consistent |
| init clean | current branch (changed in this round) | subcommand all-branches | consistent after this round |
| setup | the current checkout | none; no way to set several branches up | consistent; the all-branches setup the owner named does not exist |
| new | current branch | none | consistent |
| team pop/update/query | bound by --team and the environment variables TEAM_BRANCH, TEAM_REPOSITORY | environment | not verified |

## E. Statements in `backlog --help` that contradict the owner rule
- "Environment variables override the configuration." (help.js) — the owner rule: the source is ONLY the repository's backlog config.
- "Aliases (the command names of the first release still work ...)" — a statement of backwards compatibility.
- The location is resolved from BACKLOG_HOME, then the repository configuration `.backlog/config.json`, then the older root file `.smooth-backlog.json` (LEGACY_CONFIG in setup.js, "written by earlier builds: still read"), then per-user records in the user's config folder, then the default `.backlog` (store.js resolveHome, setup.js configuredHome). Three of those five are not the repository configuration.
