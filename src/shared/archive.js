// Shared-mode `backlog archive` (cli-parity job 17). Port of archive.py:22-110 and its commit tail (archive.py:112-117) in the
// oracle's order: pull, resolve the item, git mv under archive/, stamp status, mirror row and event, scan, reflow, commit and
// push. The item is found by number (seq) or slug, never by database row id. The helpers at the top are shared with move.js.
// shortcut: argparse's unique-prefix abbreviations (--for) are not accepted.
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BacklogError } from '../errors.js';
import * as db from './db.js';
import { assertInside, git, itemSelector, redact } from './safety.js';
import { parse as parseDoc } from './frontmatter.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { outsideTeam, teamScope } from './team.js';

// Python repr of a str, for the oracle's `{x!r}`.
export function pyStr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === q || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Z}]/u.test(ch)) {
      out += c < 0x100 ? `\\x${c.toString(16).padStart(2, '0')}` : c < 0x10000 ? `\\u${c.toString(16).padStart(4, '0')}` : `\\U${c.toString(16).padStart(8, '0')}`;
    } else out += ch;
  }
  return q + out + q;
}
export const usage = message => new BacklogError('INVALID_INPUT', message); // argparse errors: exit 2
// A token that argparse takes as a value or positional: no leading dash, a lone dash, a negative number, or a space inside.
export const valueLike = s => s !== undefined && (!s.startsWith('-') || s === '-' || /^-(\d+|\d*\.\d+)$/.test(s) || s.includes(' '));
export const say = text => process.stdout.write(`${redact(text)}\n`);
export const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
export const refuse = message => { say(`❌ ${message}`); return 1; }; // the scripts' refusals: stdout, exit 1
// A team session (TEAM_REPOSITORY/TEAM_BRANCH) works only on items of its own repository and branch; every command that selects an
// existing item and writes calls this before it writes (update through lifecycle.step). The item as a mirror row, or as front matter.
export const teamRefusal = item => {
  const why = outsideTeam({ repository: item.repository, branch: item.branch });
  return why ? `${item.slug ?? item.phase}: ${why}` : null;
};

// lib_db.py:587-595
export function find(con, text) {
  const sel = itemSelector(text);
  const row = sel && (sel.number !== undefined
    ? con.prepare("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id").get(sel.number)
    : con.prepare('SELECT * FROM phase WHERE slug=?').get(sel.slug));
  return row ? { ...row } : null;
}

// Resolve the consuming repository, take the clone's operation lock, pull, open its mirror db and run fn(con, {home, repo, folder, close}); then,
// when fn answers 0 and `tail` (the commit message: script name + first two arguments, archive.py:112-117) is given, commit and push the folder.
// The lock is held from the pull to the push (archive.py's run_lock) and covers every repository folder of the clone, a cross-repository move's too.
export async function withBacklog(fn, tail) {
  const { home } = store.resolveHome();
  let repo;
  try { repo = teamScope().repo || store.repoId(process.cwd()); } catch (e) { return die(e.message); } // update's rule: a team session works on its repository
  return store.cloneLocked(home, async () => {
    await sync.pull(home); // lib_db.py:101-110: every script works on origin/main as it is now
    const folder = store.folder(home, repo);
    const forget = db.freshDb(folder);
    const con = db.connect(folder); // refuses a link at the owner or the repository folder
    let open = true;
    const close = () => { if (open) { open = false; con.close(); } };
    const guard = []; const wrote = []; // the items this command rewrites on the strength of what it read (seen.js), and what it leaves behind
    const folders = [folder]; // the folders this command changed: one commit covers them all (a cross-repository move adds its target)
    let code;
    try {
      code = await db.undoOnThrow(con, folder, () => fn(con, { home, repo, folder, close, folders, guard, wrote }));
    } catch (e) {
      await git(['reset', '-q', '--', '.'], folder); // undoOnThrow put the files back; a staged git mv would still be in the index
      close(); forget();
      throw e;
    } finally { close(); }
    if (code !== 0 || !tail) forget();
    if (code === 0 && tail) {
      const pairs = await db.commitSettled(home, folders, tail, guard);
      seen.recordWrites(folder, repo, seen.actor(), wrote, pairs);
    }
    return code;
  });
}

