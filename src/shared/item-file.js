// The item-file seam: every read and every write of an item file goes through this module, so the file format lives in one place.
// Today an item is a markdown file with a front-matter header (frontmatter.js is its codec). The callers hold the in-memory item
// ({ fm, body }) and the text of a file; this module is the only door between the two.
import { readFileSync } from 'node:fs';
import { dump, dumpItem, hasFrontMatter, parse, parseItem, replaceItemFrontMatter, splitBom, storedFm } from './frontmatter.js';

// the codec doors: text of an item file to the in-memory item and back, and the stored form of the header
export { dump, dumpItem, hasFrontMatter, parse, parseItem, replaceItemFrontMatter, splitBom, storedFm };

// The text of an item file, as it is on disk.
export const readItemText = path => readFileSync(path, 'utf8');
// The in-memory item { fm, body, ... } of an item file.
export const readItemFile = path => parseItem(readItemText(path));

// One event of an item's history is one front-matter line: "<ts> <event> <branch|-> <commit|-> <note>".
export const eventLine = ({ ts, event, branch, commitSha, note }) => [ts, event, branch || '-', commitSha || '-', String(note ?? '').replace(/\s+/g, ' ').trim()].filter((x, i) => i < 4 || x).join(' ');
export function parseEvent(line) {
  const [, ts, event, branch, commit, note] = /^(\S+) (\S+) (\S+) (\S+)(?: (.*))?$/.exec(line) ?? [];
  return { ts, event, branch: branch === '-' ? '' : branch, commit_sha: commit === '-' ? '' : commit, note: note ?? '' };
}
