// Stale-view guard. Every item write stamps `updated_by` next to `updated`. A command that shows an item to an agent, and
// every explicit write after it succeeds, records what that agent saw (updated, updated_by, the backlog commit) in <clone>/.git/smooth-backlog-cli-views/<agent>.json;
// a write to an item the agent has seen first compares the file with that record and refuses (exit 5) when someone else changed it since.
// An item the agent never saw is written without a check (its first write). Items without updated_by (older files) read as written by nobody.
import { spawnSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BacklogError } from '../errors.js';
import { parseItem as parse, readItemFile, readItemText, storedFm } from './item-file.js';
import { configUser } from './setup.js';
import { now, originRef, repoId, stateDir } from './store.js'; // a cycle (store.js imports this file): used only at run time

export const STALE_EXIT = 5;
let current; // the --by/--agent of the running command
export const setActor = name => { if (name) current = String(name); };
// the agent of the session (SMOOTH_BACKLOG_CLI_AGENT), as --by and --agent name it: one agent, one view
// With no agent named, the writer is the user of the repository's configuration (setup records it from git, else the login name).
let user;
export const actor = () => current || (process.env.SMOOTH_BACKLOG_CLI_AGENT || '').trim() || (user ??= configUser());
// Hash the exact name: replacement aliases distinct agents. Old lossy names are deliberately not read.
const viewsFile = (home, agent) => join(stateDir(home), 'smooth-backlog-cli-views', `${createHash('sha256').update(agent).digest('hex')}.json`);
const homeOf = folder => dirname(dirname(folder)); // <home>/<owner>/<name>
const operation = new AsyncLocalStorage();

// One scope follows the clone lock through pulls, all repository folders and
// publication retries. Ranking callers cannot forget to pass a guard callback.
export const guarded = fn => operation.getStore() ? fn() : operation.run({ guard: [], created: new Set() }, fn);
export const created = (folder, path) => operation.getStore()?.created.add(join(folder, path));
// the slug of the item the running command created (new), for the status line
export const primarySlug = () => { const c = operation.getStore()?.created; return c?.size ? basename([...c][0], '.md') : null; };
export function publicationGuard(given = []) {
  const guard = operation.getStore()?.guard ?? [];
  for (const g of given) if (!guard.some(x => x.path === g.path)) guard.push(g);
  return guard; // shared by reference: reconciliation can enlarge it before another push
}

function read(home, agent) { try { return JSON.parse(readFileSync(viewsFile(home, agent), 'utf8')); } catch { return {}; } }

// views: [{slug, path}] (path from the repository folder) of repo, as the agent now sees them. Never fails the command: the record is a safety net.
// The file's hash is part of the view: `updated` has a resolution of one second, so two changes in one second differ only in content.
// content is the hash without the fields that change without a change of the item (priority, which earlier builds kept in the item, updated,
// updated_by): another agent's planning move is no change of the item for this agent's next write
// events: the history only grows (a split, an archive, a note adds a line); a line added by someone else is no change of the item either
const RANK_ONLY = ['priority', 'updated', 'updated_by', 'events'];
const contentOf = doc => { const fm = { ...doc.fm }; for (const k of RANK_ONLY) delete fm[k]; return createHash('sha256').update(JSON.stringify([Object.keys(fm).sort().map(k => [k, fm[k]]), doc.body])).digest('hex'); };
const textView = text => { const doc = parse(text); return { fm: doc.fm, sha: createHash('sha256').update(text).digest('hex'), content: contentOf(doc) }; };
const fileView = (folder, path) => textView(readItemText(join(folder, path)));
// the item as a git revision of the backlog home has it (throws when it has none)
const revView = (home, rev, file) => { const r = spawnSync('git', ['show', `${rev}:./${file}`], { cwd: home, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return textView(r.stdout); };

export function record(folder, repo, agent, views) {
  const home = homeOf(folder);
  try {
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: home, encoding: 'utf8' }).stdout.trim();
    const all = read(home, agent);
    for (const v of views) { // a view may name another repository folder (a cross-repository move leaves the item there)
      const key = `${v.repo ?? repo}/${v.slug}`;
      const { fm, sha, content } = fileView(v.folder ?? folder, v.path);
      all[key] = { updated: fm.updated ?? null, updated_by: fm.updated_by ?? null, sha, content, commit, path: v.path, folder: v.folder ?? folder };
    }
    const file = viewsFile(home, agent);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1), { mode: 0o600 });
    renameSync(tmp, file);
  } catch { /* unwritable .git or an unreadable item: the next write is simply unchecked */ }
}

// Only successful publication records the views of what the agent wrote.
export function recordWrites(folder, repo, agent, views, pairs = []) {
  const published = remapViews(folder, views, pairs);
  if (views.length) record(folder, repo, agent, published);
  setUse(homeOf(folder), agent); // a write is the agent's own use of the backlog: it moves its reference point
  return published;
}

