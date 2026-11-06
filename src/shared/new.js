// `backlog new`: adds an item to the queue.
// Order of work as the earlier scripts: pull, number, write, place in the index, commit and push.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { input } from '../errors.js';
import { parseItem as parse } from './frontmatter.js';
import { find as findItem, rows as itemRows } from './index.js';
import { actor, check, recordWrites } from './seen.js';
import { configUser } from './setup.js';
import { assertInside, checkRefs, git, redact, slugify } from './safety.js';
import { addEvent, branch as callerBranch, folder as repoFolder, nextSeqFor, now, reflow, repoId, resolveHome, cloneLocked, undoOnThrow, write } from './store.js';
import { commitSettled, pull } from './sync.js';
import { normalise } from './workflow.js';
import { foreignItem, isForeign, outsideTeam, strip, teamName, teamScope } from './team.js';

const DOD_PLACEHOLDER = '- [ ] <machine-checkable acceptance>'; //
const pad = n => String(n).padStart(3, '0');

//. 's' = text, 'i' = integer, an array = choices, true = a switch. argparse also takes a unique prefix.
const OPTIONS = {
  name: 's', title: 's', status: 's', objective: 's', summary: 's', description: 's', context: 's', priority: 'i', severity: ['normal', 'critical'], 'split-from': 's', body: 's',
  'review-refs': 's', 'depends-on': 's', estimate: 'i', team: 's', chunk: true,
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
      out[camel(key)] = key === 'summary' && out.summary !== undefined ? `${out.summary}\n${value}` : value; // --summary may repeat: the sentences join
    }
  }
  input(!extra.length, `unrecognized arguments: ${extra.join(' ')}`);
  for (const [name, synonym] of [['name', 'title'], ['body', 'description']]) { // the owner's words are synonyms of the earlier flags
    input(out[name] === undefined || out[synonym] === undefined, `--${synonym} and --${name} are the same option: give one`);
    if (out[synonym] !== undefined) { out[name] = out[synonym]; delete out[synonym]; }
  }
  return out;
}

// as_list: 'none' or empty is no list; comma separated.
const asList = v => (v === undefined || v.trim().toLowerCase() === '' || v.trim().toLowerCase() === 'none' ? [] : v.split(',').map(x => x.trim()).filter(Boolean));

