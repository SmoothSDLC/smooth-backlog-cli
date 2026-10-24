// Shared-mode `backlog move` (cli-parity job 17). Port of move.py:12-110 and its commit tails (move.py:107, 113-118) in the
// oracle's order: pull, resolve the item, change, write, log the event, scan into backlog.db, commit and push. The item is found by
// number (seq) or slug, never by database row id.
// Beyond the oracle (item 017): a target branch must exist on the origin of the consuming repository, and a target repository
// must be a plain owner/name (the oracle joins any text onto the home).
// shortcut: argparse's unique-prefix abbreviations are not accepted; the target number
// comes from store.nextSeq (phases/, archive/ and the db) where move.py:35-37 ignores archive/.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import { die, find, pyStr, refuse, say, teamRefusal, usage, valueLike, withBacklog } from './archive.js';
import * as db from './db.js';
import { parse as parseDoc } from './frontmatter.js';
import { assertInside, git, redact } from './safety.js';
import * as store from './store.js';
import { teamScope } from './team.js';

const VALUE = ['to-branch', 'all-open-of-branch', 'note'];

function parse(argv) { // move.py:67-74 argparse; --to-repository takes an optional value ('' when none follows)
  const a = {}; let past = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!past && tok === '--') { past = true; continue; }
    const [flag, eq] = tok.startsWith('--') ? tok.slice(2).split(/=(.*)/s) : [null];
    if (past || (!VALUE.includes(flag) && flag !== 'to-repository' && valueLike(tok))) { // argparse: a known option wins, even with a space in its =value
      if (a.phase !== undefined) throw usage(`unrecognized arguments: ${tok}`);
      a.phase = tok;
      continue;
    }
    if (VALUE.includes(flag)) {
      const v = eq ?? (valueLike(argv[i + 1]) ? argv[++i] : undefined);
      if (v === undefined) throw usage(`argument --${flag}: expected one argument`);
      a[flag] = v;
    } else if (flag === 'to-repository') a[flag] = eq ?? (valueLike(argv[i + 1]) ? argv[++i] : '');
    else throw usage(`unrecognized arguments: ${tok}`);
  }
  return a;
}

export async function run(argv) {
  try {
    const a = parse(argv);
    return await withBacklog((con, ctx) => move(a, con, ctx), ['move.py', ...argv.slice(0, 2)].join(' '));
  } catch (e) { return die(e.message, e instanceof BacklogError ? e.exitCode : 1); }
}

// Branch names on the origin of the consuming repository (lib_db.py:287-293): a Set, or the git error text.
async function originBranches() {
  const r = await git(['ls-remote', '--heads', 'origin'], process.cwd());
  if (r.code) return redact(r.stderr).trim().slice(0, 300);
  return new Set(r.stdout.split('\n').filter(l => l.includes('refs/heads/')).map(l => l.split('refs/heads/')[1]));
}

// A bound team session (TEAM_REPOSITORY / TEAM_BRANCH) moves nothing into another team's repository or branch: teamRefusal checks only the source.
function teamTarget({ branch, repository }) {
  const t = teamScope();
  if (branch !== undefined && t.branch && branch !== t.branch) return `this session is bound to branch '${t.branch}'; it cannot move an item to branch '${branch}'`;
  if (repository !== undefined && t.repo && repository !== t.repo) return `this session is bound to ${t.repo}; it cannot move an item to ${repository}`;
  return null;
}

// The refusal for a target branch the origin does not have (or null).
async function branchRefusal(branch, repo) {
  const branches = await originBranches();
  if (typeof branches === 'string') return `could not read the branches of the origin of ${repo} (${branches}); the target branch '${branch}' cannot be checked`;
  return branches.has(branch) ? null : `branch '${branch}' does not exist on the origin of ${repo}; push it first or name an existing branch`;
}

// move.py:22-29
async function toBranch(con, folder, r, branch, note) {
  const path = join(folder, r.path);
  await assertInside(folder, path); // the row is mirror data: it names a file inside the folder, no symlink on the way
  const { fm, body } = parseDoc(readFileSync(path, 'utf8'));
  const old = Object.hasOwn(fm, 'branch') ? fm.branch ?? 'None' : '';
  fm.branch = branch;
  fm.updated = store.now();
  store.write({ path, fm, body }, folder);
  db.logEvent(con, 'moved_branch', {
    handoffId: r.handoff_id, phaseId: r.id, branch,
    note: `${r.slug}: branch '${old}' -> '${branch}'${note ? ` (${note})` : ''}`,
  });
}

