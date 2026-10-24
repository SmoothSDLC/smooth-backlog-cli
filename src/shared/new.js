// `backlog new` in shared mode (cli-parity job 10): a port of new_phase.py:28-192 of the pinned oracle.
// Order of work as the oracle: pull, number, write, scan into backlog.db, reflow, scan, commit and push.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { input } from '../errors.js';
import { commitSettled, connect, ensureAnchor, logEvent, scan, undoOnThrow } from './db.js';
import { parse } from './frontmatter.js';
import { assertInside, checkRefs, git, itemSelector, redact, slugify } from './safety.js';
import { branch as callerBranch, folder as repoFolder, nextSeq, now, reflow, repoId, resolveHome, runLocked, write } from './store.js';
import { pull } from './sync.js';
import { teamScope } from './team.js';

const WORK_CLASSES = ['app-code', 'ui', 'api', 'tests', 'iac', 'network', 'identity', 'security', 'data', 'delivery', 'verify', 'docs', 'contract', 'chunk', 'skills']; // lib_db.py:601
const REVIEW_CLASSES = [...WORK_CLASSES, 'code'];
const DOD_PLACEHOLDER = '- [ ] <machine-checkable acceptance>'; // lib_db.py:224
const pad = n => String(n).padStart(3, '0');

// new_phase.py:29-58. 's' = text, 'i' = integer, an array = choices, true = a switch. argparse also takes a unique prefix.
const OPTIONS = {
  name: 's', objective: 's', summary: 's', context: 's', priority: 'i', severity: ['normal', 'critical'], 'split-from': 's', body: 's',
  'work-class': 's', 'review-classes': 's', 'review-refs': 's', 'depends-on': 's', estimate: 'i',
  complexity: ['low', 'medium', 'high'], layer: ['1', '2', '3', '4', '5', 'process'], force: true, 'dry-run': true,
};
const NEGATIVE = /^-(\d+|\d*\.\d+)$/;
const optionLike = s => s.startsWith('-') && s !== '-' && !NEGATIVE.test(s) && !s.includes(' ');
const camel = key => key.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function parseArgs(argv) {
  const out = {}; const extra = [];
  for (let i = 0; i < argv.length; i++) {
    const [head, ...eq] = argv[i].split('=');
    const long = head.length > 2 && head.startsWith('--') && optionLike(head);
    let keys = long ? Object.keys(OPTIONS).filter(k => `--${k}` === head) : [];
    if (long && !keys.length) keys = Object.keys(OPTIONS).filter(k => k.startsWith(head.slice(2)));
    input(keys.length < 2, `ambiguous option: ${head} could match ${keys.map(k => `--${k}`).join(', ')}`);
    if (!keys.length) { extra.push(argv[i]); continue; }
    const [key] = keys; const kind = OPTIONS[key]; const flag = `--${key}`;
    if (kind === true) { input(!eq.length, `argument ${flag}: ignored explicit argument '${eq.join('=')}'`); out[camel(key)] = true; continue; }
    const value = eq.length ? eq.join('=') : argv[++i];
    input(value !== undefined && (eq.length || !optionLike(value)), `argument ${flag}: expected one argument`);
    if (kind === 'i') { input(/^\s*[+-]?\d+\s*$/.test(value), `argument ${flag}: invalid int value: '${value}'`); out[camel(key)] = Number(value); }
    else {
      if (kind !== 's') input(kind.includes(value), `argument ${flag}: invalid choice: '${value}' (choose from ${kind.map(c => `'${c}'`).join(', ')})`);
      out[camel(key)] = value;
    }
  }
  input(!extra.length, `unrecognized arguments: ${extra.join(' ')}`);
  return out;
}

// lib_db.py:627-640: 'none' or empty is no list; comma separated; a value outside the vocabulary dies (exit 2).
const asList = v => (v === undefined || v.trim().toLowerCase() === '' || v.trim().toLowerCase() === 'none' ? [] : v.split(',').map(x => x.trim()).filter(Boolean));
function parseClasses(text, allowed, flag) {
  const list = asList(text); const bad = list.filter(v => !allowed.includes(v));
  input(!bad.length, `${flag}: unknown class ${bad.join(', ')}; the vocabulary is: ${allowed.join(', ')}`);
  return list;
}

