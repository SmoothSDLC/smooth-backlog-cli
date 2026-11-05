// `backlog update`, non-team flags.
// in the earlier scripts order: pull, resolve the item, change, write the file, log the event, scan into
// the index, planning event (--priority move, completion, --replan), commit and push. The item is found by number
// (seq) or slug. The team flags go to lifecycle.js.
// shortcut: argparse's unique-prefix abbreviations (--stat) are not accepted.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BacklogError } from '../errors.js';
import { parse as parseDoc } from './frontmatter.js';
import { find as findItem, rows as itemRows } from './index.js';
import { repairUnreadable } from './repair.js';
import { teamRefusal } from './archive.js';
import { caller, closeNow, headline, missingFields, reviewRefusal, runCloseGate, shutdown, step } from './lifecycle.js';
import { assertInside, checkRefs, itemSelector, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { inProgress, wipRefusal } from './wip.js';
import { asList, foreignCycle, foreignItem, heldBy, isForeign, teamLead, teamScope } from './team.js';

const SETTABLE = ['status', 'branch', 'commit', 'location', 'summary', 'priority', 'name', 'objective', 'seq', 'size_score'];
const VALUE = [...SETTABLE, 'append', 'replan', 'note', 'set-estimate', 'set-complexity', 'set-layer', 'set-depends-on', 'set-chunk', 'set-team', 'severity'];
const BOOL = ['dry-run', 'restore'];
// the hand-off flags of an earlier change (the record is the producer's, the accept and reject the team lead's).
export const TEAM_VALUE = ['wip-override', 'claim', 'waiting', 'set-review-refs', 'release', 'request-review', 'review', 'by', 'comments', 'refinement-review', 'request-decision', 'decision', 'reassign', 'reason', 'reassign-review',
  'handoff', 'handoff-commit', 'handoff-contract', 'handoff-verification', 'handoff-outputs', 'handoff-pickup', 'handoff-risks', 'accept-handoff', 'reject-handoff', 'checks'];
export const TEAM_BOOL = ['force', 'waiting-done', 'start-review', 'close', 'refine-start', 'refine-done', 'request-refinement-review'];
const CHOICES = { 'set-complexity': ['low', 'medium', 'high'], 'set-layer': ['1', '2', '3', '4', '5', 'process'], review: ['pass', 'changes'], 'set-chunk': ['yes', 'no'], severity: ['normal', 'critical'], 'refinement-review': ['pass', 'changes', 'limit'] };

// Python str.strip/rstrip whitespace (not JS's: \x1c-\x1f and \x85 count, ﻿ does not).
const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const rstrip = s => s.replace(new RegExp(`[${WS}]+$`), '');
const strip = s => rstrip(s).replace(new RegExp(`^[${WS}]+`), '');
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
function parse(argv) {
  const a = {}; let past = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!past && tok === '--') { past = true; continue; }
    const [flag, eq] = tok.startsWith('--') ? tok.slice(2).split(/=(.*)/s) : [null];
    const known = [...BOOL, ...TEAM_BOOL, ...VALUE, ...TEAM_VALUE].includes(flag); // argparse: an option, even with a space in its =value
    if (past || (!known && valueLike(tok))) {
      if (a.phase !== undefined) throw usage(`unrecognized arguments: ${tok}`);
      a.phase = tok;
      continue;
    }
    if ([...BOOL, ...TEAM_BOOL].includes(flag)) {
      if (eq !== undefined) throw usage(`argument --${flag}: ignored explicit argument ${pyStr(eq)}`);
      a[flag] = true;
    } else if ([...VALUE, ...TEAM_VALUE].includes(flag)) {
      const v = eq ?? (valueLike(argv[i + 1]) ? argv[++i] : undefined);
      if (v === undefined) throw usage(`argument --${flag}: expected one argument`);
      if (flag === 'set-estimate' && pyInt(v) === null) throw usage(`argument --${flag}: invalid int value: ${pyStr(v)}`);
      if (CHOICES[flag] && !CHOICES[flag].includes(v)) throw usage(`argument --${flag}: invalid choice: ${pyStr(v)} (choose from ${CHOICES[flag].join(', ')})`);
      a[flag] = v;
    } else throw usage(`unrecognized arguments: ${tok}`);
  }
  return a;
}

