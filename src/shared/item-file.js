// The item-file seam: every read and every write of an item file goes through this module, so the file format lives in one place.
// An item is a JSON file (item-json.js is its codec). The callers hold the in-memory item ({ fm, body }) and the text of a file;
// this module is the only door between the two. The markdown reader of items made before the switch stays for the migration
// and for the check that stops a folder of markdown items.
import { readFileSync } from 'node:fs';
import { basename, posix } from 'node:path';
import { hasFrontMatter, parseItem as parseMarkdownItem, splitBom, storedFm } from './frontmatter.js';
import { fromItemJson, toItemJson } from './item-json.js';

// the codec doors: text of an item file to the in-memory item and back, and the stored form of the header
export const parseItem = fromItemJson;
export const dumpItem = toItemJson;
export { hasFrontMatter, parseMarkdownItem, splitBom, storedFm };

// The name scheme of item files: the one place that knows the extension and what a name, a slug and an item path look like.
export const ITEM_EXT = '.json';
const EXT_PATTERN = ITEM_EXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the slug of an item file: its file name without the extension (a path may lead up to it)
export const itemSlug = path => basename(path, ITEM_EXT);
// the same for a path that comes from git (always forward slashes): the POSIX flavour on every platform; itemSlug is for a path of the local disk
export const itemSlugOfGitPath = path => posix.basename(path, ITEM_EXT);
// the file name of an item (or the tail of one, '-name') from its slug
export const itemFileName = slug => `${slug}${ITEM_EXT}`;
// true for a file name that ends in the item extension
export const isItemName = name => name.endsWith(ITEM_EXT);
// a name without the item extension at its end (any other name is returned as it is)
export const stripItemExt = name => name.replace(new RegExp(`${EXT_PATTERN}$`), '');
// the source of a pattern part that matches the extension, for patterns built around it
export const ITEM_EXT_PATTERN = EXT_PATTERN;
// an item file path inside a repository folder: phases/<name> or archive/<any depth>/<name>
export const ITEM_PATH = new RegExp(`^(phases/[^/]+|archive/.+)${EXT_PATTERN}$`);

// The text of an item file, as it is on disk.
export const readItemText = path => readFileSync(path, 'utf8');
// The in-memory item { fm, body, ... } of an item file.
export const readItemFile = path => parseItem(readItemText(path));

// One event of an item's history is one line in the in-memory item: "<ts> <event> <branch|-> <commit|-> <note>" (the file holds entries, item-json.js).
export const eventLine = ({ ts, event, branch, commitSha, note }) => [ts, event, branch || '-', commitSha || '-', String(note ?? '').replace(/\s+/g, ' ').trim()].filter((x, i) => i < 4 || x).join(' ');
export function parseEvent(line) {
  const [, ts, event, branch, commit, note] = /^(\S+) (\S+) (\S+) (\S+)(?: (.*))?$/.exec(line) ?? [];
  return { ts, event, branch: branch === '-' ? '' : branch, commit_sha: commit === '-' ? '' : commit, note: note ?? '' };
}