// lib_db.py:683-686
const uncovered = (classes, refs) => classes.filter(c => !refs.some(r => posix.basename(r).startsWith(`${c}.`)));

// lib_db.py:225-237: a 'Definition of done' heading or line followed by content other than the placeholder.
export function hasDefinitionOfDone(text) {
  const body = (text || '').replaceAll(DOD_PLACEHOLDER, '');
  for (const m of body.matchAll(/^[ \t]*(?:#{1,6}[ \t]*|\*\*|[-*][ \t]+)?definition of done\b/gim)) {
    const rest = body.slice(m.index + m[0].length);
    const next = /^#{1,6}[ \t]/m.exec(rest);
    if ((next ? rest.slice(0, next.index) : rest).replace(/^[ \t\r\n:*]+|[ \t\r\n:*]+$/g, '')) return true;
  }
  return false;
}

// lib_db.py:587-595: by number (a live item before an archived one) or by slug; the mirror database is the lookup.
function byIdent(db, ident) {
  const sel = itemSelector(ident);
  if (sel?.number !== undefined) return db.prepare("SELECT * FROM phase WHERE seq=? ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, id").get(sel.number);
  return sel ? db.prepare('SELECT * FROM phase WHERE slug=?').get(sel.slug) : undefined;
}

const refuse = text => { process.stdout.write(`❌ ${redact(text)}\n`); return 1; };

export async function run(argv) {
  try {
    const { home } = resolveHome();
    const team = teamScope();
    const repo = team.repo || repoId(process.cwd());
    const folder = repoFolder(home, repo);
    return await runLocked(home, repo, async () => {
      await pull(home);
      return await create(argv, { home, folder, repo, team });
    });
  } catch (error) {
    process.stderr.write(`❌ backlog: ${redact(error.message)}\n`);
    return error.exitCode ?? 2;
  }
}

async function create(argv, { home, folder, repo, team }) {
  const a = parseArgs(argv);
  const severity = a.severity ?? 'normal';
  const priority = a.priority ?? (severity === 'critical' ? 0 : undefined); // a critical finding jumps the queue (:62)
  if (!a.name && !a.splitFrom) return refuse('--name is required (or --split-from <phase>)');
  if (!(a.dependsOn || '').trim()) return refuse('--depends-on is required: the item numbers or slugs this work needs done first, or --depends-on none');
  const work = parseClasses(a.workClass, WORK_CLASSES, '--work-class');
  const review = parseClasses(a.reviewClasses, REVIEW_CLASSES, '--review-classes');
  const refs = asList(a.reviewRefs);
  checkRefs(refs); // before the coverage check and before any database access
  const missing = uncovered(review, refs);
  if (missing.length) return refuse(`--review-refs must cover every review class; uncovered: ${missing.join(', ')} (e.g. references/review/${missing[0]}.md in cody-coding-model)`);
  if (!hasDefinitionOfDone(a.body) && (team.repo || review.length)) {
    return refuse("--body must hold a definition of done: a '## Definition of done' heading (or a 'Definition of done:' line) with checkable lines; in team mode no placeholder is written");
  }

  const db = connect(folder, { readOnly: Boolean(a.dryRun) }); // a dry run only looks: nothing is created in the backlog clone
  let seq; let slug; let rel; let order; let rank; let summary; let where;
  try {
    const deps = [];
    for (const d of asList(a.dependsOn)) {
      if (!byIdent(db, d)) return refuse(`--depends-on: no item '${d}' in this backlog`);
      deps.push(/^\d+$/.test(d) ? Number(d) : d);
    }
    let inherited = { objective: '', summary: '', context: '' };
    const src = a.splitFrom ? byIdent(db, a.splitFrom) : null;
    if (a.splitFrom) {
      if (!src) return refuse(`--split-from: no phase '${a.splitFrom}'`);
      // INTENTIONAL (new_phase.py:103-107): the parent's body goes in verbatim, duplicate headings included.
      const file = join(folder, String(src.path));
      await assertInside(folder, file); // the path comes from the mirror database: untrusted
      if (!existsSync(file)) return refuse(`--split-from: the file of '${src.slug}' (${src.path}) is missing`);
      const parent = Array.from(parse(readFileSync(file, 'utf8')).body.trim()).slice(0, 800).join('');
      inherited = { objective: src.objective, summary: src.summary, context: `Split from \`${src.slug}\`. Inherited context:\n\n${parent}` };
    }

    seq = nextSeq(folder);
    const name = a.name || `${a.splitFrom || 'split'}-cont`;
    slug = `${pad(seq)}-${slugify(name)}`;
    rel = `phases/${slug}.md`;
    const path = join(folder, rel);
    if (existsSync(path) && !a.force) return refuse(`${rel} exists (pass --force)`);

    const objective = a.objective || inherited.objective || name;
    const fm = {
      phase: slug, seq, name, objective, summary: a.summary || inherited.summary || '', status: 'pending', severity,
      priority: priority ?? 10 ** 6, // a big sentinel sorts it last until the reflow places it
      repository: repo, branch: team.branch || callerBranch(process.cwd()),
      commit: (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], process.cwd())).stdout.trim(), location: '', created: now(), updated: now(),
    };
    if (work.length) fm.work_class = work;
    if (review.length) fm.review_classes = review;
    if (refs.length) fm.review_refs = refs;
    for (const [k, v] of [['estimate_min', a.estimate], ['complexity', a.complexity], ['layer', a.layer]]) if (v !== undefined) fm[k] = v;
    Object.assign(fm, { depends_on: deps, claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '' });
    const parts = [`\n# Phase ${pad(seq)} — ${name}\n`, `**Objective:** ${objective}\n`];
    if (a.context) parts.push(`\n## Carried context (from the original ask)\n\n${a.context}\n`);
    if (inherited.context) parts.push(`\n## ${inherited.context}\n`);
    if (a.body) parts.push(`\n${a.body}\n`);
    if (!hasDefinitionOfDone(a.body)) parts.push(`\n## Definition of done\n\n${DOD_PLACEHOLDER}\n`);

    if (a.dryRun) { process.stdout.write(`ℹ️  [dry-run] would create phase ${rel} (seq ${seq})\n`); return 0; }
    // nothing is committed yet: a failed run must not leave its file, a renumbered neighbour or a mirror row for the next command to push (beyond python parity)
    await undoOnThrow(db, folder, async () => {
      write({ path, fm, body: parts.join('\n') }, folder);
      if (src) logEvent(db, 'split', { handoffId: src.handoff_id, phaseId: src.id, note: `spawned sibling ${slug}` });
      scan(db, folder);
      // planning event: re-densify the backlog to 0..N-1, the new item at its insertion rank
      const hid = ensureAnchor(db);
      order = priority === undefined ? reflow(folder) : reflow(folder, { slug, target: priority });
      rank = Object.fromEntries(order)[slug];
      logEvent(db, 'planning_event', { handoffId: hid, note: `added ${slug} at rank ${priority ?? 'end'}; backlog re-densified to ${order.length} item(s)` });
      summary = scan(db, folder);
      where = priority === undefined ? 'appended' : `inserted at P${priority}`;
    });
  } finally { db.close(); }

  // every change is committed and pushed at once (new_phase.py:187-192); a file renumbered on the way is scanned and committed again
  const message = ['new', ...argv.slice(0, 2)].join(' ');
  for (const [old, next] of await commitSettled(home, folder, message)) {
    if (old === seq) { seq = next; slug = pad(next) + slug.replace(/^\d+/, ''); rel = `phases/${slug}.md`; }
  }

  if (severity === 'critical') {
    const bar = `⚠️ ${'='.repeat(72)}`;
    process.stdout.write(`${bar}\n⚠️  CRITICAL phase filed at P${rank} — ${slug}\n⚠️  SURFACE THIS TO THE USER NOW, in your FIRST line, with a ⚠️ marker. Do NOT bury it.\n${bar}\n`);
  }
  process.stdout.write(`✅ created phase ${rel} (seq ${seq}) — ${where}, now at P${rank}\n`
    + `   📋 planning event: backlog re-densified to ${order.length} item(s) (P0..P${order.length - 1})\n`
    + `   rescan: ${summary.phases} phase(s) tracked, ${summary.changed} (re)ingested\n`);
  return 0;
}
