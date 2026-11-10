// `backlog update`. The flags and steps of a team (claims, reviews, stages, hand-offs) come from `team`, the object `backlog team update` passes in.
// in the earlier scripts order: pull, resolve the item, change, write the file, log the event, scan into
// the index, planning event (--priority move, completion, --replan), commit and push. The item is found by number
// (seq) or slug. Without `team` an item is edited by its fields and body only.
// shortcut: argparse's unique-prefix abbreviations (--stat) are not accepted.
import { join } from 'node:path';
import { BacklogError } from '../errors.js';
import { itemSlug, readItemFile } from './item-file.js';
import { find as findItem, rows as itemRows } from './index.js';
import { repairUnreadable } from './repair.js';
import { isOpen, lifted, normalise } from './status.js';
import { assertInside, itemSelector, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { plainStep, claimOf } from './plain-step.js';
import { wipRefusal } from './wip-limits.js';
import { seam } from './seam.js';
import { asList, rstrip, strip } from './text.js';
import { foreignCycle, foreignItem, isForeign } from './dependencies.js';
import { OF_A_TEAM, REPLAN_TEAM } from './team-items.js';
import { MAX_SEQ, record as recordNumber } from './numbers.js';

const SETTABLE = ['status', 'branch', 'commit', 'location', 'summary', 'priority', 'name', 'objective', 'seq', 'size_score'];
const VALUE = [...SETTABLE, 'append', 'section', 'set-lines', 'add-line', 'remove-line', 'move-line', 'replan', 'note', 'set-estimate', 'set-complexity', 'set-layer', 'set-depends-on', 'set-chunk', 'severity', 'by', 'claim', 'release', 'reason'];
const BOOL = ['dry-run', 'restore', 'top', 'close'];
const CHOICES = { 'set-complexity': ['low', 'medium', 'high'], 'set-layer': ['1', '2', '3', '4', '5', 'process'], 'set-chunk': ['yes', 'no'], severity: ['normal', 'critical'] };

// backlog team update refuses --status (the status of a team item moves by its steps); the plain command's own line is OF_A_TEAM.
const NO_STATUS_FLAG = 'backlog team update takes no --status: the status of a team item moves by its steps (--claim, --request-review, --start-review, --review, --close)';
const pyInt = s => (/^\s*[+-]?\d+\s*$/.test(s) ? Number(s) : null);
// Python repr of a str, for the earlier scripts `{x!r}` and dict/list prints.
function pyStr(s) {
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
const pyVal = v => (typeof v === 'number' ? String(v) : pyStr(v));

const usage = message => new BacklogError('INVALID_INPUT', message); // argparse errors: exit 2
// A token that argparse takes as a value or positional: no leading dash, a lone dash, a negative number, or a space inside.
const valueLike = s => s !== undefined && (!s.startsWith('-') || s === '-' || /^-(\d+|\d*\.\d+)$/.test(s) || s.includes(' '));

// argparse.
// `team` adds the flags of the team steps: { bool, value, choices, verdict: { flags whose value is a verdict, words: synonyms } }.
function parse(argv, team) {
  const bool = [...BOOL, ...(team?.bool ?? [])]; const value = [...VALUE, ...(team?.value ?? [])]; const choices = { ...CHOICES, ...team?.choices };
  const a = {}; let past = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!past && tok === '--') { past = true; continue; }
    const [flag, eq] = tok.startsWith('--') ? tok.slice(2).split(/=(.*)/s) : [null];
    const known = [...bool, ...value].includes(flag); // argparse: an option, even with a space in its =value
    if (past || (!known && valueLike(tok))) {
      if (a.phase !== undefined) throw usage(`unrecognized arguments: ${tok}`);
      a.phase = tok;
      continue;
    }
    if (bool.includes(flag)) {
      if (eq !== undefined) throw usage(`argument --${flag}: ignored explicit argument ${pyStr(eq)}`);
      a[flag] = true;
    } else if (value.includes(flag)) {
      const v = eq ?? (valueLike(argv[i + 1]) ? argv[++i] : undefined);
      if (v === undefined) throw usage(`argument --${flag}: expected one argument`);
      if (flag === 'set-estimate' && pyInt(v) === null) throw usage(`argument --${flag}: invalid int value: ${pyStr(v)}`);
      const word = team?.verdict?.flags.includes(flag) ? team.verdict.words[v] ?? v : v;
      if (choices[flag] && !choices[flag].includes(word)) throw usage(`argument --${flag}: invalid choice: ${pyStr(v)} (choose from ${choices[flag].join(', ')})`);
      a[flag] = word;
    } else throw usage(`unrecognized arguments: ${tok}`);
  }
  checkSection(a);
  return a;
}

