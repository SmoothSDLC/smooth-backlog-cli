// `backlog new`: adds an item to the queue. `team` (passed in by `backlog team new`) adds the options and rules of a team's items.
// Order of work as the earlier scripts: pull, number, write, place in the index, commit and push.
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createInterface } from 'node:readline';
import { BacklogError, input } from '../errors.js';
import { itemFileName, readItemFile } from './item-file.js';
import { find as findItem, rows as itemRows } from './index.js';
import { actor, check, recordWrites } from './seen.js';
import { configUser } from './setup.js';
import { assertInside, git, redact, slugify } from './safety.js';
import { addEvent, branch as callerBranch, folder as repoFolder, nextSeqFor, now, reflow, repoId, resolveHome, cloneLocked, undoOnThrow, write } from './store.js';
import { highWater, record as recordNumber } from './numbers.js';
import { commitSettled, pull } from './sync.js';
import { normalise } from './status.js';
import { seam } from './seam.js';
import { foreignItem, isForeign } from './dependencies.js';

const DOD_PLACEHOLDER = '- [ ] <machine-checkable acceptance>'; //
const pad = n => String(n).padStart(3, '0');

//. 's' = text, 'i' = integer, an array = choices, true = a switch. argparse also takes a unique prefix.
const OPTIONS = {
  name: 's', title: 's', status: 's', objective: 's', summary: 's', description: 's', context: 's', priority: 'i', severity: ['normal', 'critical'], 'split-from': 's', body: 's',
  'depends-on': 's', estimate: 'i', chunk: true,
  complexity: ['low', 'medium', 'high'], layer: ['1', '2', '3', '4', '5', 'process'], force: true, 'dry-run': true, ask: true,
};
const NEGATIVE = /^-(\d+|\d*\.\d+)$/;
const optionLike = s => s.startsWith('-') && s !== '-' && !NEGATIVE.test(s) && !s.includes(' ');
const camel = key => key.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function parseArgs(argv, more = {}) {
  const options = { ...OPTIONS, ...more };
  const out = {}; const extra = [];
  for (let i = 0; i < argv.length; i++) {
    const [head, ...eq] = argv[i].split('=');
    const long = head.length > 2 && head.startsWith('--') && optionLike(head);
    let keys = long ? Object.keys(options).filter(k => `--${k}` === head) : [];
    if (long && !keys.length) keys = Object.keys(options).filter(k => k.startsWith(head.slice(2)));
    input(keys.length < 2, `ambiguous option: ${head} could match ${keys.map(k => `--${k}`).join(', ')}`);
    if (!keys.length) { extra.push(argv[i]); continue; }
    const [key] = keys; const kind = options[key]; const flag = `--${key}`;
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

// --ask: on a terminal the command asks, on standard error, for each of these fields the call did not give; an empty answer leaves the field out.
// The other options stay options. `io` is the test seam: { isTerminal(), open() -> { ask(prompt) -> Promise<string|null>, close() } }, null being the end of the input.
const MORE = '... '; // the prompt of the next line of the body
const QUESTIONS = [['name', 'Title'], ['objective', 'Objective (one line)'], ['summary', 'Summary'], ['body', 'Body (finish with an empty line)']];
const TEAM_QUESTIONS = [['review-refs', 'Review documents (comma separated)']];
export const terminal = {
  isTerminal: () => Boolean(process.stdin.isTTY && process.stderr.isTTY),
  open() { // lines typed ahead (a paste) wait in the queue for their question
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const lines = []; let want = null; let ended = false;
    rl.on('line', line => { if (want) { const done = want; want = null; done(line); } else lines.push(line); });
    rl.once('close', () => { ended = true; if (want) want(null); });
    return {
      ask(prompt) {
        rl.setPrompt(prompt); rl.prompt();
        return lines.length ? Promise.resolve(lines.shift()) : ended ? Promise.resolve(null) : new Promise(done => { want = done; });
      },
      close: () => rl.close(),
    };
  },
};
async function asked(argv, team, io) {
  const a = parseArgs(argv, team?.options);
  if (!a.ask) return argv;
  input(io.isTerminal(), '--ask needs a terminal (standard input and standard error); give the fields as options instead (backlog new --help)');
  const out = [...argv]; const reader = io.open();
  try {
    for (const [key, label] of [...QUESTIONS, ...(team ? TEAM_QUESTIONS : [])]) {
      if (a[camel(key)] !== undefined) continue;
      let answer;
      if (key === 'body') { // lines up to an empty one
        const lines = []; let line = await reader.ask(`${label}: `);
        while (line) { lines.push(line); line = await reader.ask(MORE); }
        answer = line === null && !lines.length ? null : lines.join('\n');
      } else answer = await reader.ask(`${label}: `);
      if (answer === null) throw new BacklogError('INVALID_INPUT', 'no answer; nothing was created');
      if (answer.trim()) out.push(`--${key}=${answer.trim()}`);
    }
  } finally { reader.close(); }
  return out;
}

export async function run(argv, { team = null, io = terminal } = {}) {
  try {
    argv = await asked(argv, team, io);
    const { home } = resolveHome();
    const scope = seam.scope();
    const repo = scope.repo || repoId(process.cwd());
    const folder = repoFolder(home, repo);
    return await cloneLocked(home, async () => {
      const floor = highWater(folder); // the mark before the pull: the pull --rebase flattens an unpushed merge commit, whose numbers the history no longer holds
      await pull(home);
      return await create(argv, { home, folder, repo, scope, team, floor });
    });
  } catch (error) {
    process.stderr.write(`❌ backlog: ${redact(error.message)}\n`);
    return error.exitCode ?? 2;
  }
}

async function create(argv, { home, folder, repo, scope, team, floor = 0 }) {
  const a = parseArgs(argv, team?.options);
  const severity = a.severity ?? 'normal';
  const priority = a.priority ?? (severity === 'critical' ? 0 : undefined); // a critical finding jumps the queue (:62)
  if (!a.name && !a.splitFrom) return refuse('--name is required (or --split-from <phase>)');
  const t = team?.begin(a, scope); // the team's checks of the options (status, review documents, definition of done); its state for the later steps
  if (t?.refuse) return refuse(t.refuse);

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
      const outside = team?.outside(src); // the split logs an event on the parent
      if (outside) return refuse(outside);
      // INTENTIONAL: the parent's body goes in verbatim, duplicate headings included.
      const file = join(folder, String(src.path));
      await assertInside(folder, file); // no symlink between the folder and the file
      if (!existsSync(file)) return refuse(`--split-from: the contents of '${src.slug}' are missing from the backlog repository`);
      check(folder, repo, actor(), src.slug, src.path); // the split logs a parent event based on this version and scope
      const doc = readItemFile(file);
      if (doc.fm.team && !team) return refuse(`item ${src.slug} belongs to team ${doc.fm.team}: a split of a team's item is made by backlog team new`);
      const parent = Array.from(doc.body.trim()).slice(0, 800).join('');
      inherited = { objective: src.objective, summary: src.summary, context: `Split from \`${src.slug}\`. Inherited context:\n\n${parent}` };
    }
    const name = a.name || `${a.splitFrom || 'split'}-cont`;
    seq = nextSeqFor(folder, itemFileName(`-${slugify(name)}`), floor);
    slug = `${pad(seq)}-${slugify(name)}`;
    rel = `phases/${itemFileName(slug)}`;
    const path = join(folder, rel);
    if (existsSync(path) && !a.force) return refuse(`${slug} exists (pass --force)`);

    const objective = a.objective || inherited.objective || name;
    const fm = {
      phase: slug, seq, name, objective, summary: a.summary || inherited.summary || '', status: team ? 'new' : a.status !== undefined ? normalise(a.status) : 'pending', severity,
      repository: repo, branch: scope.branch || callerBranch(process.cwd()),
      commit: (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], process.cwd())).stdout.trim(), location: '', created: now(), updated: now(), updated_by: actor(),
    };
    team?.mark(fm, a); // the team and the refiner of a team's item
    if (a.chunk) fm.chunk = true;
    team?.reviewRefs(fm, t);
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
      recordNumber(folder, seq); // numbers.json: committed with the item
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
