// Shared-mode `backlog update` (cli-parity job 11), non-team flags. Port of update.py:88-257 and its commit tail
// (update.py:327-332) in the oracle's order: pull, resolve the item, change, write the file, log the event, scan into
// backlog.db, planning event (--priority move, completion, --replan), commit and push. The item is found by number
// (seq) or slug, never by database row id. The team flags (update.py:27-104) go to lifecycle.js (job 15).
// shortcut: argparse's unique-prefix abbreviations (--stat) are not accepted.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BacklogError } from '../errors.js';
import * as db from './db.js';
import { parse as parseDoc } from './frontmatter.js';
import { teamRefusal } from './archive.js';
import { closeNow, headline, missingFields, step } from './lifecycle.js';
import { assertInside, checkRefs, itemSelector, redact } from './safety.js';
import * as seen from './seen.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { REVIEW_DIR, asList, needsReview, teamScope } from './team.js';

const SETTABLE = ['status', 'branch', 'commit', 'location', 'summary', 'priority', 'name', 'objective', 'seq', 'size_score'];
const VALUE = [...SETTABLE, 'append', 'replan', 'note', 'set-estimate', 'set-complexity', 'set-layer', 'set-depends-on', 'set-chunk'];
const BOOL = ['dry-run'];
const TEAM_VALUE = ['claim', 'waiting', 'set-review-refs', 'release', 'request-review', 'review', 'by', 'comments'];
const TEAM_BOOL = ['force', 'waiting-done', 'start-review', 'close'];
const CHOICES = { 'set-complexity': ['low', 'medium', 'high'], 'set-layer': ['1', '2', '3', '4', '5', 'process'], review: ['pass', 'changes'], 'set-chunk': ['yes', 'no'] };

// Python str.strip()/rstrip() whitespace (not JS's: \x1c-\x1f and \x85 count, ﻿ does not).
const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const rstrip = s => s.replace(new RegExp(`[${WS}]+$`), '');
const strip = s => rstrip(s).replace(new RegExp(`^[${WS}]+`), '');
const pyInt = s => (/^\s*[+-]?\d+\s*$/.test(s) ? Number(s) : null);
// Python repr of a str, for the oracle's `{x!r}` and dict/list prints.
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

// update.py:107-140 argparse.
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
const refuse = message => { say(`❌ ${message}`); return 1; }; // update.py's refusals: stdout, exit 1
// lib_db.py:587-595
function find(con, text) {
  const sel = itemSelector(text);
  const row = sel && (sel.number !== undefined
    ? con.prepare("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id").get(sel.number)
    : con.prepare('SELECT * FROM phase WHERE slug=?').get(sel.slug));
  return row ? { ...row } : null;
}

export async function run(argv) {
  try { return await update(argv); } catch (e) { return die(e.message, e instanceof BacklogError ? e.exitCode : 1); }
}

async function update(argv) {
  const a = parse(argv);
  seen.setActor(a.by ?? a.claim ?? a.release);
  a.named = Boolean(a.by ?? a.claim ?? a.release);
  const { home } = store.resolveHome();
  let repo; let folder;
  try { repo = teamScope().repo || store.repoId(process.cwd()); folder = store.folder(home, repo); } catch (e) { return die(e.message); } // lib_db.py:122-129
  return store.cloneLocked(home, async () => { // update.py's run_lock: from the pull to the push
    await sync.pull(home); // lib_db.py:101-110: every script works on origin/main as it is now
    const forget = db.freshDb(folder);
    const con = db.connect(folder); // refuses a link at the owner or the repository folder
    let open = true;
    const close = () => { if (open) { open = false; con.close(); } };
    let code;
    try { code = await db.undoOnThrow(con, folder, () => change(a, con, folder, repo)); } catch (e) { close(); forget(); throw e; } finally { close(); }
    if (code || a['dry-run']) { forget(); return code; }
    // update.py:327-332: the commit tail; a renumbered item (two clones picked one number) gets its db row renamed and committed
    const pairs = await db.commitSettled(home, folder, ['update.py', ...argv.slice(0, 2)].join(' '), a.guard, a.claims);
    seen.recordWrites(folder, repo, seen.actor(), a.wrote ? [a.wrote] : [], pairs); // after the push, including a pure replan
    return 0;
  });
}

