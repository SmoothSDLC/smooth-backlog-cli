// Shared-mode `backlog move` (cli-parity job 17). Port of move.py:12-110 and its commit tails (move.py:107, 113-118) in the
// oracle's order: pull, resolve the item, change, write, log the event, scan into backlog.db, commit and push. The item is found by
// number (seq) or slug, never by database row id.
// Beyond the oracle (item 017): a target branch must exist on the origin of the consuming repository, and a target repository
// must be a plain owner/name (the oracle joins any text onto the home).
// shortcut: argparse's unique-prefix abbreviations are not accepted; no per-folder run lock around the command; the target number
// comes from store.nextSeq (phases/, archive/ and the db) where move.py:35-37 ignores archive/.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import { commitFolder, die, find, pyStr, refuse, say, usage, valueLike, withBacklog } from './archive.js';
import * as db from './db.js';
import { parse as parseDoc } from './frontmatter.js';
import { assertInside, git, redact } from './safety.js';
import * as store from './store.js';

const VALUE = ['to-branch', 'all-open-of-branch', 'note'];

function parse(argv) { // move.py:67-74 argparse; --to-repository takes an optional value ('' when none follows)
  const a = {}; let past = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!past && tok === '--') { past = true; continue; }
    if (past || valueLike(tok)) {
      if (a.phase !== undefined) throw usage(`unrecognized arguments: ${tok}`);
      a.phase = tok;
      continue;
    }
    const [flag, eq] = tok.startsWith('--') ? tok.slice(2).split(/=(.*)/s) : [null];
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

async function move(a, con, { home, repo, folder, close }) {
  if (a['all-open-of-branch']) { // move.py:76-86
    const from = a['all-open-of-branch'];
    if (!a['to-branch']) throw usage('--all-open-of-branch needs --to-branch');
    const refusal = await branchRefusal(a['to-branch'], repo);
    if (refusal) return refuse(refusal);
    const rows = con.prepare("SELECT * FROM phase WHERE branch=? AND repository=? AND status IN ('pending','in_progress') ORDER BY id").all(from, repo);
    for (const r of rows) await toBranch(con, folder, { ...r }, a['to-branch'], a.note || `all open items of ${from}`);
    db.scan(con, folder);
    say(`✅ moved ${rows.length} open item(s) of '${from}' to '${a['to-branch']}'`);
    return 0;
  }
  if (!a.phase) throw usage('name the item, or use --all-open-of-branch');
  const r = find(con, a.phase);
  if (!r) return refuse(`no item ${pyStr(a.phase)} in the backlog of ${repo}`);
  if (a['to-branch']) { // move.py:93-98
    const refusal = await branchRefusal(a['to-branch'], repo);
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
  let tdir;
  try { tdir = store.folder(home, target); } catch (e) { throw usage(e.message); } // owner/name only: the target is the user's text or a file's data
  await assertInside(home, join(tdir, 'backlog.db'));

  // move.py:32-64
  const src = join(folder, r.path);
  await assertInside(folder, src);
  const { fm, body } = parseDoc(readFileSync(src, 'utf8'));
  const seq = store.nextSeq(tdir);
  const slug = `${String(seq).padStart(3, '0')}-${r.slug.includes('-') ? r.slug.split('-').slice(1).join('-') : r.slug}`;
  Object.assign(fm, { phase: slug, seq, repository: target, updated: store.now() });
  store.write({ path: join(tdir, 'phases', `${slug}.md`), fm, body }, tdir);
  const events = con.prepare('SELECT ts,event,branch,commit_sha,note FROM event WHERE phase_id=? ORDER BY id').all(r.id);
  const tcon = db.connect(tdir);
  try {
    db.scan(tcon, tdir); // the target's scan
    const pid = tcon.prepare('SELECT id FROM phase WHERE slug=?').get(slug).id;
    const add = tcon.prepare('INSERT INTO event(ts,handoff_id,phase_id,event,branch,commit_sha,note) VALUES(?,?,?,?,?,?,?)');
    tcon.exec('BEGIN');
    for (const e of events) add.run(e.ts, null, pid, e.event, e.branch, e.commit_sha, `[from ${repo} ${r.slug}] ${e.note}`);
    add.run(store.now(), null, pid, 'moved_in', fm.branch || '', '', `from ${repo} as ${r.slug}`);
    tcon.exec('COMMIT');
  } finally { tcon.close(); }
  rmSync(src);
  con.prepare('DELETE FROM phase WHERE id=?').run(r.id);
  db.logEvent(con, 'moved_out', { handoffId: r.handoff_id, phaseId: r.id, branch: r.branch || '', note: `${r.slug} -> ${target} as ${slug}` });
  db.scan(con, folder);
  close();
  await commitFolder(home, tdir, `move.py ${r.slug} in from ${repo}`);
  say(`✅ ${r.slug} moved to ${target} as ${slug}`);
  return 0;
}