// a 'Definition of done' heading or line followed by content other than the placeholder. Beyond the
// oracle: the event lines the CLI appends to an item (a claim, a refinement start, a wait, a
// decision, a chunk) and an older item's ESTIMATE line are no definition of done, so an item whose body ends in the
// placeholder stays incomplete.
const EVENT_LINE = /^[ \t]*(?:Claimed by|Released by|Review started by|Review by \S+ stale|Refinement started by|Refinement review requested by|WAITING |WAIT DONE |DECISION |CHUNK |ESTIMATE:)[^\n]*$/gm;
export function hasDefinitionOfDone(text) {
  const body = (text || '').replaceAll(DOD_PLACEHOLDER, '').replace(EVENT_LINE, '');
  // beyond the earlier scripts: the last one decides, since a split child carries its parent's body,
  // definition of done included, before its own section
  const m = [...body.matchAll(/^[ \t]*(?:#{1,6}[ \t]*|\*\*|[-*][ \t]+)?definition of done\b/gim)].at(-1);
  if (!m) return false;
  const rest = body.slice(m.index + m[0].length);
  const next = /^#{1,6}[ \t]/m.exec(rest);
  const content = (next ? rest.slice(0, next.index) : rest).replace(/^[ \t\r\n:*]+|[ \t\r\n:*]+$/g, '');
  return Boolean(content) && !/^(?:[-*][ \t]+(?:\[[ x]\][ \t]*)?)?(?:tbd|tba|todo|to ?do|n\/?a|none|-|\.\.\.|…)\.?$/i.test(content); // a placeholder word is no definition of done
}


const refuse = text => { process.stdout.write(`❌ ${redact(text)}\n`); return 1; };

export async function run(argv) {
  try {
    const { home } = resolveHome();
    const team = teamScope();
    const repo = team.repo || repoId(process.cwd());
    const folder = repoFolder(home, repo);
    return await cloneLocked(home, async () => {
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
  if (a.status !== undefined && (a.team || (a.splitFrom && teamName()))) return refuse('--status cannot be combined with --team: a team item starts in its own first status');
  const refs = asList(a.reviewRefs);
  checkRefs(refs); // before the folder is read
  // an item of a team (--team, or a split of a team's item) starts in stage refining, where a member writes it
  const intoRefining = a.team || (a.splitFrom && teamName()); // outside a team session a split is a plain item
  if (!hasDefinitionOfDone(a.body) && (team.repo || refs.length) && !intoRefining) {
    return refuse("--body must hold a definition of done: a '## Definition of done' heading (or a 'Definition of done:' line) with checkable lines; in team mode no placeholder is written");
  }

  const { rows } = itemRows(folder); // a dry run only looks: nothing is created in the backlog clone
  let seq; let slug; let rel; let order; let rank; let where;
  {
    const deps = [];
    for (const d of asList(a.dependsOn)) {
      if (isForeign(d)) { if (!foreignItem(folder, d)) return refuse(`--depends-on: no item '${d}' in the backlog repository`); }
      else if (!findItem(rows, d)) return refuse(`--depends-on: no item '${d}' in this backlog`);
      deps.push(/^\d+$/.test(d) ? Number(d) : d);
    }
    let inherited = { objective: '', summary: '', context: '' };
    const src = a.splitFrom ? findItem(rows, a.splitFrom) : null;
    if (a.splitFrom) {
      if (!src) return refuse(`--split-from: no phase '${a.splitFrom}'`);
      const outside = outsideTeam({ repository: src.repository, branch: src.branch }); // the split logs an event on the parent
      if (outside) return refuse(`${src.slug}: ${outside}`);
      // INTENTIONAL: the parent's body goes in verbatim, duplicate headings included.
      const file = join(folder, String(src.path));
      await assertInside(folder, file); // no symlink between the folder and the file
      if (!existsSync(file)) return refuse(`--split-from: the contents of '${src.slug}' are missing from the backlog repository`);
      check(folder, repo, actor(), src.slug, src.path); // the split logs a parent event based on this version and scope
      const doc = parse(readFileSync(file, 'utf8'));
      a.team = a.team || doc.fm.team || undefined; // a split item inherits the source's team
      const parent = Array.from(doc.body.trim()).slice(0, 800).join('');
      inherited = { objective: src.objective, summary: src.summary, context: `Split from \`${src.slug}\`. Inherited context:\n\n${parent}` };
    }
    // in a named team session (TEAM_NAME, set by the team runner) the creator names how the
    // item is reviewed, unless the item starts in stage refining (it has a team, its own or its source's), where the
    // members' refinement gives it its review documents. TEAM_REPOSITORY alone (a write into another repository's folder)
    // is no team session here.
    if (intoRefining && !a.team && !hasDefinitionOfDone(a.body) && team.repo) { // the source had no team: no stage refining
      return refuse("--body must hold a definition of done: a '## Definition of done' heading (or a 'Definition of done:' line) with checkable lines; in team mode no placeholder is written");
    }
    if (teamName() && !refs.length && !a.team) {
      return refuse(`in a team session an item names its review documents at creation: --review-refs <review document> (an item of a team, which starts in stage refining, gets them in its refinement)`);
    }

    const name = a.name || `${a.splitFrom || 'split'}-cont`;
    seq = nextSeqFor(folder, `-${slugify(name)}.md`);
    slug = `${pad(seq)}-${slugify(name)}`;
    rel = `phases/${slug}.md`;
    const path = join(folder, rel);
    if (existsSync(path) && !a.force) return refuse(`${slug} exists (pass --force)`);

    const objective = a.objective || inherited.objective || name;
    const fm = {
      phase: slug, seq, name, objective, summary: a.summary || inherited.summary || '', status: a.team || intoRefining ? 'new' : a.status !== undefined ? normalise(a.status) : 'pending', severity,
      repository: repo, branch: team.branch || callerBranch(process.cwd()),
      commit: (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], process.cwd())).stdout.trim(), location: '', created: now(), updated: now(), updated_by: actor(),
    };
    if (a.team) Object.assign(fm, { team: strip(a.team), refiner: '' });
    else if (intoRefining) Object.assign(fm, { refiner: '' }); // a slice split in a team session needs its refinement review too
    if (a.chunk) fm.chunk = true;
    if (refs.length) fm.review_refs = refs;
    for (const [k, v] of [['estimate_min', a.estimate], ['complexity', a.complexity], ['layer', a.layer]]) if (v !== undefined) fm[k] = v;
    Object.assign(fm, { depends_on: deps, claimed_by: '', claimed_at: '', review_state: 'none', reviewer: '' });
    if (!fm.team) fm.owner = configUser(); // an item outside a team belongs to the user of the configuration
    const parts = [`\n# Phase ${pad(seq)} — ${name}\n`, `**Objective:** ${objective}\n`];
    if (a.context) parts.push(`\n## Carried context (from the original ask)\n\n${a.context}\n`);
    if (inherited.context) parts.push(`\n## ${inherited.context}\n`);
    if (a.body) parts.push(`\n${a.body}\n`);
    if (!hasDefinitionOfDone(a.body)) parts.push(`\n## Definition of done\n\n${DOD_PLACEHOLDER}\n`);

    if (a.dryRun) { process.stdout.write(`ℹ️  [dry-run] would create phase ${slug} (seq ${seq})\n`); return 0; }
    // nothing is committed yet: a failed run must not leave its file or its place in the index for the next command to push (beyond python parity)
    await undoOnThrow(folder, async () => {
      write({ path, fm, body: parts.join('\n') }, folder);
      // planning event: the new item at its insertion rank (the end without one) in the index of its branch
      order = reflow(folder, { slug, target: priority, branches: [fm.branch] });
      rank = Object.fromEntries(order)[slug];
      if (src) addEvent(folder, src.path, { event: 'split', note: `spawned sibling ${slug}` });
      addEvent(folder, rel, { event: 'planning_event', note: `added ${slug} at rank ${priority ?? 'end'}; backlog re-densified to ${order.length} item(s)` });
      where = priority === undefined ? 'appended' : `inserted at P${priority}`;
    });
  }

  // every change is committed and pushed at once; a file renumbered on the way is scanned and committed again
  const message = ['new', ...argv.slice(0, 2)].join(' ');
  const pairs = await commitSettled(home, folder, message);
  [{ slug, path: rel }] = recordWrites(folder, repo, actor(), [{ slug, path: rel }], pairs); // the creator has seen what it wrote
  seq = Number(slug.match(/^\d+/)[0]);

  if (severity === 'critical') {
    const bar = `⚠️ ${'='.repeat(72)}`;
    process.stdout.write(`${bar}\n⚠️  CRITICAL phase filed at P${rank} — ${slug}\n⚠️  SURFACE THIS TO THE USER NOW, in your FIRST line, with a ⚠️ marker. Do NOT bury it.\n${bar}\n`);
  }
  process.stdout.write(`✅ created phase ${slug} (seq ${seq}) — ${where}, now at P${rank}\n`
    + `   📋 planning event: backlog re-densified to ${order.length} item(s) (P0..P${order.length - 1})\n`);
  return 0;
}
