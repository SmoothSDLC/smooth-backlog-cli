// `backlog team migrate [--team <name> | --show-all] [--dry-run] [--json]`: converts every markdown item of the repository's own folder (open and archived) to a JSON
// item, in one commit that is published as the command's own (src/shared/team-publish.js). The plan of the folder is src/team/migrate-plan.js; this file checks what
// must hold first (no uncommitted change of a person, a team file that is valid in full), writes, publishes and records the run in the working copy's configuration.
// It never writes the team file, reads no template and no other repository's folder.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import * as index from '../shared/index.js';
import { hasFrontMatter } from '../shared/item-file.js';
import { NUMBER_FILE, record, seed } from '../shared/numbers.js';
import { redact } from '../shared/safety.js';
import { readConfig } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, git, note, repoId, resolveHome, undoOnThrow, writeText } from '../shared/store.js';
import { publishTeam } from '../shared/team-publish.js';
import { openOf } from './apply.js';
import { fromFile, viewOf } from './item.js';
import { redactDeep, say } from './json-out.js';
import { planFolder, readFolder } from './migrate-plan.js';
import { pullFolder, watched } from './pull.js';
import { errors } from './rules/validate.js';
import { loadTeams, writeConfigKeys } from './teams-load.js';
import { readInputs } from './validate-command.js';

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const ITEM = /^(phases\/[^/]+|archive\/.+)\.(md|json)$/;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function run(argv) {
  try { return await migrate(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

// The item, index and counter paths of the folder that hold an uncommitted change: nothing of a person is published without their action, so the run stops on each.
// An untracked markdown file without a header block is no item; any other file of the folder is not the migration's.
function uncommitted(folder) {
  if (!existsSync(folder)) return [];
  const prefix = git(['rev-parse', '--show-prefix'], folder).stdout.trim();
  const rows = git(['status', '--porcelain', '-z', '-uall', '--no-renames', '--', '.'], folder).stdout.split('\0').filter(Boolean);
  return rows.map(row => [row.slice(0, 2), row.slice(3 + prefix.length)])
    .filter(([st, rest]) => rest === 'index.json' || rest === NUMBER_FILE || (ITEM.test(rest) && !(st === '??' && rest.endsWith('.md') && !hasFrontMatter(readFileSync(join(folder, rest), 'utf8')))))
    .map(([, rest]) => rest);
}

// The team file, always validated in full. Resolves to { file, info } or { failures }: a missing file is tolerated only when no item of the folder has a team.
function teamFile(load, inputs, read) {
  let loaded;
  try { loaded = load(); } catch (e) {
    if (!(e instanceof BacklogError) || e.code !== 'TEAMS_FILE') throw e;
    const missing = /^no team file at (.*?); name one with /s.exec(e.message); // the loader's text for a file that is not there
    if (missing && !read.hasTeamItem) return { file: undefined, info: `ℹ️  no team file at ${missing[1]}; no item of ${read.label} has a team` };
    return { failures: [e.message.replace(/; fix it and run backlog team validate .*$/s, '; fix it, or write {} to unbind every team item on purpose')] };
  }
  const { file, shown, findings, persistSha } = loaded;
  const unreadable = reason => `${shown} cannot be read (${reason}); fix it, or write {} to unbind every team item on purpose`;
  if (!file) { const m = /^teams\.json is not JSON \((.*)\)$/s.exec(findings[0].problem); return { failures: [unreadable(m ? m[1] : 'it is not a JSON object')] }; }
  const errs = errors(findings);
  if (errs.length) {
    return { failures: [...errs.filter(f => !f.team).map(f => unreadable(f.problem)),
      ...[...new Set(errs.map(f => f.team).filter(Boolean))].map(t => `team ${t} fails validation in ${shown}; rewrite it and run backlog team validate --team ${t} first`)] };
  }
  if (!inputs.all && !Object.hasOwn(file, inputs.team)) throw new BacklogError('TEAMS_FILE', `team ${inputs.team} has no entry in ${shown} (teams: ${Object.keys(file).join(', ')})`, 1);
  return { file, persistSha };
}

const entriesOf = idx => new Set(Object.entries(idx.branches).flatMap(([branch, list]) => list.map(e => `${branch}\0${e.slug}`)));

async function migrate(argv) {
  const { top, inputs } = readInputs('migrate', argv, ['dry-run']);
  const dry = argv.includes('--dry-run'); const json = argv.includes('--json');
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const { home } = resolveHome();
  const folder = folderOf(home, repo);
  const refused = failures => {
    if (json) say(JSON.stringify(redactDeep({ failures }), null, 2), true);
    else for (const f of failures) process.stderr.write(`❌ backlog: ${redact(f)}\n`);
    return 2;
  };

  return cloneLocked(home, async () => {
    let floor = 0; // the numbers this clone's history held before the pull: a pull that rewrites the history never lowers the counter
    try { floor = seed(folder); } catch (e) { if (!(e instanceof BacklogError)) throw e; } // the plan lists the reason below
    await pullFolder(home, folder, { read: dry });
    let persistSha = () => {};
    let info; // said once, by the first round

    // One round on the pulled files: resolves to { refusal: [texts] } with nothing written, or to the summary of what it converted (or would).
    const attempt = async () => {
      const changed = uncommitted(folder);
      const label = repo;
      if (changed.length) return { refusal: changed.map(p => `${label}/${p} has an uncommitted change; commit or stash it, then run backlog team migrate again`) };
      const read = readFolder(folder);
      const team = teamFile(() => loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString(), full: true, deferSha: true }), inputs, read);
      info = team.info;
      persistSha = team.persistSha ?? (() => {});
      const plan = planFolder(read, { teams: team.file, repo });
      const failures = [...(team.failures ?? []), ...plan.failures];
      // the index is made right against every item of the folder: the ones already in JSON keep their entries, the converted ones are appended
      const views = plan.converted.map(c => viewOf(c.item, c.to));
      if (plan.converted.length) {
        for (const i of read.items.filter(x => x.kind === 'json')) {
          try { views.push(viewOf(fromFile(i.text, { path: i.path }), i.path)); } catch (e) { failures.push(`${read.label}/${i.path}: the item file cannot be read (${e.message}); restore it with git and run backlog team migrate again`); }
        }
      }
      if (failures.length) return { refusal: failures };
      const before = index.read(folder);
      const { idx } = index.reconcile(before, views, { open: openOf(team.file) });
      const was = entriesOf(before); const now = entriesOf(idx);
      const counter = Math.max(floor, plan.counter);
      const summary = {
        dry_run: dry, converted: plan.converted.length, archived: plan.converted.filter(c => c.archived).length, counter, refs: plan.refs, unresolved: plan.unresolved,
        index_leave: [...was].filter(k => !now.has(k)).length, index_appended: [...now].filter(k => !was.has(k)).length, failures: [],
      };
      if (dry || !plan.converted.length) return { summary };
      await undoOnThrow(folder, () => {
        for (const c of plan.converted) {
          writeText(join(folder, c.to), c.json, folder);
          const from = join(folder, c.from);
          note(from); rmSync(from);
        }
        record(folder, counter);
        index.write(folder, idx);
      });
      return { summary, message: `migrate ${plural(plan.converted.length, 'item')} to JSON` };
    };

    // The SHA of the team file and the record of the run, once the run went through: never for a dry run, a refused run, or another repository than the working copy's.
    let done;
    const persist = () => {
      persistSha();
      if (repo !== workRepo) return;
      const at = done.summary.converted || !readConfig(top).migrated_at ? { migrated_at: new Date().toISOString() } : {};
      writeConfigKeys(top, { ...at, migrated_by_version: VERSION });
    };

    done = await attempt();
    if (info && !json) say(info);
    if (done.refusal) return refused(done.refusal);
    if (done.message) {
      const r = await publishTeam(home, folder, done.message, { step: 'team migrate', attempt, watch: await watched(home, repo, top, workRepo), persist });
      if (r.refusal) return refused(r.refusal);
      done = r.result ?? done;
    } else if (!dry) persist();

    const s = done.summary;
    if (json) { say(JSON.stringify(redactDeep(s), null, 2), true); return 0; }
    if (!s.converted) { say(`ℹ️  nothing to convert in ${repo}`); return 0; }
    const what = `${plural(s.converted, 'item')} (${s.archived} archived) to JSON in ${repo}`;
    say(dry ? `ℹ️  would convert ${what}; nothing is written` : `✅ converted ${what}`);
    say(`   counter: ${s.counter} (the highest number of ${plural(s.refs.length, 'ref')} and of the items)`);
    say(`   index: ${plural(s.index_leave, 'entry').replace(/entrys$/, 'entries')} leave, ${plural(s.index_appended, 'item')} appended`);
    for (const u of s.unresolved) say(`⚠️  ${u}`);
    return 0;
  });
}