// --section "<Heading>" with exactly one of --set-lines, --add-line (--top), --remove-line <n>, --move-line <n>:<position>.
const SECTION_OPS = ['set-lines', 'add-line', 'remove-line', 'move-line'];
function checkSection(a) {
  const ops = SECTION_OPS.filter(k => a[k] !== undefined);
  if (a.section === undefined && !ops.length && !a.top) return;
  if (a.section === undefined || !strip(a.section) || a.section.includes('\n')) throw usage('--section needs the heading of one section of the body (one line)');
  if (ops.length !== 1) throw usage(`--section needs exactly one of ${SECTION_OPS.map(k => `--${k}`).join(', ')}`);
  if (a.top && ops[0] !== 'add-line') throw usage('--top goes with --add-line');
  if (ops[0] === 'add-line' && (!strip(a['add-line']) || a['add-line'].includes('\n'))) throw usage('--add-line takes one entry on one line');
  if (ops[0] === 'remove-line' && !(pyInt(a['remove-line']) > 0)) throw usage('--remove-line takes the number of the line, from 1');
  if (ops[0] === 'move-line' && !/^[1-9]\d*:[1-9]\d*$/.test(a['move-line'])) throw usage('--move-line takes <line>:<position>, both from 1');
}

// The body with the `## <heading>` block changed and every other byte as it was (a missing block is created at the end).
// Entries are the block's `- ` lines; other lines of the block stay where they are.
// shortcut: --set-lines text is written as given (a line "## x" in it starts a new section), a "## " line inside a code fence ends a block, and new lines carry \n even in a CRLF body; upgrade if bodies need that.
export function editSection(body, heading, a) {
  const lines = body.split('\n');
  const at = lines.findIndex(l => l.trimEnd() === `## ${heading}`);
  const next = lines.findIndex((l, i) => i > at && l.startsWith('## '));
  const end = at === -1 || next === -1 ? lines.length : next;
  const block = at === -1 ? [] : lines.slice(at + 1, end);
  while (block.length && !block[0].trim()) block.shift();
  while (block.length && !block.at(-1).trim()) block.pop();
  const slots = block.flatMap((l, i) => (l.startsWith('- ') ? [i] : []));
  const need = n => (n <= slots.length ? null : { refuse: `the section ${heading} has ${slots.length} line(s), no line ${n}` });
  if (a['set-lines'] !== undefined) {
    let list = null;
    try { list = JSON.parse(a['set-lines']); } catch { /* text as given */ }
    block.splice(0, block.length, ...(Array.isArray(list) ? list.map(x => `- ${x}`) : a['set-lines'].split('\n')));
  } else if (a['add-line'] !== undefined) {
    block.splice(a.top ? slots[0] ?? 0 : slots.length ? slots.at(-1) + 1 : block.length, 0, `- ${a['add-line']}`);
  } else if (a['remove-line'] !== undefined) {
    const n = pyInt(a['remove-line']); const no = need(n); if (no) return no;
    block.splice(slots[n - 1], 1);
  } else {
    const [n, position] = a['move-line'].split(':').map(Number); const no = need(n); if (no) return no;
    const entries = slots.map(i => block[i]); const [moved] = entries.splice(n - 1, 1);
    entries.splice(Math.min(position, entries.length + 1) - 1, 0, moved);
    slots.forEach((i, k) => { block[i] = entries[k]; });
  }
  const text = block.length ? `## ${heading}\n\n${block.join('\n')}\n` : `## ${heading}\n`;
  if (at === -1) return { body: `${rstrip(body)}${rstrip(body) ? '\n\n' : ''}${text}` };
  const after = lines.slice(end);
  return { body: `${lines.slice(0, at).join('\n')}${at ? '\n' : ''}${text}${after.length ? `\n${after.join('\n')}` : ''}` };
}

