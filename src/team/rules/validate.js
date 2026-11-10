// The checks of the team file: its shape, the team names, the schema keys of an entry and of `rules`, the people and the item definition.
// `validate(file)` is total: any JSON value gives findings and never throws. A finding is
// { severity: 'error' | 'warning', team, path, rule, problem, fix }: `team` is null for a finding about the file, `path` is the JSON path inside
// the entry, `rule` the id of a rule or pop entry (or null), and every finding says how to fix it. Only errors refuse a command.
import { ENVELOPE, asList } from './expression.js';
import { checkRules } from './validate-rules.js';

export const TYPES = ['text', 'number', 'boolean', 'time', 'person', 'item', 'items', 'list'];
const LIST = ['items', 'list'];
// The schema: every kind of object with the keys it allows.
export const KEYS = {
  entry: ['people', 'item', 'rules'], rules: ['table', 'pop', 'filters'], field: ['type', 'description', 'default', 'values', 'final'],
  rule: ['id', 'step', 'when', 'deny', 'do'], pop: ['id', 'step', 'when'], filter: ['description', 'when'],
  do: ['set', 'add', 'remove', 'note', 'related', 'place', 'archive', 'delete', 'branch', 'team', 'say'],
  related: ['items', 'set', 'add', 'remove'], note: ['heading', 'text'], place: ['before', 'after'],
};
export const LABEL = { entry: 'a team entry', rules: 'rules', field: 'a field definition', rule: 'a rule', pop: 'a pop entry', filter: 'a filter', do: 'an effect list',
  related: 'a related entry', note: 'a note', place: 'a place' };
const TEAM_KEY = /^[a-z0-9][a-z0-9_:-]*$/;
const NAME = /^[a-z][a-z0-9_-]*$/;
const RULES_TYPE = { table: ['a list', Array.isArray, '[]'], pop: ['a list', Array.isArray, '[]'], filters: ['an object', o => isObj(o), '{}'] };

export const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const has = (o, k) => Object.hasOwn(o, k);
// The one way a value of the file is echoed in a message: JSON.stringify and join recurse, so a value nested 100000 deep must not reach them unguarded.
const show = v => { if (typeof v === 'string') return v; try { return JSON.stringify(v) ?? String(v); } catch { return '<a value nested too deeply>'; } };
const quote = v => (typeof v === 'string' ? JSON.stringify(v) : show(v));
const showAll = list => list.map(show).join(', ');

