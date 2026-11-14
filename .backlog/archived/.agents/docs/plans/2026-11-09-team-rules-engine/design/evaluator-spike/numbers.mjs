// Spike of the never-reused item numbers (design chapter 05, owner ruling R12) on real git. The high-water mark of a repository folder
// is the highest number found in: every item file name ever added in the history the clone holds (all refs, merge commits included: -m), every `last` value ever
// committed to numbers.json, and the working tree. A number is handed out only above it, so a deleted item, a reverted creation, a
// lowered or deleted counter and a number another clone published and deleted are never handed out again. Not the implementation:
// no journal, no lock, no cache of the history scan (shortcut: the full log is read on each call; the implementation keeps the last
// scanned commit in .state and reads only newer commits).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const NUM = /(?:^|\/)(\d+)-[^/]*\.(?:json|md)$/;
// A number above this is never a real item number (R12 expects tens of thousands): in the history it is ignored, in the working tree the
// file is an unreadable item (review C M3; a number past 2^53 would otherwise make two allocations equal).
export const MAX_SEQ = 1e9;

export function highWater(cwd, folder, refs = ['--all'], { tree = true } = {}) {
  if (git(cwd, 'rev-parse', '--is-shallow-repository').trim() === 'true') throw new Error('the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow');
  let max = 0;
  const see = n => { const v = Number(n); if (v <= MAX_SEQ) max = Math.max(max, v); };
  for (const line of git(cwd, 'log', ...refs, '-m', '--format=', '--name-only', '--diff-filter=AR', '--', folder).split('\n')) { const m = NUM.exec(line); if (m) see(m[1]); }
  for (const line of git(cwd, 'log', ...refs, '-m', '-p', '--format=', '--', `${folder}/numbers.json`).split('\n')) { const m = /"last":\s*(\d+)/.exec(line); if (m) see(m[1]); }
  if (tree) {
    for (const sub of ['phases', 'archive']) { const d = join(cwd, folder, sub); if (existsSync(d)) for (const f of readdirSync(d, { recursive: true })) { const m = NUM.exec(String(f)); if (m && Number(m[1]) > MAX_SEQ) throw new Error(`${folder}/${sub}/${f}: the number in the file name is above ${MAX_SEQ}, so the item cannot be read; rename or remove the file`); if (m) see(m[1]); } }
    const counter = join(cwd, folder, 'numbers.json'); if (existsSync(counter)) see(JSON.parse(readFileSync(counter, 'utf8')).last ?? 0);
  }
  return max;
}

// A new item: the next number above the high-water mark, its file, and the counter.
export function allocate(cwd, folder, name) {
  const n = highWater(cwd, folder) + 1;
  mkdirSync(join(cwd, folder, 'phases'), { recursive: true });
  writeFileSync(join(cwd, folder, 'phases', `${String(n).padStart(3, '0')}-${name}.json`), `${JSON.stringify({ seq: n, name })}\n`);
  writeFileSync(join(cwd, folder, 'numbers.json'), `${JSON.stringify({ last: n })}\n`);
  return n;
}

// Team commands (owner decision 2026-11-09 on question 2: publish only the command's own commit). When upstream changed the command's
// own folder, only the command's own commit (HEAD) is dropped (git reset --keep HEAD~1; a person's commits and uncommitted changes stay),
// the pull with rebase brings upstream in, and the whole command runs again on the upstream files; when upstream changed only other
// folders, nothing the command read changed (R24) and the commit is kept as it is. The push then sends the command's own commit alone:
// when a person's unpushed commits lie below it, the commit is rebuilt on the upstream branch (git merge-tree, git commit-tree; the
// working tree is not touched), that commit is pushed, and the local branch is rebased onto it, so the person's commits stay local.
export function publishByRerun(cwd, rerun, folder) {
  git(cwd, 'fetch', '-q');
  if (Number(git(cwd, 'rev-list', '--count', 'HEAD..@{u}').trim())) {
    const touched = folder === undefined || git(cwd, 'diff', '--name-only', 'HEAD...@{u}', '--', folder).trim() !== '';
    if (touched) { git(cwd, 'reset', '-q', '--keep', 'HEAD~1'); git(cwd, 'pull', '-q', '--rebase', '--autostash'); rerun(); }
  }
  const [remote, ...rest] = git(cwd, 'rev-parse', '--abbrev-ref', '@{u}').trim().split('/');
  const up = git(cwd, 'rev-parse', '@{u}').trim();
  let own = git(cwd, 'rev-parse', 'HEAD').trim();
  if (git(cwd, 'rev-parse', 'HEAD~1').trim() !== up) {
    let tree;
    try { tree = git(cwd, 'merge-tree', '--write-tree', '--merge-base', 'HEAD~1', up, 'HEAD').trim().split('\n')[0]; }
    catch { throw Object.assign(new Error("the command's commit cannot be placed on the upstream branch without a conflict; nothing is published"), { exit: 3 }); }
    own = git(cwd, 'commit-tree', tree, '-p', up, '-m', git(cwd, 'log', '-1', '--format=%B').trim()).trim();
  }
  git(cwd, 'push', '-q', remote, `${own}:refs/heads/${rest.join('/')}`);
  if (own !== git(cwd, 'rev-parse', 'HEAD').trim()) git(cwd, 'rebase', '-q', '--autostash', own); // the command's local commit is the same change and drops out
}

// User commands: rebase (a conflict on numbers.json takes the larger value), then every item the local commits added whose number is
// not above the upstream high-water mark is renumbered above it.
export function publishByRebase(cwd, folder) {
  git(cwd, 'fetch', '-q');
  try { git(cwd, 'rebase', '-q', '@{u}'); } catch {
    const side = s => { try { return JSON.parse(git(cwd, 'show', `:${s}:${folder}/numbers.json`)).last; } catch { return 0; } };
    writeFileSync(join(cwd, folder, 'numbers.json'), `${JSON.stringify({ last: Math.max(side(2), side(3)) })}\n`);
    git(cwd, 'add', `${folder}/numbers.json`);
    execFileSync('git', ['rebase', '--continue'], { cwd, env: { ...process.env, GIT_EDITOR: 'true' }, stdio: 'ignore' });
  }
  const up = highWater(cwd, folder, ['@{u}'], { tree: false });
  const added = git(cwd, 'log', '@{u}..HEAD', '--format=', '--name-only', '--diff-filter=A', '--', folder).split('\n').filter(l => NUM.test(l));
  let next = up;
  for (const path of added.sort()) {
    const n = Number(NUM.exec(path)[1]);
    if (n > up) { next = Math.max(next, n); continue; }
    next += 1;
    const to = path.replace(/\/\d+-/, `/${String(next).padStart(3, '0')}-`);
    git(cwd, 'mv', path, to);
    writeFileSync(join(cwd, to), `${JSON.stringify({ ...JSON.parse(readFileSync(join(cwd, to), 'utf8')), seq: next })}\n`);
  }
  if (next > up) { writeFileSync(join(cwd, folder, 'numbers.json'), `${JSON.stringify({ last: Math.max(next, highWater(cwd, folder)) })}\n`); git(cwd, 'add', '-A', folder); git(cwd, 'commit', '-q', '-m', 'backlog: renumbered'); }
  git(cwd, 'push', '-q');
}

// The migration's seed for its own folder (R24): the high-water mark of the folder's whole history, deleted item files included.
export const seed = (cwd, folder) => highWater(cwd, folder);
