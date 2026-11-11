// `backlog team validate`: reads the team file in full and the repository's items, prints every finding with its fix, writes nothing but what
// loadTeams writes (the SHA in the configuration, the per-user record and copy). It publishes nothing and never runs a rule.
// `backlog team migrate` shares the reading of the inputs here and answers that it is not available yet.
import { existsSync } from 'node:fs';
import { BacklogError } from '../errors.js';
import { foreignItem } from '../shared/dependencies.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import * as sync from '../shared/sync.js';
import { cloneLocked, configDir, folder, repoId, resolveHome } from '../shared/store.js';
import { resolveInputs } from './inputs.js';
import { readItems } from './item.js';
import { itemFindings, numberFindings } from './rules/validate-items.js';
import { errors } from './rules/validate.js';
import { loadTeams } from './teams-load.js';

const say = text => process.stdout.write(`${redact(text)}\n`);
const die = (message, code = 2) => { process.stderr.write(`❌ backlog: ${redact(message)}\n`); return code; };
const VALUE = ['team', 'agent', 'session', 'repository', 'branch'];

// The flags of the words that read the inputs: the five that take a value, --json and --show-all, and the booleans the word adds.
// No positional word is taken. Returns { top, inputs }.
export function readInputs(command, argv, booleans = []) {
  const flags = {};
  const allowed = [...VALUE, 'json', 'show-all', ...booleans];
  for (let i = 0; i < argv.length; i++) {
    const [flag, eq] = argv[i].startsWith('--') ? argv[i].slice(2).split(/=(.*)/s) : [null];
    if (!allowed.includes(flag)) throw new BacklogError('INVALID_INPUT', `unrecognized arguments: ${argv[i]}`);
    if (!VALUE.includes(flag)) { if (eq !== undefined) throw new BacklogError('INVALID_INPUT', `argument --${flag}: ignored explicit argument '${eq}'`); flags[flag] = true; continue; }
    const v = eq ?? (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? undefined : argv[++i]);
    if (v === undefined) throw new BacklogError('INVALID_INPUT', `argument --${flag}: expected one argument`);
    flags[flag] = v;
  }
  const top = topOf(process.cwd());
  if (!top) throw new BacklogError('INVALID_INPUT', 'run this from inside a git repository (the repository whose backlog you want)');
  return { top, inputs: resolveInputs({ command, flags, env: process.env, config: readConfig(top) }) };
}

// The reason of an unreadable file in the words the reader had before the codec read it: the JSON error, or "it is not an item".
const earlier = reason => { const m = /^item file is not valid JSON \((.*)\)$/s.exec(reason); return m ? m[1] : /^item file is not a JSON object$|^item file: seq /.test(reason) ? 'it is not an item' : reason.replace(/^item file: /, ''); };

