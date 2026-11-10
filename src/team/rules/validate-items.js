// The checks of the repository's items and numbers against the team file. Both are total: odd input gives findings or nothing, never a throw.
// A finding has the shape of validate.js: { severity, team, path, rule: null, problem, fix }.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isForeign } from '../../shared/dependencies.js';
import { NUMBER_FILE, highWater, numberOf } from '../../shared/numbers.js';
import { isObj, single } from './validate.js';

const show = v => { if (typeof v === 'string') return v; try { return JSON.stringify(v) ?? String(v); } catch (e) { return e instanceof TypeError && /circular|BigInt/.test(e.message) ? '<a value that cannot be shown>' : '<a value nested too deeply>'; } };
const asList = v => (Array.isArray(v) ? v : [v]);
const isNil = v => v === null || v === undefined;
// A stored value fits its field's type by the same rules the definition's defaults follow; a reference to another repository's item is text of the form owner/name#n.
const fits = (type, v) => (['list', 'items'].includes(type) ? Array.isArray(v) && v.every(x => single(type, x) || (type === 'items' && typeof x === 'string' && isForeign(x)))
  : single(type, v) || (type === 'item' && typeof v === 'string' && isForeign(v)));

// items: the live items of the folder, { path, seq, team, fields }, path being the item file as <owner>/<name>/phases/<name>.json. Archived items are skipped.
const resolves = (foreign, id) => { try { return foreign?.(id); } catch { return null; } };
// options: team (the one team asked for; with all, or without team, every team), foreign(id) (an item, null or undefined for a reference
// that cannot be told; without it foreign references are not checked), seqs (every item number of the folder, archived ones included; default: the live items').
export function itemFindings(file, items, { team: only, all = false, foreign, seqs } = {}) {
  const out = [];
  if (!Array.isArray(items)) return out;
  const live = items.filter(i => isObj(i) && !/^[^/]+\/[^/]+\/archive\//.test(String(i.path ?? '')));
  const known = seqs instanceof Set ? seqs : new Set(live.map(i => i.seq));
  for (const it of live) {
    const { path, team } = it;
    if (typeof team !== 'string' || !team || (!all && only && team !== only)) continue;
    const say = (severity, problem, fix) => out.push({ severity, team, path: String(path ?? ''), rule: null, problem, fix });
    const entry = isObj(file) && Object.hasOwn(file, team) ? file[team] : undefined;
    if (entry === undefined) { say('error', `team ${team} has no entry in teams.json`, 'add the entry back, or run backlog team migrate, which unbinds the items of teams without an entry with the record of chapter 06 section 4.1'); continue; }
    const n = numberOf(basename(String(path ?? '')));
    if (n !== null && it.seq !== n) say('error', `seq ${show(it.seq)} differs from the file name's number ${n}`, 'restore the file; the high-water mark reads file names only');
    const defs = isObj(entry) && isObj(entry.item) ? entry.item : null;
    if (!defs || !isObj(it.fields)) continue;
    if (Array.isArray(defs.status?.values) && (isNil(it.fields.status) || it.fields.status === '')) say('error', 'the status of the item is missing; the definition requires one of its status values', `move the item with a step, or restore the file; status is one of ${defs.status.values.map(show).join(', ')}`);
    for (const [name, value] of Object.entries(it.fields)) {
      const def = Object.hasOwn(defs, name) ? defs[name] : undefined;
      if (!isObj(def)) { say('warning', `field ${name} is not declared by the item definition of team ${team}; rules cannot read it`, `declare it in ${team}.item, or move its value with a step and remove it`); continue; }
      if (!isNil(value) && typeof def.type === 'string' && !fits(def.type, value)) { say('error', `the value of ${name} is not a ${def.type}`, `correct it with backlog team update, or restore the file; the definition says ${name} is a ${def.type}`); continue; }
      if (Array.isArray(def.values) && !isNil(value)) {
        const bad = (def.type === 'list' ? asList(value) : [value]).filter(x => !def.values.some(v => v === x));
        for (const x of bad) say('error', `${name} ${typeof x === 'string' ? JSON.stringify(x) : show(x)} is not a value of ${name} of team ${team}`, 'add the value back, or move the item with a step');
      }
      if ((def.type === 'item' || def.type === 'items') && !isNil(value)) {
        for (const ref of asList(value)) {
          const far = typeof ref === 'string' && isForeign(ref);
          if (far ? resolves(foreign, ref.trim()) === null : !known.has(ref)) {
            say('warning', `field ${name} names no item ${show(ref)}`, 'the item\'s other steps still work; a step that writes the field must drop the number');
          }
        }
      }
    }
  }
  return out;
}

// The folder's numbers.json against the highest number its history and files ever held. folder: the repository's folder of the backlog clone.
export function numberFindings({ folder } = {}) {
  const dir = resolve(String(folder ?? ''));
  const label = `${basename(dirname(dir))}/${basename(dir)}`;
  const path = `${label}/${NUMBER_FILE}`;
  const say = (severity, problem, fix) => [{ severity, team: null, path, rule: null, problem, fix }];
  let mark;
  try { mark = highWater(dir); } catch (e) {
    if (e?.code === 'SHALLOW_CLONE') return say('warning', 'the clone is shallow: numbers are checked only against the history it holds', 'git fetch --unshallow');
    return say('error', String(e?.message ?? e), 'restore the file or the history it names');
  }
  const file = join(dir, NUMBER_FILE);
  let last;
  try { if (existsSync(file)) last = JSON.parse(readFileSync(file, 'utf8')).last; } catch { return []; } // highWater has refused an unreadable file above
  return Number.isInteger(last) && last < mark
    ? say('warning', `${label}/${NUMBER_FILE} says ${last}, but number ${mark} was used`, `the next allocation uses the mark anyway; set last to ${mark} to make the file say so`) : [];
}
