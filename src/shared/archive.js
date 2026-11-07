// `backlog archive`: archives a finished item (number or slug) and renumbers the queue.
// oracle's order: pull, resolve the item, git mv under archive/, stamp status, event, take it out of the index, commit and
// push. The item is found by number (seq) or slug. The helpers at the top are shared with move.js.
// shortcut: argparse's unique-prefix abbreviations (--for) are not accepted.
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BacklogError } from '../errors.js';
import { find, rows as itemRows } from './index.js';
import { assertInside, git, redact } from './safety.js';
import { parseItem as parseDoc } from './frontmatter.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { outsideTeam, teamScope } from '../team/team.js';

// Python repr of a str, for the earlier scripts `{x!r}`.
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
// existing item and writes calls this before it writes (update through lifecycle.step). The item as a row, or as front matter.
export const teamRefusal = item => {
  const why = outsideTeam({ repository: item.repository, branch: item.branch });
  return why ? `${item.slug ?? item.phase}: ${why}` : null;
};

// Resolve the consuming repository, take the clone's operation lock, pull, read the folder's rows and run fn(rows, {home, repo, folder, folders, guard, wrote}); then,
// when fn answers 0 and `tail` (the commit message: script name + first two arguments, archive.py:112-117) is given, commit and push the folder.
// The lock is held from the pull to the push (archive.py's run_lock) and covers every repository folder of the clone, a cross-repository move's too.
export async function withBacklog(fn, tail) {
  const { home } = store.resolveHome();
  let repo;
  try { repo = teamScope().repo || store.repoId(process.cwd()); } catch (e) { return die(e.message); } // update's rule: a team session works on its repository
  return store.cloneLocked(home, async () => {
    await sync.pull(home); // every script works on origin/main as it is now
    const folder = store.folder(home, repo);
    const guard = []; const wrote = []; // the items this command rewrites on the strength of what it read (seen.js), and what it leaves behind
    const folders = [folder]; // the folders this command changed: one commit covers them all (a cross-repository move adds its target)
    let code;
    try {
      code = await store.undoOnThrow(folder, () => fn(itemRows(folder).rows, { home, repo, folder, folders, guard, wrote })); // refuses a link at the owner or the repository folder
    } catch (e) {
      await git(['reset', '-q', '--', '.'], folder); // undoOnThrow put the files back; a staged git mv would still be in the index
      throw e;
    }
    if (code === 0 && tail) {
      const pairs = await sync.commitSettled(home, folders, tail, guard);
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
    return await withBacklog((rows, ctx) => archive(a, rows, ctx), a['dry-run'] ? null : ['archive.py', ...argv.slice(0, 2)].join(' '));
  } catch (e) { return seen.reportStale(e, die, e instanceof BacklogError ? e.exitCode : 1); }
}

async function archive(a, rows, { repo, folder, guard }) {
  const row = find(rows, a.phase);
  if (!row) return refuse(`no phase ${pyStr(a.phase)}`);
  const outside = teamRefusal(row);
  if (outside) return refuse(outside);
  if (row.status === 'archived') { say(`ℹ️  ${row.slug} already archived`); return 0; }
  if (row.status !== 'closed' && !a.force) return refuse(`${row.slug} is '${row.status ?? 'None'}', not 'closed' — finish it or pass --force`);

  const src = join(folder, row.path);
  await assertInside(folder, src); // the file is inside the folder, no symlink on the way
  const { fm } = parseDoc(readFileSync(src, 'utf8'));
  seen.check(folder, repo, seen.actor(), row.slug, row.path);
  guard.push({ path: `${repo}/${row.path}`, slug: row.slug, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` });
  const from = relative(folder, resolve(src)).split('\\').join('/');
  const to = `archive/${from}`; // the same path under archive/ (archive.py:76-77)
  store.assertNoSymlinks(folder, join(folder, to)); // a link at archive/ or archive/phases/ would take the move outside
  if (a['dry-run']) { say(`ℹ️  [dry-run] would archive ${row.slug} and mark it archived`); return 0; }

  if (existsSync(join(folder, to))) return refuse(`an archived item named ${row.slug} already exists; archiving it again would replace that item`);
  mkdirSync(join(folder, to, '..'), { recursive: true });
  store.note(src); store.note(join(folder, to)); // the move and the stamp below are undone from these
  if ((await git(['mv', '--', from, to], folder)).code) { // archive.py:39-49: a file git does not track yet moves plainly
    try { renameSync(src, join(folder, to)); } catch { return refuse(`could not archive ${row.slug}: the file move failed`); }
  }
  store.write({ path: join(folder, to), fm: { ...fm, status: 'archived' } }, folder, { frontMatterOnly: true });
  // archiving removes an item from the backlog -> planning event: it leaves the index and the remainder re-densifies to 0..M-1
  store.addEvent(folder, to, { event: 'archived', branch: row.branch, commitSha: row.commit_sha, note: `${row.slug} -> ${to}` });
  const order = store.reflow(folder, { branches: [row.branch] });
  if (order.length) store.addEvent(folder, to, { event: 'planning_event', note: `archived ${row.slug}; backlog re-prioritized to ${order.length} item(s)` });
  say(`📦 ${row.slug} archived`);
  if (order.length) say(`   📋 planning event: backlog re-densified to ${order.length} item(s) (P0..P${order.length - 1})`);
  return 0;
}