// The live items of the folder as the checks read them ({ path, seq, team, fields }) and the live files that cannot be read as findings. Archived items are not checked.
function liveItems(dir) {
  const read = readItems(dir, { tolerant: true });
  const prefix = dir.split('/').slice(-2).join('/');
  const items = read.items.filter(r => r.path.startsWith('phases/')).map(({ path, item }) => ({ path: `${prefix}/${path}`, seq: item.seq, team: item.team, fields: item.fields }));
  // a too-big number is reported by the number findings (as before); an unreadable live file and a link are findings of their own
  const bad = read.bad.filter(b => (b.path === 'phases' || b.path.startsWith('phases/')) && b.kind !== 'number').map(b => ({ severity: 'error', team: null, path: `${prefix}/${b.path}`, rule: null, problem: `the item file cannot be read (${earlier(b.reason)})`,
    fix: b.kind === 'link' ? 'replace the link with the item file itself' : 'restore the file from the history of the backlog repository' }));
  return { items, bad, seqs: read.seqs, markdown: read.markdown };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function run(argv) {
  try { return await validate(argv); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
}

// Like every read of the backlog it pulls first (a failed pull warns and the answer comes from the local copy), under the clone's lock.
async function validate(argv) {
  const { top, inputs } = readInputs('validate', argv);
  const { home } = resolveHome();
  return cloneLocked(home, async () => {
    await sync.pull(home, { read: true });
    return check(argv, top, inputs, home);
  });
}

function check(argv, top, inputs, home) {
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const { file, shown, findings } = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString(), full: true });
  if (file && !inputs.all && !Object.hasOwn(file, inputs.team) && !errors(findings).length) return die(`team ${inputs.team} has no entry in ${shown} (teams: ${Object.keys(file).join(', ')})`, 1);

  // each line: the finding and what stands before its problem. The file's own: its shape and, with a team named, that team's; the entries of the others only count.
  const fileSays = f => `${shown}: ${f.team ? `${f.team}${f.path ? `.${f.path}` : ''}${f.rule ? ` (rule ${f.rule})` : ''}: ` : ''}`;
  // a file that cannot be read has one finding that names the file already: "<file> is not JSON (...)"
  const out = (inputs.all ? findings : findings.filter(f => f.team === null || f.team === inputs.team)).map(f => (file ? { f, at: fileSays(f) } : { f, at: '', text: f.problem.replace(/^teams\.json /, `${shown} `) }));
  const otherErrors = inputs.all ? [] : errors(findings).filter(f => f.team && f.team !== inputs.team);
  const others = [...new Set(otherErrors.map(f => f.team))];
  if (others.length) {
    const problem = `the entries of ${others.join(', ')} have errors; no team command runs until the whole file is valid`;
    out.push({ f: { severity: 'error', team: null, path: '', rule: null, problem, fix: 'run backlog team validate --show-all' }, at: `${shown}: `, oneLine: `${problem}; run backlog team validate --show-all` });
  }

  // the items and the numbers of the folder, when the file can be read and the items are JSON
  let markdown = false;
  const dir = folder(home, repo);
  if (file && existsSync(dir)) {
    const read = liveItems(dir);
    markdown = read.markdown;
    if (!markdown) {
      // a reference to this repository's own folder is local; any other is read from its folder in the same clone
      const foreign = id => {
        const m = /^(.+)#(\d+)$/.exec(String(id).trim());
        return m && m[1] === repo ? (read.seqs.has(Number(m[2])) ? { seq: Number(m[2]) } : null) : foreignItem(dir, id);
      };
      for (const f of [...read.bad, ...itemFindings(file, read.items, { team: inputs.team, all: inputs.all, foreign, seqs: read.seqs })]) out.push({ f, at: `${f.path}: ` });
      for (const f of numberFindings({ folder: dir })) out.push({ f, at: '' }); // the text of a number finding names its file
    }
  }

  // the one line about the other entries is not counted; their own errors are
  const errs = out.filter(({ f, oneLine }) => !oneLine && f.severity === 'error').length + otherErrors.length;
  if (argv.includes('--json')) { say(JSON.stringify(out.map(({ f }) => f), null, 2)); return errs ? 2 : 0; }
  for (const { f, at, oneLine, text } of out) {
    say(`${f.severity === 'error' ? '❌ ' : '⚠️  '}${at}${oneLine ?? text ?? f.problem}`);
    if (!oneLine) say(`   fix: ${f.fix}`);
  }
  if (markdown) say('ℹ️  the items are markdown: run backlog team migrate, then validate checks them too');
  say(`${errs ? '❌' : '✅'} ${shown}: ${file ? `${plural(Object.keys(file).length, 'team')}, ` : ''}${plural(errs, 'error')}, ${plural(out.filter(({ f }) => f.severity === 'warning').length, 'warning')}`);
  return errs ? 2 : 0;
}

// The words not built yet answer after their inputs are resolved, so that a missing team is said first.
export async function pending(command, argv, booleans) {
  try { readInputs(command, argv, booleans); } catch (e) { if (e instanceof BacklogError) return die(e.message, e.exitCode); throw e; }
  return die(`team ${command} is not available yet`);
}