const say = text => process.stdout.write(`${redact(text)}\n`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const refuse = message => { say(`❌ ${message}`); return 1; }; // 's refusals: stdout, exit 1

export async function run(argv) {
  try { return await update(argv); } catch (e) { return seen.reportStale(e, die, e instanceof BacklogError ? e.exitCode : 1); }
}

async function update(argv) {
  const a = parse(argv);
  seen.setActor(a.by ?? a.claim ?? a.release);
  a.named = Boolean(a.by ?? a.claim ?? a.release);
  const { home } = store.resolveHome();
  let repo; let folder;
  try { repo = teamScope().repo || store.repoId(process.cwd()); folder = store.folder(home, repo); } catch (e) { return die(e.message); } //
  return store.cloneLocked(home, async () => { // the run lock: from the pull to the push
    await sync.pull(home); // every script works on origin/main as it is now
    const code = await store.undoOnThrow(folder, () => change(a, folder, repo)); // refuses a link at the owner or the repository folder
    if (code || a['dry-run']) return code;
    // the agent a command names goes into the commit subject (session names with colons are audit data too);
    // the actor the step acts as (a.by ?? a.claim ?? a.release), whatever the order of the options
    const subjectParts = ['update', ...argv.slice(0, 2)];
    const agent = a.by ?? a.claim ?? a.release;
    if (agent !== undefined) subjectParts.push(agent);
    const pairs = await sync.commitSettled(home, folder, subjectParts.join(' '), a.guard, a.claims);
    seen.recordWrites(folder, repo, seen.actor(), a.wrote ? [a.wrote] : [], pairs); // after the push, including a pure replan
    if (a.shutdown) process.stdout.write(`${shutdown(a.shutdown)}\n`); // after anything the publication prints
    return 0;
  });
}

// The slug of an item whose dependency chain (the files' depends_on, from deps on) leads back to `id`; `id` itself when deps names it. null: no cycle.
function dependencyCycle(rows, folder, id, deps) {
  const edges = new Map();
  for (const i of store.load(folder)) { const r = findItem(rows, String(i.fm.phase || basename(i.path, '.md'))); if (r) edges.set(r.id, { slug: r.slug, deps: asList(i.fm.depends_on) }); }
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

async function change(a, folder, repo) {
  const bad = store.unreadable(folder); // an item that cannot be read: only its own repair goes on, every other command refuses
  if (bad) {
    const done = await repairUnreadable(a, folder, bad);
    if (done !== undefined) return done;
  }
  const { rows } = itemRows(folder);
  // --- pure planning event: explicit replan of the whole backlog
  if (a.replan) {
    const idents = a.replan.split(',').map(strip).filter(Boolean);
    for (const ident of idents) { // a bound team session reorders only its own items: naming another team's item is refused, before anything is written
      const named = findItem(rows, ident);
      const outside = named && teamRefusal(named);
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
  const { fm, body: text } = parseDoc(readFileSync(path, 'utf8'));
  const statusBefore = fm.status; // the close gate (059.3) runs on the pre-transition status
  // The step's effective actor, not the environment actor: only the holder asks for a review of its work, and the
  // hand-off record acts as the claimer (an earlier change, review r2: a --handoff without --by records as the claimer,
  // so the stale-view check must run against the claimer's view).
  if (!a.named && (a['request-review'] !== undefined || a.handoff !== undefined)) seen.setActor(fm.claimed_by);
  seen.check(folder, repo, seen.actor(), row.slug, row.path); // refuses (exit 5) when someone else changed the item since this agent read it
  a.guard = [{ path: `${repo}/${row.path}`, slug: row.slug, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` }];
  // a new session of the same card reclaims the in-progress item (the continuation, no new work to
  // start); the active-item limit of the other items of the card still applies, checked against heldBy below
  a.claims = a.claim ? [{ folder, path: row.path, agent: a.claim, skipActiveLimit: Boolean(a.force) || fm.claimed_by === a.claim, reclaim: heldBy(fm.claimed_by, a.claim) && fm.status === 'in_progress' }] : [];
  let body = text;
  const changes = {};
  let moveTarget = null; // --priority is a move-to-rank, applied via reflow (stays dense)
  for (const k of SETTABLE) {
    const v = a[k];
    if (v === undefined) continue;
    if (k === 'branch') return refuse('--branch is not changed by backlog update; use backlog move to move an item to another branch'); // identity field (owner rule 2026-10-11)
    if (k === 'commit' && !strip(v)) return refuse('--commit cannot be cleared');
    let n;
    if (['priority', 'seq', 'size_score'].includes(k) && (n = pyInt(v)) === null) throw new BacklogError('INVALID_INPUT', `invalid literal for int() with base 10: ${pyStr(v)}`, 1);
    if (k === 'status' && !['pending', 'in_progress', 'done'].includes(v)) return refuse(`--status ${pyStr(v)}: use pending, in_progress or done (backlog archive moves a finished item to archive/)`);
    if (k === 'status' && v === 'in_progress' && fm.status !== 'in_progress') { // starting work by status is starting work
      const wip = wipRefusal(folder, repo, { ...fm, team: a['set-team'] !== undefined ? strip(a['set-team']) : fm.team }, fm.claimed_by || a.by || caller(), row.slug);
      if (wip) return refuse(`${row.slug}: ${wip}`);
    }
    if (k === 'seq') { // the number selects the item: another item (archived ones too) holding it would make every numeric selector ambiguous
      const held = rows.find(r => Number(r.seq) === n && r.id !== row.id)?.slug
        ?? store.load(folder).find(i => Number(i.fm.seq) === n && i.fm.phase !== row.slug)?.fm.phase;
      if (held) return refuse(`--seq ${n} is already item ${held}; the number must stay unique`);
      const by = store.load(folder).filter(i => i.fm.phase !== row.slug && asList(i.fm.depends_on).some(d => d === row.slug || (/^\d+$/.test(String(d)) && Number(d) === Number(row.seq)))).map(i => i.fm.phase ?? i.path);
      if (by.length) return refuse(`${by.join(', ')} depend${by.length > 1 ? '' : 's'} on ${row.slug}, which a new number would leave them pointing at nothing; clear or repoint them first: update <dependent> --set-depends-on <ids|none>`);
    }
    if (k === 'priority') { moveTarget = n; continue; }
    fm[k] = k === 'seq' || k === 'size_score' ? n : v;
    changes[k] = v;
  }
  const incomplete = missingFields(fm, body); // as the item is before this call
  const before = { team: fm.team, stage: fm.stage };
  if (a['wip-override'] !== undefined) { // the lead lifts the team and agent limits for this item, with a recorded reason
    const who = a.by || caller();
    if (caller() && caller() !== who) return refuse(`${row.slug}: you are ${caller()} (BACKLOG_AGENT): a member acts only as itself, not as ${who}`);
    if (who !== teamLead()) return refuse(`${row.slug}: only the team lead (${teamLead()}) lifts the team and agent work-in-progress limits for an item (got ${who || 'nobody'}; --by <lead>)`);
    const reason = strip(a['wip-override']);
    if (!reason) return refuse(`${row.slug}: --wip-override needs the reason`);
    Object.assign(fm, { wip_override: reason, wip_override_by: who, wip_override_at: store.now() });
    changes.wip_override = reason;
  }
  if (a['set-team'] !== undefined) {
    const name = strip(a['set-team']);
    if (!name && fm.stage) return refuse(`${row.slug}: an item in stage ${fm.stage} keeps a team (the stages are team work); set another team instead`); // beyond the earlier scripts
    if (name && name !== fm.team && inProgress(fm)) { // work in progress joins a team only within its limit
      const full = wipRefusal(folder, repo, { ...fm, team: name }, fm.claimed_by || fm.refiner || '', row.slug);
      if (full) return refuse(`${row.slug}: in progress, and in team ${name}: ${full}`);
    }
    fm.team = name; changes.team = name || 'none';
  }
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
  if (a['set-review-refs'] !== undefined) {
    const refs = asList(a['set-review-refs']);
    checkRefs(refs); // before any assignment
    fm.review_refs = refs;
    changes.review_refs = refs.join(',');
  }
  const holder = fm.claimed_by || '';
  const todo = step(a, { fm, body, before, slug: row.slug, folder, repo, incomplete, statusBefore, given: [...SETTABLE, 'severity'].filter(k => a[k] !== undefined) }); // --severity is a field edit too  //
  if (todo.refuse) return refuse(todo.refuse);
  const { event } = todo;
  if (todo.text) {
    changes[event] = headline(todo.text);
    body = `${rstrip(body)}\n\n${todo.text}\n`;
  }
  if (fm.wait_on && event !== 'waiting' && (strip(a.note ?? '') || ['review_requested', 'reviewed', 'closed'].includes(event))) { // the holder's next step on the item ends its wait
    fm.wait_on = '';
    body = `${rstrip(body)}\n\nWAIT DONE ${store.now()} (next step on the item)\n`;
  }
  if (a.status === 'done' && event !== 'closed') {
    // --status done is a close: the review rules of the item's team must be met for the current work commit (as --close);
    // the refusal names the unmet rule. The owner's decision closes with --close --by owner --reason.
    const refusal = reviewRefusal(fm);
    if (refusal) return refuse(`${row.slug}: ${refusal}`);
    // the close gate (059.3) - this path never calls closeItem, so the gate runs here, on the
    // pre-transition status; while a dependent's edge is not accepted the completion is refused the same way as
    // --close. With no dependents the gate records handoffs: none and the NONE line itself.
    const gate = runCloseGate({ fm, statusBefore, folder, repo, slug: row.slug });
    if (gate.refuse) return refuse(gate.refuse);
    if (gate.fm) {
      Object.assign(fm, gate.fm);
      changes.handoffs = 'none';
    }
    if (gate.text) body = `${rstrip(body)}\n\n${gate.text}\n`;
  }
  const completing = a.status === 'done' || event === 'closed';
  if (completing && !fm.completed) fm.completed = store.now();
  store.stamp(fm);
  if (a.append) body = `${rstrip(body)}\n\n${a.append}\n`;

  if (a['dry-run']) {
    const set = Object.keys(changes).length ? `{${Object.entries(changes).map(([k, v]) => `${pyStr(k)}: ${pyVal(v)}`).join(', ')}}` : '(no field changes)';
    say(`ℹ️  [dry-run] ${row.slug}: would set ${set}${a.append ? '; append body' : ''}${moveTarget !== null ? `; move to P${moveTarget}` : ''}${completing ? '; COMPLETE -> re-prioritize backlog' : ''}`);
    return 0;
  }

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
  const inQueue = s => ['pending', 'in_progress'].includes(s);
  if (moveTarget !== null) {
    changes.priority = `P${new Map(order).get(row.slug) ?? 'None'}`;
    store.addEvent(folder, row.path, { event: 'planning_event', note: `moved ${row.slug} -> P${moveTarget}; backlog densified to ${order.length}` });
  } else if (completing) { // the done item leaves the queue; the rest re-densify
    store.addEvent(folder, row.path, { event: 'planning_event', note: `completed ${row.slug}; backlog re-prioritized to ${order.length} item(s)` });
  } else if (inQueue(row.status) !== inQueue(fm.status)) { // into or out of the queue by a status other than done
    store.addEvent(folder, row.path, { event: 'planning_event', note: `${row.slug} is now ${fm.status}; backlog re-prioritized to ${order.length} item(s)` });
  }

  say(`✅ ${row.slug} updated (${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ') || 'body only'})`);
  if (event === 'reviewed' && a.review === 'pass') say(closeNow(fm, row.slug));
  // the hand-off to review, a changes verdict and a close end the agent's session
  const ender = event === 'review_requested' ? a.by || caller() || holder : event === 'reviewed' && a.review === 'changes' ? a.by : event === 'closed' ? a.by || holder : '';
  const ends = ender && ender !== teamLead(); // the design: these three end the agent's session (the lead is no member)
  if (completing) {
    say('   ✋ PLANNING EVENT — completing work RE-PRIORITIZES the backlog (a re-rank, not a -1).');
    if (order.length) say(`      backlog now ${order.length} item(s), P0..P${order.length - 1}; next = P0 ${order[0][0]}`);
    else say('      backlog now empty — no actionable phase remains.');
    if (ends) say('      the team lead re-evaluates the order (backlog update --replan, --priority); not you');
    else {
      say('      RE-EVALUATE the order now (it is a planning step even if nothing changes):');
      say('        backlog update <phase> --priority <rank>      # promote/demote one');
      say('        backlog update --replan "<id,id,id,...>"       # set the leading order');
    }
  }
  if (ends) a.shutdown = ender; // printed by update once the change is published: the last line of the output
  return 0;
}