// the agent's reference point - the commit of the agent's last write or its last
// `backlog changes`, under a reserved key of the views file. It has no '/', so every reader of
// the per-item keys (<owner>/<name>/<slug>) ignores it. A read never moves it.
const USE = '~use';
export const lastUse = (home, agent) => read(home, agent)[USE] ?? null;
// Returns the record written, or null when the write failed (unwritable.git, or no commit yet):
// the caller keeps the previous reference and says the write failed - a reference the command
// states was written must be the one stored.
export const setUse = (home, agent) => {
  try {
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: home, encoding: 'utf8' }).stdout.trim();
    if (!commit) return null;
    const entry = { agent, at: now(), commit };
    const all = read(home, agent);
    all[USE] = entry;
    const file = viewsFile(home, agent);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1), { mode: 0o600 });
    renameSync(tmp, file);
    return entry;
  } catch { /* the agent simply has no reference point (yet): the caller says so */ }
  return null;
};
// The agents that have a reference point, read from the views files of this clone (name and
// last-use time). Other clones' views are not visible here: the list is per clone.
export function agentsUsing(home) {
  const dir = join(stateDir(home), 'smooth-backlog-cli-views');
  let files;
  try { files = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of files.filter(x => x.endsWith('.json')).sort()) {
    let v = null;
    try { v = JSON.parse(readFileSync(join(dir, n), 'utf8'))[USE]; } catch { /* unreadable: not listed */ }
    if (v && v.agent) out.push({ name: v.agent, last_use: v.at });
  }
  return out;
}
// the items of the caller's repository folder whose file changed between the agent's
// reference commit and the current HEAD of the backlog clone: A added, M changed, D removed or
// archived. A file moved inside the folder (an archive, a renumbering) is one D entry for its
// old name; the item's author and time come from its new location (or its reference-commit
// version when it is gone). Held: the agent's name in claimed_by, reviewer or refiner.
// Throws when the comparison itself fails (the reference commit is no longer in the clone, or
// another git error): an empty report would be read as "no changes", and the caller must decide
// what to do with the reference before it is advanced.
export function changedSince(home, folder, repo, reference, agent) {
  const r = spawnSync('git', ['diff', '--name-status', '--relative', reference.commit, 'HEAD', '--', `${repo}/phases`, `${repo}/archive`], { cwd: home, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git diff ${reference.commit} HEAD failed: ${(r.stderr || '').trim() || `exit ${r.status}`}`);
  const rows = r.stdout.split('\n').filter(Boolean).map(l => { const [status, ...paths] = l.split('\t'); return { status, path: paths[0], to: paths[1] }; });
  const base = p => p.split('/').pop();
  const rel = p => p.slice(repo.length + 1);
  const added = new Map();
  for (const x of rows) if (x.status === 'A') added.set(base(x.path), x.path);
  const gone = new Set(rows.filter(x => x.status === 'D').map(x => base(x.path)));
  const entries = [];
  for (const x of rows) {
    const isMove = x.status.startsWith('R'); // git reports a file moved inside the folder (an archive, a renumbering) as a rename: it is the move
    if (!['A', 'M', 'D'].includes(x.status) && !isMove) continue;
    const b = base(x.path);
    if (x.status === 'A' && gone.has(b)) continue; // its D entry reports the move
    let fm = {};
    if (x.status === 'D' || isMove) {
      const moved = isMove ? x.to : added.get(b);
      if (moved) { try { fm = readItemFile(join(folder, rel(moved))).fm; } catch { /* gone: no author or time */ } }
      else {
        const v = spawnSync('git', ['show', `${reference.commit}:./${x.path}`], { cwd: home, encoding: 'utf8' });
        if (!v.status) fm = parse(v.stdout).fm;
      }
    } else {
      try { fm = readItemFile(join(folder, rel(x.path))).fm; } catch { /* unreadable: no author or time */ }
    }
    entries.push({
      slug: b.replace(/\.md$/, ''),
      status: isMove ? 'D' : x.status,
      updated_by: fm.updated_by ?? '',
      updated: fm.updated ?? '',
      held: fm.claimed_by === agent || fm.reviewer === agent || fm.refiner === agent,
    });
  }
  return { held: entries.filter(e => e.held), others: entries.filter(e => !e.held) };
}

// Creation's slug/path adjustment also applies to moves and updates.
// Numbers belong to one folder; follow successive publication retries.
function remapViews(folder, views, pairs) {
  return views.map(view => {
    let v = { ...view };
    for (const [old, next] of pairs.filter(p => p.folder === undefined || p.folder === resolve(v.folder ?? folder))) {
      if (Number(v.slug.match(/^\d+/)?.[0]) !== old) continue;
      const slug = String(next).padStart(3, '0') + v.slug.replace(/^\d+/, '');
      v = { ...v, slug, path: v.path.replace(/[^/\\]+$/, `${slug}.md`) };
    }
    return v;
  });
}

// A command showed the item (a row) to `agent`.
export const view = (agent, folder, repo, row) => record(folder, repo, agent || actor(), [{ slug: row.slug, path: row.path }]);

// the refusal names every item of this folder the agent has read whose content changed since, in one command
// others: slugs of repo, or {repo, slug} of another repository folder. The command to read them again is the one to run
// from inside each repository (a cross-repository move or publication may hit items of the other one).
export function staleError(slug, by, at, was, others = [], repo, text) {
  const groups = new Map([[repo, [slug]]]);
  for (const o of others) {
    const [r, s] = typeof o === 'string' ? [repo, o] : [o.repo, o.slug];
    if (!groups.has(r)) groups.set(r, []);
    if (!groups.get(r).includes(s)) groups.get(r).push(s);
  }
  let here = null; try { here = repoId(process.cwd()); } catch { /* not in a repository: name every one */ }
  const all = [...groups].flatMap(([r, ss]) => ss.map(s => (r === repo ? s : `${s} of ${r}`)));
  const also = all.length > 1 ? `; ${all.length - 1} other item(s) you read changed too (${all.slice(1).join(', ')})` : '';
  const how = [...groups].map(([r, ss]) => `${r && r !== here ? `in repository ${r}: ` : ''}backlog show ${ss.join(',')} --agent <you>`).join('; ');
  const e = new BacklogError('STALE_ITEM', `item ${slug} was changed by ${by || 'someone'} at ${at ?? 'an unknown time (it was moved or removed)'} after you last read it (${was})${also}; read ${all.length > 1 ? 'them' : 'it'} again (${how}) and retry`, STALE_EXIT);
  e.stale = { slug, by, at, was, groups, repo, text }; // text: the item as it is now
  return e;
}
// A refusal of a command over several repository folders (a cross-repository move) names the changed items the agent
// read in each of them, not only in the folder checked first: [[folder, repo],...]
export function widen(e, folders = []) {
  if (e?.code !== 'STALE_ITEM' || !e.stale || !folders.length) return e;
  const { slug, by, at, was, groups, repo, text } = e.stale;
  const others = [...groups].flatMap(([r, ss]) => ss.map(s => ({ repo: r, slug: s })));
  for (const [f, r] of folders) others.push(...staleViews(f, r, actor()).map(s => ({ repo: r, slug: s })));
  return staleError(slug, by, at, was, others, repo, text);
}

// The refusal of a write made on a stale view: the error, then the item as it is now (with --json, one object holding both), and the exit code.
export function reportStale(e, die, code) {
  const text = e?.code === 'STALE_ITEM' && e.stale?.text;
  if (!text) return die(e.message, code);
  const { fm, body } = parse(text);
  if (process.argv.includes('--json')) { process.stdout.write(`${JSON.stringify({ error: { code: e.code, message: e.message }, item: { front_matter: storedFm(fm), body } })}\n`); return code; }
  const out = die(e.message, code);
  const value = v => (typeof v === 'string' ? v : JSON.stringify(v));
  process.stdout.write(`--- current ${e.stale.slug} ---\n${Object.entries(fm).map(([k, v]) => `${k}: ${value(v)}`).join('\n')}\n\n${body.replace(/\n+$/, '')}\n`);
  return out;
}
// The items of folder the agent has read whose content changed since (or that are gone), by slug.
// rev: compare with that revision of the backlog home (a publication: origin/main), not the working tree
export function staleViews(folder, repo, agent, rev) {
  const out = [];
  for (const [key, v] of Object.entries(read(homeOf(folder), agent))) {
    if (!key.startsWith(`${repo}/`) || (v.folder && resolve(v.folder) !== resolve(folder))) continue;
    if (operation.getStore()?.guard.some(g => g.path === `${repo}/${v.path}`)) continue; // already checked in this command (and maybe written by it)
    try { const { sha, content } = rev ? revView(homeOf(folder), rev, `${repo}/${v.path}`) : fileView(folder, v.path); if (sha !== v.sha && !(v.content && v.content === content)) out.push(key.slice(repo.length + 1)); } catch { /* gone: a write to it fails on its own */ }
  }
  return out;
}

// path: the item file as it is now (after the leading pull).
export function check(folder, repo, agent, slug, path) {
  const seen = read(homeOf(folder), agent)[`${repo}/${slug}`];
  const { fm, sha, content } = fileView(folder, path);
  if (seen && seen.sha !== sha && !(seen.content && seen.content === content)) throw staleError(slug, fm.updated_by, fm.updated, `${seen.updated}${seen.updated_by ? ` by ${seen.updated_by}` : ''}`, staleViews(folder, repo, agent), repo, readItemText(join(folder, path)));
  const guard = operation.getStore()?.guard;
  if (guard && !guard.some(g => g.path === `${repo}/${path}`)) {
    // A retry may first encounter this item after rebasing. Protect the upstream
    // version just read, rather than treating that already-merged change as a race.
    const base = spawnSync('git', ['rev-parse', '--verify', originRef(homeOf(folder))], { cwd: homeOf(folder), encoding: 'utf8' }).stdout.trim();
    guard.push({ path: `${repo}/${path}`, slug, base, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` });
  }
  return seen?.sha;
}