// The slug of an item whose dependency chain (the files' depends_on, from deps on) leads back to `id`; `id` itself when deps names it. null: no cycle.
function dependencyCycle(con, folder, id, deps) {
  const edges = new Map();
  for (const i of store.load(folder)) { const r = find(con, String(i.fm.phase || basename(i.path, '.md'))); if (r) edges.set(r.id, { slug: r.slug, deps: asList(i.fm.depends_on) }); }
  const seen = new Set();
  const walk = list => {
    for (const d of list) {
      const r = d === '' || d === null ? null : find(con, String(d));
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

async function change(a, con, folder, repo) {
  const one = (sql, ...p) => { const r = con.prepare(sql).get(...p); return r ? { ...r } : null; };
  const hid = one("SELECT id FROM handoff WHERE status='active' LIMIT 1")?.id ?? null;

  // --- pure planning event: explicit replan of the whole backlog (update.py:150-166)
  if (a.replan) {
    const idents = a.replan.split(',').map(strip).filter(Boolean);
    for (const ident of idents) { // a bound team session reorders only its own items: naming another team's item is refused, before anything is written
      const named = find(con, ident);
      const outside = named && teamRefusal(named);
      if (outside) return refuse(outside);
    }
    if (a['dry-run']) { say(`ℹ️  [dry-run] would replan backlog leading order: [${idents.map(pyStr).join(', ')}]`); return 0; }
    a.guard = [];
    const order = store.reorder(folder, idents);
    db.logEvent(con, 'planning_event', { handoffId: hid, note: a.note || `replan -> ${order.map(([s]) => s).join(', ')}` });
    db.scan(con, folder);
    say('📋 PLANNING EVENT — backlog re-prioritized (P0 = next):');
    for (const [s, i] of order) say(`   P${i}  ${s}`);
    return 0;
  }

  if (!a.phase) return refuse('phase is required (or use --replan "id,id,...")');
  const row = find(con, a.phase);
  if (!row) return refuse(`no phase ${pyStr(a.phase)} (create it with backlog new)`);
  if (row.status === 'archived') return refuse(`${row.slug} is archived and cannot be edited (the rescan does not visit archive/)`); // covers --claim, --request-review, --review and --close too

  const path = join(folder, row.path);
  await assertInside(folder, path); // the row is mirror data: it names a file inside the folder, no symlink on the way
  const { fm, body: text } = parseDoc(readFileSync(path, 'utf8'));
  if (!a.named && a['request-review'] !== undefined) seen.setActor(fm.claimed_by); // only the holder asks for a review of its work
  seen.check(folder, repo, seen.actor(), row.slug, row.path); // refuses (exit 5) when someone else changed the item since this agent read it
  a.guard = [{ path: `${repo}/${row.path}`, slug: row.slug, was: `${fm.updated}${fm.updated_by ? ` by ${fm.updated_by}` : ''}` }];
  a.claims = a.claim ? [{ folder, path: row.path, agent: a.claim, skipActiveLimit: Boolean(a.force) || fm.claimed_by === a.claim }] : [];
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
    if (k === 'seq') { // the number selects the item: another item (archived ones too) holding it would make every numeric selector ambiguous
      const held = con.prepare('SELECT slug FROM phase WHERE seq=? AND id<>?').get(n, row.id)?.slug
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
  if (a['set-chunk'] !== undefined) { fm.chunk = a['set-chunk'] === 'yes'; changes.chunk = a['set-chunk']; } // update.py:259-261
  for (const [k, v] of [['estimate_min', a['set-estimate'] === undefined ? undefined : pyInt(a['set-estimate'])], ['complexity', a['set-complexity']], ['layer', a['set-layer']]]) {
    if (v === undefined) continue;
    if (k === 'estimate_min' && v <= 0) return refuse('--set-estimate: minutes must be > 0');
    fm[k] = v;
    changes[k] = v;
  }
  if (a['set-depends-on'] !== undefined) {
    const deps = [];
    for (const d of asList(a['set-depends-on'])) {
      if (!find(con, d)) return refuse(`--set-depends-on: no item ${pyStr(d)} in this backlog`);
      deps.push(/^\d+$/.test(d) ? Number(d) : d);
    }
    const cycle = dependencyCycle(con, folder, row.id, deps);
    if (cycle) return refuse(`--set-depends-on: ${cycle === row.id ? 'an item cannot depend on itself' : `it would make a dependency cycle through ${cycle}`}`);
    fm.depends_on = deps;
    changes.depends_on = deps.join(',') || 'none';
  }
  if (a['set-review-refs'] !== undefined) {
    const refs = asList(a['set-review-refs']);
    checkRefs(refs); // before any assignment
    if (!refs.some(r => r.startsWith(REVIEW_DIR))) return refuse(`${row.slug}: --set-review-refs needs at least one review document (${REVIEW_DIR}<type>.md in cody-coding-model)`);
    fm.review_refs = refs;
    changes.review_refs = refs.join(',');
  }
  const todo = step(a, { fm, slug: row.slug, folder, repo, incomplete, given: SETTABLE.filter(k => a[k] !== undefined) }); // update.py:181-241
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
  if (a.status === 'done' && event !== 'closed' && needsReview(fm) && fm.review_state !== 'passed') { // reviewed items finish through --close only
    return refuse(`${row.slug}: has review_refs and review_state ${fm.review_state || 'none'}; use --request-review, then --close after a passing review`);
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
  const recordChange = () => {
    db.logEvent(con, event, {
      handoffId: row.handoff_id, phaseId: row.id, branch: fm.branch || '', commitSha: fm.commit || '',
      note: a.note || `set ${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    });
    db.scan(con, folder); // rescan -> the db follows the file
  };

  // --- the planning event: a move-to-rank, or completion re-densifying the remaining backlog (update.py:288-306)
  let order = null;
  if (moveTarget !== null) {
    order = store.reflow(folder, { slug: row.slug, target: moveTarget }, recordChange);
    changes.priority = `P${new Map(order).get(row.slug) ?? 'None'}`;
    db.logEvent(con, 'planning_event', { handoffId: hid, phaseId: row.id, note: `moved ${row.slug} -> P${moveTarget}; backlog densified to ${order.length}` });
  } else if (completing) {
    order = store.reflow(folder, null, recordChange); // the done item leaves the backlog; the rest re-densify
    db.logEvent(con, 'planning_event', { handoffId: hid, phaseId: row.id, note: `completed ${row.slug}; backlog re-prioritized to ${order.length} item(s)` });
  } else if (['pending', 'in_progress'].includes(row.status) !== ['pending', 'in_progress'].includes(fm.status)) {
    // into or out of the queue by a status other than done (done -> pending keeps its old priority and collides; a status out leaves a gap):
    // rank the queue again (beyond python parity, which leaves the collision or the gap)
    order = store.reflow(folder, null, recordChange);
    db.logEvent(con, 'planning_event', { handoffId: hid, phaseId: row.id, note: `${row.slug} is now ${fm.status}; backlog re-prioritized to ${order.length} item(s)` });
  }
  if (order) db.scan(con, folder); else recordChange();

  say(`✅ ${row.slug} updated (${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', ') || 'body only'})`);
  if (event === 'reviewed' && a.review === 'pass') say(closeNow(fm, row.slug, a.by));
  if (completing) {
    say('   ✋ PLANNING EVENT — completing work RE-PRIORITIZES the backlog (a re-rank, not a -1).');
    if (order.length) say(`      backlog now ${order.length} item(s), P0..P${order.length - 1}; next = P0 ${order[0][0]}`);
    else say('      backlog now empty — no actionable phase remains.');
    say('      RE-EVALUATE the order now (it is a planning step even if nothing changes):');
    say('        backlog update <phase> --priority <rank>      # promote/demote one');
    say('        backlog update --replan "<id,id,id,...>"       # set the leading order');
  }
  return 0;
}
