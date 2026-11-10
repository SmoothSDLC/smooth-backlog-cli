// Item numbers that are never handed out twice (owner ruling R12). The HIGH-WATER MARK of a repository folder is the highest number found in
// (a) the name of every item file ever added or renamed-to under <folder>/phases or <folder>/archive in the history of every ref the clone
// holds, merge commits included (-m: without it git shows no change of a merge commit), (b) every `last` value ever committed to
// <folder>/numbers.json, and (c) the working tree: the item files present and the current numbers.json. A new number is the mark plus one,
// so a deleted, cleaned or archived item, a reverted creation and a lowered or deleted numbers.json never give a number again.
// Only the folder's own paths are read (ruling R24). The history scan is repeated on every allocation: no cache is kept.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { git, writeText } from './store.js';

export const NUMBER_FILE = 'numbers.json';
// A number above this is never a real item number: in the history it is ignored, in the working tree the file is an unreadable item
// (a number past 2^53 would otherwise make two allocations equal).
export const MAX_SEQ = 1e9;
const NUM = /(?:^|\/)(\d+)-[^/]*\.(?:json|md)$/; // an item file name: .md or .json
const ITEM_DIR = /^(?:phases|archive)\//;

const history = (cwd, args) => {
  const r = git(args, cwd);
  if (r.code) throw new BacklogError('STORAGE_ERROR', `cannot read the history of the backlog folder (git ${args[0]} failed); no number was handed out`, 1);
  return r.stdout;
};

// The refusal for an item file whose number is above the bound: names the file, never its path.
export const tooBig = name => new BacklogError('UNREADABLE_ITEM', `item ${name}: the number in the file name is above ${MAX_SEQ}, so the item cannot be read; rename or remove the file`, 2);
export const numberOf = name => { const m = NUM.exec(name); return m ? Number(m[1]) : null; };

// The highest number the folder (an absolute path) ever held. refs: what the history scan reads; tree: also read the working tree.
export function highWater(folder, { refs = ['--all'], tree = true } = {}) {
  folder = resolve(folder);
  let max = 0;
  const see = n => { const v = Number(n); if (v <= MAX_SEQ) max = Math.max(max, v); };
  let cwd = folder; while (!existsSync(cwd) && dirname(cwd) !== cwd) cwd = dirname(cwd);
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (!top.code) { // inside a git repository: the history counts; elsewhere there is none
    if (git(['rev-parse', '--is-shallow-repository'], cwd).stdout.trim() === 'true') {
      throw new BacklogError('SHALLOW_CLONE', 'the backlog clone is shallow, so numbers cannot be proven unused: run git fetch --unshallow', 2);
    }
    const rel = relative(cwd, folder).split(sep).join('/');
    const at = `${git(['rev-parse', '--show-prefix'], cwd).stdout.trim()}${rel ? `${rel}/` : ''}`; // the folder's place from the top of the repository
    const spec = rel || '.';
    for (const path of history(cwd, ['log', ...refs, '-m', '--format=', '--name-only', '-z', '--diff-filter=AR', '--', spec]).split('\0')) {
      if (!path.startsWith(at)) continue;
      const own = path.slice(at.length);
      const m = ITEM_DIR.test(own) && NUM.exec(own);
      if (m) see(m[1]);
    }
    for (const line of history(cwd, ['log', ...refs, '-m', '-p', '--format=', '--', `${spec === '.' ? '' : `${spec}/`}${NUMBER_FILE}`]).split('\n')) {
      const m = /"last":\s*(\d+)/.exec(line);
      if (m) see(m[1]);
    }
  }
  if (tree) {
    for (const sub of ['phases', 'archive']) {
      const dir = join(folder, sub);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir, { recursive: true })) {
        const m = NUM.exec(String(f).split(sep).join('/'));
        if (!m) continue;
        if (Number(m[1]) > MAX_SEQ) throw tooBig(posix.basename(String(f).split(sep).join('/')));
        see(m[1]);
      }
    }
    const counter = join(folder, NUMBER_FILE);
    if (existsSync(counter)) {
      let last;
      try { last = JSON.parse(readFileSync(counter, 'utf8')).last; } catch { /* checked below */ }
      if (!Number.isInteger(last) || last < 0) throw new BacklogError('STORAGE_ERROR', `${NUMBER_FILE} cannot be read (it must hold {"last": <number>}); restore it from the repository history or remove it`, 2);
      see(last);
    }
  }
  return max;
}

// The text of numbers.json for the number last handed out.
export const counterText = n => `${JSON.stringify({ last: n })}\n`;

// Records that n was handed out: numbers.json beside index.json, written through the store's journalled write, so it is undone with the
// item when the command fails and is committed with it. Never lowers the recorded value.
export function record(folder, n) {
  const path = join(folder, NUMBER_FILE);
  let last = 0;
  try { last = Number(JSON.parse(readFileSync(path, 'utf8')).last) || 0; } catch { /* no record yet */ }
  if (last === n && existsSync(path)) return;
  writeText(path, counterText(Math.max(n, last)), folder);
}

// The migration's seed for its own folder: the mark of the folder's whole history, deleted item files included. Exported for the migration.
export const seed = folder => highWater(folder);