const distance = (a, b) => { const d = [...Array(b.length + 1).keys()]; for (const x of a) { let prev = d[0]++; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
export const closest = (k, allowed) => allowed.reduce((best, a) => (distance(k, a) < distance(k, best) ? a : best));
export const errors = findings => findings.filter(f => f.severity === 'error');

// The text of a team file: the parsed file, or the one finding that says why it cannot be read.
export function readTeamsText(text) {
  const bad = (problem, fix) => ({ finding: { severity: 'error', team: null, path: '', rule: null, problem, fix } });
  let file;
  try { file = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch (e) { return bad(`teams.json is not JSON (${e.message})`, 'correct the syntax at that place'); }
  return isObj(file) ? { file } : bad('the teams file must be an object with one entry per team', 'write {"<team>": {"people": ..., "item": ..., "rules": ...}}');
}

export function validate(file) {
  const out = [];
  if (!isObj(file)) return [{ severity: 'error', team: null, path: '', rule: null, problem: 'the teams file must be an object with one entry per team', fix: 'write {"<team>": {"people": ..., "item": ..., "rules": ...}}' }];
  for (const [team, e] of Object.entries(file)) {
    const say = (path, rule, problem, fix, severity = 'error') => out.push({ severity, team, path, rule, problem, fix });
    const keys = (obj, kind, path, rule = null) => { if (isObj(obj)) for (const k of Object.keys(obj)) if (!KEYS[kind].includes(k)) say(path ? `${path}.${k}` : k, rule, `${k} is not a key of ${LABEL[kind]}`, `did you mean ${closest(k, KEYS[kind])}? (${KEYS[kind].join(', ')})`); };
    if (!TEAM_KEY.test(team)) say('', null, `${team} is not a team name: lowercase letters, digits, - _ and :, starting with a letter or digit`, 'rename the team');
    if (!isObj(e)) { say('', null, `the entry of ${team} must be an object with people, item and rules`, 'write {"people": ..., "item": ..., "rules": ...}'); continue; }
    keys(e, 'entry', '');
    for (const k of KEYS.entry) if (!has(e, k)) say(k, null, `the entry has no ${k}`, `add ${k}`);
    if (isObj(e.rules)) {
      keys(e.rules, 'rules', 'rules');
      for (const [k, [what, ok, empty]] of Object.entries(RULES_TYPE)) {
        if (!has(e.rules, k)) say(`rules.${k}`, null, `rules has no ${k}`, `add "${k}": ${empty}`);
        else if (!ok(e.rules[k])) say(`rules.${k}`, null, `rules.${k} must be ${what}`, `write "${k}": ${empty}`);
      }
    } else if (has(e, 'rules')) say('rules', null, 'rules must be an object with table, pop and filters', 'write "rules": {"table": [], "pop": [], "filters": {}}');
    people(e, say);
    item(e, say, keys);
    if (isObj(e.rules)) checkRules({ team, entry: e, say, keys });
  }
  return out;
}

function people(e, say) {
  const { people: p } = e;
  if (has(e, 'people') && !isObj(p)) return say('people', null, 'people must be an object of person names and role lists', 'write "people": {"<name>": ["<role>"]}');
  if (!isObj(p) || !Object.keys(p).length) return say('people', null, 'the team has no person', 'add "people": {"<name>": ["<role>"]}');
  for (const [name, roles] of Object.entries(p)) {
    if (!/^[^\s,\u0000-\u001f\u007f-\u009f]{1,64}$/.test(name)) say(`people.${name}`, null, `${name} is not a plain name`, 'no space, no comma, no control character, at most 64 characters');
    if (!Array.isArray(roles) || !roles.length || roles.some(x => typeof x !== 'string' || !x)) say(`people.${name}`, null, `${name} has no role list`, `write "${name}": ["<role>", ...]`);
    else for (const x of new Set(roles.filter((y, i) => roles.indexOf(y) !== i))) say(`people.${name}`, null, `${name} has the role ${x} twice`, 'list each role once');
  }
}

// Whether x is one value of the type; a list type holds texts or item numbers.
const single = (type, x) => (type === 'number' ? typeof x === 'number' : type === 'boolean' ? typeof x === 'boolean' : type === 'item' ? x === null || Number.isInteger(x)
  : LIST.includes(type) ? typeof x === 'string' || Number.isInteger(x) : typeof x === 'string');

function item(e, say, keys) {
  const defs = e.item;
  if (has(e, 'item') && !isObj(defs)) say('item', null, 'item must be an object of field definitions', 'write "item": {"status": {"type": "text", "values": [...], "final": [...]}}');
  if (isObj(defs)) for (const [f, d] of Object.entries(defs)) field(f, d, say, keys);
  const st = isObj(defs) ? defs.status : undefined;
  if (!isObj(st) || !has(st, 'values')) return say('item.status', null, 'the item definition has no status field with values', 'add "status": {"type": "text", "values": [...], "final": [...]}');
  if (!Array.isArray(st.values)) return;
  if (!Array.isArray(st.final) || !st.final.length) say('item.status.final', null, 'the status field has no final values', 'add "final": [<the values that close an item>]');
  else for (const v of st.final.filter(v => !st.values.includes(v))) say('item.status.final', null, `final value ${show(v)} is not a value of status`, `use one of ${showAll(st.values)}`);
}

function field(f, d, say, keys) {
  const at = `item.${f}`;
  if (!isObj(d)) return say(at, null, `the field ${f} must be an object with a type`, `write "${f}": {"type": "text", "description": "..."}`);
  keys(d, 'field', at);
  if (ENVELOPE.includes(f)) say(at, null, `${f} is a key every item has already`, 'choose another field name');
  else if (!NAME.test(f)) say(at, null, `${f} is not a field name: lowercase letters, digits, - and _, starting with a letter`, 'rename the field');
  if (!TYPES.includes(d.type)) return say(`${at}.type`, null, has(d, 'type') ? `unknown type ${show(d.type)}` : `the field ${f} has no type`, `use ${TYPES.join(', ')}`);
  const fits = x => (LIST.includes(d.type) ? Array.isArray(x) && x.every(y => single(d.type, y)) : single(d.type, x));
  if (has(d, 'values') && (!Array.isArray(d.values) || !d.values.length || !d.values.every(x => single(d.type, x)) || new Set(d.values).size !== d.values.length)) say(`${at}.values`, null, `values must be a non-empty list of distinct ${d.type} values`, 'list each allowed value once');
  if (has(d, 'default')) {
    if (!fits(d.default)) say(`${at}.default`, null, `the default ${quote(d.default)} is not a ${d.type}`, `give a ${d.type} value`);
    else if (Array.isArray(d.values) && !(LIST.includes(d.type) ? asList(d.default).every(x => d.values.includes(x)) : d.values.includes(d.default))) say(`${at}.default`, null, `the default ${quote(d.default)} is not one of the values`, `use one of ${showAll(d.values)}`);
  }
  if (has(d, 'final') && f !== 'status') say(`${at}.final`, null, 'final belongs only to the status field', 'remove final here');
  if (typeof d.description !== 'string' || !d.description) say(at, null, `${f} has no description; agents read the descriptions`, 'add "description": "<what the field holds>"', 'warning');
}