async function move(a, con, { home, repo, folder, close, folders }) {
  if (a['all-open-of-branch']) { // move.py:76-86
    const from = a['all-open-of-branch'];
    if (!a['to-branch']) throw usage('--all-open-of-branch needs --to-branch');
    const refusal = teamTarget({ branch: a['to-branch'] }) || await branchRefusal(a['to-branch'], repo);
    if (refusal) return refuse(refusal);
    const rows = con.prepare("SELECT * FROM phase WHERE branch=? AND repository=? AND status IN ('pending','in_progress') ORDER BY id").all(from, repo);
    const outside = rows.map(teamRefusal).find(Boolean); // before the first file is written
    if (outside) return refuse(outside);
    for (const r of rows) await toBranch(con, folder, { ...r }, a['to-branch'], a.note || `all open items of ${from}`);
    db.scan(con, folder);
    say(`✅ moved ${rows.length} open item(s) of '${from}' to '${a['to-branch']}'`);
    return 0;
  }
  if (!a.phase) throw usage('name the item, or use --all-open-of-branch');
  const r = find(con, a.phase);
  if (!r) return refuse(`no item ${pyStr(a.phase)} in the backlog of ${repo}`);
  const outside = teamRefusal(r);
  if (outside) return refuse(outside);
  if (r.status === 'archived') return refuse(`${r.slug} is archived and cannot be moved (the rescan does not visit archive/, so the mirror would keep the old branch or repository); beyond move.py parity, which rewrites the archive file and leaves the mirror stale`);
  if (a['to-branch']) { // move.py:93-98
    const refusal = teamTarget({ branch: a['to-branch'] }) || await branchRefusal(a['to-branch'], repo);
    if (refusal) return refuse(refusal);
    await toBranch(con, folder, r, a['to-branch'], a.note);
    db.scan(con, folder);
    say(`✅ ${r.slug} now belongs to branch '${a['to-branch']}'`);
    return 0;
  }
  if (a['to-repository'] === undefined) throw usage('give --to-branch or --to-repository');
  // move.py:99-109
  const target = a['to-repository'] || r.repository;
  if (!target || target === repo) return refuse(`${r.slug} already belongs to ${repo}; name the target repository`);
  const bound = teamTarget({ repository: target });
  if (bound) return refuse(bound);
  let tdir;
  try { tdir = store.folder(home, target); } catch (e) { throw usage(e.message); } // owner/name only: the target is the user's text or a file's data
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.slug)) return refuse(`${pyStr(r.slug)} is not a plain item name (letters, digits, . _ -); the target file is named from it`); // mirror data: no path in it

  // move.py:32-64
  await assertInside(home, join(tdir, 'backlog.db')); // no symlink between the home and the target db: db.connect checks only below the owner, after the item is written
  const src = join(folder, r.path);
  await assertInside(folder, src);
  const { fm, body } = parseDoc(readFileSync(src, 'utf8'));
  // beyond move.py parity: depends_on names items of THIS backlog; in the target they would point at unrelated items
  if ([fm.depends_on ?? []].flat().some(d => d !== '' && d !== null)) return refuse(`${r.slug} depends on other items of ${repo}; dependencies are resolved against the target backlog, so clear them first: update ${r.slug} --set-depends-on none`);
  // beyond move.py parity: items of this backlog that list the item (by number or slug, as update --set-depends-on stores it) would be left pointing at nothing
  const dependents = store.load(folder).filter(i => i.fm.phase !== r.slug && [i.fm.depends_on ?? []].flat().some(d => d !== '' && d !== null && find(con, String(d))?.id === r.id)).map(i => i.fm.phase ?? i.path);
  if (dependents.length) return refuse(`${dependents.join(', ')} depend${dependents.length > 1 ? '' : 's'} on ${r.slug}, which would leave their depends_on pointing at nothing; clear them first: update <dependent> --set-depends-on ... (the other dependencies, or none)`);
  const seq = store.nextSeq(tdir);
  const slug = `${String(seq).padStart(3, '0')}-${r.slug.includes('-') ? r.slug.split('-').slice(1).join('-') : r.slug}`;
  Object.assign(fm, { phase: slug, seq, repository: target, updated: store.now() });
  const copy = join(tdir, 'phases', `${slug}.md`);
  const events = con.prepare('SELECT ts,event,branch,commit_sha,note FROM event WHERE phase_id=? ORDER BY id').all(r.id);
  const forget = db.freshDb(tdir);
  const tcon = db.connect(tdir);
  try {
    // all or nothing: a throw anywhere below, in the target scan or in the source rescan, restores both backlogs (files and mirror rows)
    await db.undoOnThrow(tcon, tdir, async () => {
      store.write({ path: copy, fm, body }, tdir);
      db.scan(tcon, tdir); // the target's scan
      store.reflow(tdir); // the copy keeps its source priority: rank it in the target's queue (beyond move.py parity, which leaves ties)
      db.scan(tcon, tdir);
      const pid = tcon.prepare('SELECT id FROM phase WHERE slug=?').get(slug).id;
      const add = tcon.prepare('INSERT INTO event(ts,handoff_id,phase_id,event,branch,commit_sha,note) VALUES(?,?,?,?,?,?,?)');
      tcon.exec('BEGIN');
      for (const e of events) add.run(e.ts, null, pid, e.event, e.branch, e.commit_sha, `[from ${repo} ${r.slug}] ${e.note}`);
      add.run(store.now(), null, pid, 'moved_in', fm.branch || '', '', `from ${repo} as ${r.slug}`);
      tcon.exec('COMMIT');
      store.note(src);
      rmSync(src);
      con.prepare('DELETE FROM phase WHERE id=?').run(r.id);
      db.logEvent(con, 'moved_out', { handoffId: r.handoff_id, phaseId: r.id, branch: r.branch || '', note: `${r.slug} -> ${target} as ${slug}` });
      db.scan(con, folder);
      store.reflow(folder); // the item leaves the source queue: close the gap
      db.scan(con, folder);
    });
  } catch (e) { tcon.close(); forget(); throw e; } finally { tcon.close(); }
  close();
  folders.push(tdir); // ONE commit and push covers the source and the target: never one pushed without the other
  say(`✅ ${r.slug} moved to ${target} as ${slug}`);
  return 0;
}
