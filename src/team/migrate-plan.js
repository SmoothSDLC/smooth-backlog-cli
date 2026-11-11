// The plan of a folder (design chapter 06 sections 2, 4 and 5; chapter 05 section 2): what `backlog team migrate` would convert and every case that stops it.
// It reads and writes nothing: no lock, no team file, no sync. readFolder walks the folder; planFolder converts every markdown item with convertItem and adds the
// counter and the refs. Every failure names a file as <owner>/<name>/<path inside the folder>, never an absolute path.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { hasFrontMatter, parseMarkdownRaw } from '../shared/item-file.js';
import { BUILT_IN_ORDER } from '../shared/item-definition.js';
import { readDoc } from '../shared/item-json.js';
import { MAX_SEQ, counterLast, numberOf, seed } from '../shared/numbers.js';
import { git, itemFiles } from '../shared/store.js';
import { convertItem } from './migrate-convert.js';

const NAME_MAX = 255; // bytes of one file name
const stemOf = path => path.replace(/\.(md|json)$/, '');

// readFolder(dir) -> { dir, label, items, jsonCount, failures, hasTeamItem }
//   items: every item file of phases/ and archive/ (any depth), { kind: 'md' | 'json', path (relative to the folder), text, base (the file name without extension), archived, team, number };
//   a .md file without a header block is no item and is left out. failures: the stops that need no team file, git or conversion (link, number above the bound, JSON name taken or
//   too long, two holders of one number over markdown and JSON, live and archived), all of them. hasTeamItem: some item, markdown or JSON, carries a team.
export function readFolder(dir) {
  dir = resolve(dir);
  const label = dir.split(sep).slice(-2).join('/');
  const at = path => `${label}/${path}`;
  const { files, skipped, markdownPaths } = itemFiles(dir, { tolerant: true });
  const failures = [];
  for (const s of skipped) {
    failures.push(s.kind === 'link' ? `${at(s.path)}: Symlink destination is unsupported. Resolve it before using backlog.`
      : `${at(s.path)}: the number in the file name is above ${MAX_SEQ}; rename the file${s.path.endsWith('.md') ? ' in markdown' : ''} and run backlog team migrate again`);
  }
  const items = [];
  for (const path of [...markdownPaths, ...files].sort()) {
    const kind = path.endsWith('.md') ? 'md' : 'json';
    let text;
    try { text = readFileSync(`${dir}/${path}`, 'utf8'); } catch { failures.push(`${at(path)}: the file cannot be read`); continue; }
    if (kind === 'md' && !hasFrontMatter(text)) continue; // no header block: not an item
    let team, seq = null;
    try {
      if (kind === 'md') { const { fm } = parseMarkdownRaw(text); team = fm.team; seq = fm.seq; } else { const d = readDoc(text); team = d.team; seq = d.seq; }
    } catch { if (kind === 'md') team = /^team:[ \t]*[^\s#]/m.test(text) ? 'unknown' : undefined; } // a header that cannot be read is listed by the plan; it may still carry a team
    const base = basename(stemOf(path));
    items.push({ kind, path, text, base, archived: path.startsWith('archive/'), team: typeof team === 'string' && team !== '' ? team : undefined, number: numberOf(`${base}.md`) ?? (Number.isSafeInteger(seq) ? seq : null) });
  }
  const jsonNames = new Set(items.filter(i => i.kind === 'json').map(i => i.path));
  for (const i of items.filter(x => x.kind === 'md')) {
    if (jsonNames.has(`${stemOf(i.path)}.json`)) failures.push(`${at(stemOf(i.path))}.json exists; remove it or rename it`);
    if (Buffer.byteLength(`${i.base}.json`) > NAME_MAX) failures.push(`${at(i.path)}: the JSON file name would be too long; shorten the item's name in markdown and run again`);
  }
  // two holders of one number, whatever their extension; a .md and a .json of one stem are the one case "the JSON file name is taken"
  const holders = new Map();
  for (const i of [...items].sort((a, b) => a.archived - b.archived || (a.path < b.path ? -1 : 1))) {
    if (i.number === null) continue;
    const list = holders.get(i.number) ?? holders.set(i.number, []).get(i.number);
    if (!list.some(h => stemOf(h.path) === stemOf(i.path))) list.push(i);
  }
  for (const [n, list] of [...holders].sort((a, b) => a[0] - b[0])) {
    for (const other of list.slice(1)) failures.push(`${label}: number ${n} is held by ${list[0].base} and ${other.base}; give one of them a free number in markdown and run again`);
  }
  return { dir, label, items, jsonCount: items.filter(i => i.kind === 'json').length, failures, hasTeamItem: items.some(i => i.team !== undefined) };
}

// planFolder(read, { teams, repo }) -> { converted, jsonCount, failures, unresolved, counter, refs }
//   teams: the team file's entries by name, or none (only the field order of an item's team is read from it); repo: <owner>/<name>, the repository of the folder's items.
//   converted: [{ from, to, slug, seq, archived, json, item, doc, fm, body, warnings }] in path order; to is from with .json for .md (an archived item keeps its sub-path); item is the
//   loaded document, fm the markdown header (priority included) and body the markdown body. failures: readFolder's and one per header that cannot be read, then the counter's refusal.
//   unresolved: the depends_on entries that name no item. counter: numbers.seed of the folder (null when it was refused). refs: the refs whose history is read.
export function planFolder(read, { teams, repo } = {}) {
  const { dir, label } = read;
  const folderRepo = repo ?? label;
  const failures = [...read.failures], unresolved = [], converted = [];
  const slugs = new Map();
  for (const i of read.items) if (i.number !== null && !slugs.has(i.base)) slugs.set(i.base, i.number);
  for (const i of read.items.filter(x => x.kind === 'md')) {
    try {
      const order = i.team === undefined ? BUILT_IN_ORDER : Object.keys(teams?.[i.team]?.item ?? {});
      const c = convertItem(i.text, { folderRepo, slugs, order, fileName: i.base });
      converted.push({ from: i.path, to: `${stemOf(i.path)}.json`, slug: c.slug, seq: c.seq, archived: i.archived, json: c.json, item: c.item, doc: c.doc, fm: c.fm, body: c.body, warnings: c.warnings });
      for (const w of c.warnings) unresolved.push(`${label}/${i.path}: ${w}`);
    } catch (e) {
      if (!(e instanceof BacklogError)) throw e;
      failures.push(`${label}/${i.path}: ${e.message}; restore it with git and run backlog team migrate again`);
    }
  }
  let counter = null;
  try {
    counter = Math.max(seed(dir), ...read.items.map(i => i.number ?? 0), ...converted.map(c => c.seq)); // a number an item holds is never handed out again
  } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    if (e.code !== 'UNREADABLE_ITEM') failures.push(e.message); // a number above the bound in a file name is listed by the walk; the counter file is still checked
    else if (existsSync(`${dir}/numbers.json`)) { try { counterLast(dir); } catch (x) { failures.push(x.message); } }
  }
  return { converted, jsonCount: read.jsonCount, failures, unresolved, counter, refs: refsOf(dir) };
}

// The refs whose history the counter reads (highWater reads --all): every ref of the clone, tags, stash and remote branches included, and a detached HEAD.
function refsOf(dir) {
  let cwd = dir; while (!existsSync(cwd) && dirname(cwd) !== cwd) cwd = dirname(cwd);
  const r = git(['for-each-ref', '--format=%(refname:short)', 'refs/'], cwd);
  const refs = r.code ? [] : r.stdout.split('\n').filter(Boolean);
  if (git(['symbolic-ref', '-q', 'HEAD'], cwd).code && !git(['rev-parse', '--verify', '-q', 'HEAD'], cwd).code) refs.push('HEAD'); // a detached HEAD is read by --all too
  return refs;
}