const say = text => process.stdout.write(`${redact(text)}\n`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const refuse = message => { say(`❌ ${message}`); return 1; }; // 's refusals: stdout, exit 1

export async function run(argv, { team = null } = {}) {
  if (!team && argv.length === 0) { process.stdout.write((await import('../help.js')).HELP.update); return 2; } // nothing named: the help of update, never an install (backlog upgrade is the self-update)
  try { return await update(argv, team); } catch (e) { return seen.reportStale(e, die, e instanceof BacklogError ? e.exitCode : 1); }
}

async function update(argv, team) {
  const a = parse(argv, team);
  seen.setActor(a.by ?? a.claim ?? a.release);
  a.named = Boolean(a.by ?? a.claim ?? a.release);
  const { home } = store.resolveHome();
  let repo; let folder;
  try { repo = seam.scope().repo || store.repoId(process.cwd()); folder = store.folder(home, repo); } catch (e) { return die(e.message); } //
  return store.cloneLocked(home, async () => { // the run lock: from the pull to the push
    await sync.pull(home); // every script works on origin/main as it is now
    const code = await store.undoOnThrow(folder, () => change(a, folder, repo, team)); // refuses a link at the owner or the repository folder
    if (code || a['dry-run']) return code;
    // the agent a command names goes into the commit subject (session names with colons are audit data too);
    // the actor the step acts as (a.by ?? a.claim ?? a.release), whatever the order of the options
    const subjectParts = ['update', ...argv.slice(0, 2)];
    const agent = a.by ?? a.claim ?? a.release;
    if (agent !== undefined) subjectParts.push(agent);
    const pairs = await sync.commitSettled(home, folder, subjectParts.join(' '), a.guard, a.claims);
    seen.recordWrites(folder, repo, seen.actor(), a.wrote ? [a.wrote] : [], pairs); // after the push, including a pure replan
    if (a.shutdown) process.stdout.write(`${team.shutdown(a.shutdown)}\n`); // after anything the publication prints
    return 0;
  });
}

// The slug of an item whose dependency chain (the files' depends_on, from deps on) leads back to `id`; `id` itself when deps names it. null: no cycle.
function dependencyCycle(rows, folder, id, deps) {
  const edges = new Map();
  for (const i of store.load(folder)) { const r = findItem(rows, String(i.fm.phase || itemSlug(i.path))); if (r) edges.set(r.id, { slug: r.slug, deps: asList(i.fm.depends_on) }); }
  const seen = new Set();
  const walk = list => {
    for (const d of list) {
      const r = d === '' || d === null ? null : findItem(rows, String(d));
      if (!r) continue;
      if (r.id === id) return id;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (walk(edges.get(r.id)?.deps ?? [])) return edges.get(r.id)?.slug ?? r.slug;
    }
    return null;
  };
  return walk(deps);
}

async function change(a, folder, repo, team) {
  const bad = store.unreadable(folder); // an item that cannot be read: only its own repair goes on, every other command refuses
  if (bad) {
    const done = await repairUnreadable(a, folder, bad);
    if (done !== undefined) return done;
  }
  const { rows, items } = itemRows(folder);
  // --- pure planning event: explicit replan of the whole backlog
  if (a.replan) {
    const idents = a.replan.split(',').map(strip).filter(Boolean);
    if (!team) { // a team item takes its place in the queue by backlog team update only
      const owned = idents.map(ident => findItem(rows, ident)).filter(r => r && items.find(i => i.path === r.path)?.fm.team).map(r => r.slug);
      if (owned.length) return refuse(REPLAN_TEAM([...new Set(owned)]));
    }
    for (const ident of idents) { // a bound team session reorders only its own items: naming another team's item is refused, before anything is written
      const named = findItem(rows, ident);
      const outside = named && team?.refuseOutside(named);
      if (outside) return refuse(outside);
    }
    if (a['dry-run']) { say(`ℹ️  [dry-run] would replan backlog leading order: [${idents.map(pyStr).join(', ')}]`); return 0; }
    a.guard = [];
    const order = store.reorder(folder, idents);
    say('📋 PLANNING EVENT — backlog re-prioritized (P0 = next):');
    for (const [s, i] of order) say(`   P${i}  ${s}`);
    return 0;
  }

  if (!a.phase) return refuse('phase is required (or use --replan "id,id,...")');
  const row = findItem(rows, a.phase);
  if (!row) return refuse(`no phase ${pyStr(a.phase)} (create it with backlog new)`);
  if (row.status === 'archived') return refuse(`${row.slug} is archived and cannot be edited (archived items are read-only)`); // covers --claim, --request-review, --review and --close too

  const path = join(folder, row.path);
  await assertInside(folder, path); // no symlink between the folder and the item file
  const { fm, body: text } = lifted(readItemFile(path));
  if (fm.team && !team) return refuse(OF_A_TEAM); // a team's item is changed by backlog team update only
  const statusBefore = fm.status; // the close gate (059.3) runs on the pre-transition status
  seen.check(folder, repo, seen.actor(), row.slug, row.path); // refuses (exit 5) when someone else changed the item since this agent read it
  a.guard = [{ path: `${repo}/${row.path}`, slug: row.slug, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` }];
  a.claims = team ? team.claims(a, fm, folder, row) : a.claim ? [claimOf(a.claim, { folder, path: row.path, reclaim: fm.claimed_by === a.claim && fm.status === 'in progress' })] : [];
  let body = text;
  const changes = {};
  if (a.status !== undefined) {
    const outside = team?.refuseOutside(row); // a session bound to another repository or branch is told so first
    if (outside) return refuse(outside);
    if (fm.team) return refuse(team ? NO_STATUS_FLAG : OF_A_TEAM);
    a.status = normalise(a.status);
    if (a.status === 'archived') return refuse("--status 'archived': backlog archive moves a finished item to archive/");
  }
  let seqTaken = null; // a --seq above the mark: numbers.json follows it
  let moveTarget = null; // --priority is a move-to-rank, applied via reflow (stays dense)
  for (const k of SETTABLE) {
    const v = a[k];
    if (v === undefined) continue;
    if (k === 'branch') return refuse('--branch is not changed by backlog update; use backlog move to move an item to another branch'); // identity field (owner rule 2026-10-11)
    if (k === 'commit' && !strip(v)) return refuse('--commit cannot be cleared');
    let n;
    if (['priority', 'seq', 'size_score'].includes(k) && (n = pyInt(v)) === null) throw new BacklogError('INVALID_INPUT', `invalid literal for int() with base 10: ${pyStr(v)}`, 1);
    if (k === 'status' && v === 'in progress' && fm.status !== 'in progress') { // starting work by status is starting work
      const wip = team ? team.startRefusal(a, { folder, repo, fm, slug: row.slug }) : wipRefusal(folder, repo, fm, row.slug);
      if (wip) return refuse(`${row.slug}: ${wip}`);
    }
    if (k === 'seq') { // the number selects the item: another item (archived ones too) holding it would make every numeric selector ambiguous
      if (n > MAX_SEQ) return refuse(`--seq ${n} is above the highest number the CLI can use (${MAX_SEQ})`);
      const held = rows.find(r => Number(r.seq) === n && r.id !== row.id)?.slug
        ?? store.load(folder).find(i => Number(i.fm.seq) === n && i.fm.phase !== row.slug)?.fm.phase;
      if (held) return refuse(`--seq ${n} is already item ${held}; the number must stay unique`);
      const own = a.seqRepaired; // the repair of an unreadable seq decided the number before it wrote it
      const by = own ? [] : store.load(folder).filter(i => i.fm.phase !== row.slug && asList(i.fm.depends_on).some(d => d === row.slug || (/^\d+$/.test(String(d)) && Number(d) === Number(row.seq)))).map(i => i.fm.phase ?? i.path);
      if (by.length) return refuse(`${by.join(', ')} depend${by.length > 1 ? '' : 's'} on ${row.slug}, which a new number would leave them pointing at nothing; clear or repoint them first: update <dependent> --set-depends-on <ids|none>`);
      const high = store.mark(folder);
      if (n <= high && !own) return refuse(`--seq ${n} is not above the highest number ever used in ${repo} (${high}); numbers are never reused`);
      seqTaken = n;
    }
    if (k === 'priority') { moveTarget = n; continue; }
    fm[k] = k === 'seq' || k === 'size_score' ? n : v;
    changes[k] = v;
  }
  const begun = team?.begin(fm, body); // the item as it is before this call
  if (team) { const no = team.fieldsBefore(a, { fm, folder, repo, slug: row.slug, changes }); if (no) return refuse(no); }
  if (a['set-chunk'] !== undefined) { fm.chunk = a['set-chunk'] === 'yes'; changes.chunk = a['set-chunk']; } //
  if (a.severity !== undefined) { fm.severity = a.severity; changes.severity = a.severity; } // new sets it, update changes it
  for (const [k, v] of [['estimate_min', a['set-estimate'] === undefined ? undefined : pyInt(a['set-estimate'])], ['complexity', a['set-complexity']], ['layer', a['set-layer']]]) {
    if (v === undefined) continue;
    if (k === 'estimate_min' && v <= 0) return refuse('--set-estimate: minutes must be > 0');
    fm[k] = v;
    changes[k] = v;
  }
  if (a['set-depends-on'] !== undefined) {
    const deps = [];
    for (const d of asList(a['set-depends-on'])) {
      if (isForeign(d)) { if (!foreignItem(folder, d)) return refuse(`--set-depends-on: no item ${pyStr(d)} in the backlog repository`); }
      else if (!findItem(rows, d)) return refuse(`--set-depends-on: no item ${pyStr(d)} in this backlog`);
      deps.push(/^\d+$/.test(d) ? Number(d) : d);
    }
    const cycle = dependencyCycle(rows, folder, row.id, deps);
    if (!cycle && foreignCycle(folder, repo, row.seq, deps)) return refuse(`--set-depends-on: it would make a dependency cycle through another repository's items back to ${repo}#${row.seq}`);
    if (cycle) return refuse(`--set-depends-on: ${cycle === row.id ? 'an item cannot depend on itself' : `it would make a dependency cycle through ${cycle}`}`);
    fm.depends_on = deps;
    changes.depends_on = deps.join(',') || 'none';
  }
  if (team) team.fieldsAfter(a, { fm, changes });
  const holder = fm.claimed_by || '';
  const todo = team ? team.step(a, { fm, body, begun, slug: row.slug, folder, repo, statusBefore, given: [...SETTABLE, 'severity'].filter(k => a[k] !== undefined) }) : plainStep(a, { fm, slug: row.slug, folder, repo }); // --severity is a field edit too
  if (todo.refuse) return refuse(todo.refuse);
  const { event } = todo;
  if (todo.text) {
    changes[event] = todo.headline;
    body = `${rstrip(body)}\n\n${todo.text}\n`;
  }
  if (team) body = team.after(a, { fm, body, event });
  if (team && a.status === 'closed' && event !== 'closed') { // --status closed is a close: the team's review rules and hand-off gate
    const gate = team.closeStatus({ fm, statusBefore, folder, repo, slug: row.slug });
    if (gate.refuse) return refuse(gate.refuse);
    if (gate.fm) {
      Object.assign(fm, gate.fm);
      changes.handoffs = 'none';
    }
    if (gate.text) body = `${rstrip(body)}\n\n${gate.text}\n`;
  }
  const completing = a.status === 'closed' || event === 'closed';
  if (completing && !fm.completed) fm.completed = store.now();
  store.stamp(fm);
  if (a.append) body = `${rstrip(body)}\n\n${a.append}\n`;
  if (a.section !== undefined) {
    const edited = editSection(body, strip(a.section), a);
    if (edited.refuse) return refuse(`${row.slug}: ${edited.refuse}`);
    body = edited.body;
    changes[strip(a.section)] = SECTION_OPS.find(k => a[k] !== undefined);
  }

  if (a['dry-run']) {
    const set = Object.keys(changes).length ? `{${Object.entries(changes).map(([k, v]) => `${pyStr(k)}: ${pyVal(v)}`).join(', ')}}` : '(no field changes)';
    say(`ℹ️  [dry-run] ${row.slug}: would set ${set}${a.append ? '; append body' : ''}${moveTarget !== null ? `; move to P${moveTarget}` : ''}${completing ? '; COMPLETE -> re-prioritize backlog' : ''}`);
    return 0;
  }

  if (seqTaken !== null) recordNumber(folder, seqTaken);
  store.write({ path, fm, body }, folder);
  a.wrote = { slug: row.slug, path: row.path };
  store.addEvent(folder, row.path, {
    event, branch: fm.branch || '', commitSha: fm.commit || '',
    note: a.note || `set ${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  });

  // --- the planning event: a move-to-rank, or completion re-densifying the remaining backlog. The index entry of the item (name, status) follows the
  // file in every case: reflow makes the index right against the files, and writes only the index.
  const branches = [String(fm.branch || '')];
  const order = store.reflow(folder, moveTarget !== null ? { slug: row.slug, target: moveTarget, branches } : { branches });
  const inQueue = isOpen;
  if (moveTarget !== null) {
    changes.priority = `P${new Map(order).get(row.slug) ?? 'None'}`;
    store.addEvent(folder, row.path, { event: 'planning_event', note: `moved ${row.slug} -> P${moveTarget}; backlog densified to ${order.length}` });
  } else if (completing) { // the done item leaves the queue; the rest re-densify
    store.addEvent(folder, row.path, { event: 'planning_event', note: `completed ${row.slug}; backlog re-prioritized to ${order.length} item(s)` });
  } else if (inQueue(row.status) !== inQueue(fm.status)) { // into or out of the queue by a status other than done
    store.addEvent(folder, row.path, { event: 'planning_event', note: `${row.slug} is now ${fm.status}; backlog re-prioritized to ${order.length} item(s)` });
  }

  say(`✅ ${row.slug} updated (${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ') || 'body only'})`);
  const notice = team?.notice(a, { event, fm, slug: row.slug });
  if (notice) say(notice);
  const ender = team?.ender(a, { event, holder }) ?? ''; // the hand-off to review, a changes verdict and a close end the agent's session
  if (completing) {
    say('   ✋ PLANNING EVENT — completing work RE-PRIORITIZES the backlog (a re-rank, not a -1).');
    if (order.length) say(`      backlog now ${order.length} item(s), P0..P${order.length - 1}; next = P0 ${order[0][0]}`);
    else say('      backlog now empty — no actionable phase remains.');
    if (ender) say('      the team lead re-evaluates the order (backlog update --replan, --priority); not you');
    else {
      say('      RE-EVALUATE the order now (it is a planning step even if nothing changes):');
      say('        backlog update <phase> --priority <rank>      # promote/demote one');
      say('        backlog update --replan "<id,id,id,...>"       # set the leading order');
    }
  }
  if (ender) a.shutdown = ender; // printed by update once the change is published: the last line of the output
  return 0;
}