function parse(argv) { // archive.py:54-57 argparse
  const a = {}; let past = false;
  for (const tok of argv) {
    if (!past && tok === '--') { past = true; continue; }
    if (past || valueLike(tok)) {
      if (a.phase !== undefined) throw usage(`unrecognized arguments: ${tok}`);
      a.phase = tok;
    } else if (tok === '--force' || tok === '--dry-run') a[tok.slice(2)] = true;
    else throw usage(`unrecognized arguments: ${tok}`);
  }
  if (a.phase === undefined) throw usage('the following arguments are required: phase');
  return a;
}

export async function run(argv) {
  try {
    const a = parse(argv);
    return await withBacklog((con, ctx) => archive(a, con, ctx), a['dry-run'] ? null : ['archive.py', ...argv.slice(0, 2)].join(' '));
  } catch (e) { return die(e.message, e instanceof BacklogError ? e.exitCode : 1); }
}

async function archive(a, con, { repo, folder, close, guard }) {
  const row = find(con, a.phase);
  if (!row) return refuse(`no phase ${pyStr(a.phase)}`);
  const outside = teamRefusal(row);
  if (outside) return refuse(outside);
  if (row.status === 'archived') { say(`ℹ️  ${row.slug} already archived (${row.path})`); return 0; }
  if (row.status !== 'done' && !a.force) return refuse(`${row.slug} is '${row.status ?? 'None'}', not 'done' — finish it or pass --force`);

  const src = join(folder, row.path);
  await assertInside(folder, src); // the row is mirror data: it names a file inside the folder, no symlink on the way
  const { fm } = parseDoc(readFileSync(src, 'utf8'));
  seen.check(folder, repo, seen.actor(), row.slug, row.path);
  guard.push({ path: `${repo}/${row.path}`, slug: row.slug, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` });
  const from = relative(folder, resolve(src)).split('\\').join('/');
  const to = `archive/${from}`; // the same path under archive/ (archive.py:76-77)
  store.assertNoSymlinks(folder, join(folder, to)); // a link at archive/ or archive/phases/ would take the move outside
  if (a['dry-run']) { say(`ℹ️  [dry-run] would git mv ${from} -> ${to} and mark ${row.slug} archived`); return 0; }

  if (existsSync(join(folder, to))) return refuse(`${to} already exists; archiving ${row.slug} would replace that archived item`);
  mkdirSync(join(folder, to, '..'), { recursive: true });
  store.note(src); store.note(join(folder, to)); // the move and the stamp below are undone from these
  if ((await git(['mv', '--', from, to], folder)).code) { // archive.py:39-49: a file git does not track yet moves plainly
    try { renameSync(src, join(folder, to)); } catch { return refuse(`could not move ${src}`); }
  }
  store.write({ path: join(folder, to), fm: { ...fm, status: 'archived' } }, folder, { frontMatterOnly: true });
  // archiving removes an item from the backlog -> planning event: re-densify the remainder to 0..M-1
  const hid = con.prepare("SELECT id FROM handoff WHERE status='active' LIMIT 1").get()?.id ?? null;
  let s;
  const recordArchive = () => {
    db.markArchived(con, row.slug, to);
    s = db.scan(con, folder);
  };
  // Exclude the departed item's mirror ghost while validating, so no mirror
  // writes are needed before the whole ranking write set has passed its guard.
  const order = hid === null ? (recordArchive(), []) : store.reflow(folder, { exclude: [row.slug] }, recordArchive);
  if (order.length) {
    db.logEvent(con, 'planning_event', { handoffId: hid, phaseId: row.id, note: `archived ${row.slug}; backlog re-prioritized to ${order.length} item(s)` });
    db.scan(con, folder);
  }
  close();
  say(`📦 ${row.slug} archived -> ${to}`);
  say(`   rescan: ${s.changed} (re)ingested, ${s.missing} missing`);
  if (order.length) say(`   📋 planning event: backlog re-densified to ${order.length} item(s) (P0..P${order.length - 1})`);
  return 0;
}
