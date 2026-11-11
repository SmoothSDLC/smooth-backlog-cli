// `backlog team query check <item> <step> [--<argument> <value>]...`: the verdict of the team's rules for a step on an item, as `backlog team update` would reach it, without taking the step.
// Nothing is written in the backlog clone and nothing is published; like every read of the team file the command writes the validated copy, the record and the SHA. Exit 0 for both verdicts.
import { BacklogError } from '../errors.js';
import { find } from '../shared/index.js';
import { redact } from '../shared/safety.js';
import { readConfig, topOf } from '../shared/setup.js';
import { cloneLocked, configDir, folder as folderOf, now, repoId, resolveHome } from '../shared/store.js';
import { parseArgs } from './args.js';
import { VALUE, resolveInputs } from './inputs.js';
import { contextOf } from './item.js';
import { pullFolder } from './pull.js';
import { Refusal } from './rules/expression.js';
import { step, stepArgs } from './rules/step.js';
import { sessionOf } from './session.js';
import { stepNames } from './steps.js';
import { loadTeams } from './teams-load.js';
import { lines } from './update.js';

const invalid = text => new BacklogError('INVALID_INPUT', text);

// JSON is printed as serialized: each string value is redacted before, never the serialized text (the redaction of text spans JSON punctuation).
export const redactDeep = v => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(redactDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)])) : v);
export const say = (text, json) => process.stdout.write(`${json ? text : redact(text)}\n`);

export async function run(argv) {
  try { return await checkItem(argv); } catch (e) {
    if (!(e instanceof BacklogError)) throw e;
    process.stderr.write(`❌ backlog: ${redact(e.message)}\n`);
    return e.exitCode;
  }
}

async function checkItem(argv) {
  const { positionals, flags, args } = parseArgs(argv, [...VALUE, 'json', 'show-all']);
  const [, ident, name, ...extra] = positionals; // the first word is `check`
  if (!name) throw invalid('team query check needs an item and a step: backlog team query check <item> <step> [--<argument> <value>]...');
  if (extra.length) throw invalid(`unrecognized arguments: ${extra.join(' ')}`);
  const top = topOf(process.cwd());
  if (!top) throw invalid('run this from inside a git repository (the repository whose backlog you want)');
  const inputs = resolveInputs({ command: 'query check', flags, env: process.env, config: readConfig(top) });
  const workRepo = repoId(process.cwd());
  const repo = inputs.repository || workRepo;
  const session = sessionOf({ inputs, repo });
  const { home } = resolveHome();
  const folder = folderOf(home, repo);

  return cloneLocked(home, async () => {
    await pullFolder(home, folder, { read: true });
    const loaded = loadTeams({ top, home, repo, workRepo, stateDir: configDir(), team: inputs.team, now: new Date().toISOString() });
    const entry = loaded.file[inputs.team];
    const { ctx, own } = contextOf({ folder, entry, team: inputs.team, caller: inputs.agent, args, session, now: now(), branch: session.branch });
    const row = find(own.map(i => ({ seq: i.seq, slug: i.slug })), ident);
    if (!row) { say(`❌ no item ${ident}`); return 1; }
    const names = stepNames(entry);
    if (!names.includes(name)) throw invalid(`team ${inputs.team} has no step ${name} (steps: ${names.join(', ')})`);
    const item = own.find(i => i.seq === row.seq && i.slug === row.slug);
    const untaken = Object.keys(args).find(k => !stepArgs(entry, name).includes(k));
    let answer;
    if (untaken !== undefined) answer = { allowed: false, rule: null, changes: {}, related: {}, text: `step ${name} takes no --${untaken}` };
    else {
      try {
        const result = step({ ...ctx, step: name, item });
        const related = Object.fromEntries([...result.changes].filter(([s]) => s !== item.seq && Object.keys(result.changes.get(s)).length));
        const changes = result.changes.get(item.seq) ?? {};
        const order = Object.keys(entry.item);
        const parts = [...lines(changes, order, ''), ...Object.entries(related).map(([s, c]) => lines(c, order, `item ${s} `).join('; '))];
        answer = { allowed: true, rule: result.rule, changes, related, text: parts.join('; ') };
      } catch (e) {
        if (!(e instanceof Refusal && e.exitCode === 1)) throw e;
        answer = { allowed: false, rule: e.rule, changes: {}, related: {}, text: e.rule ? e.message.replace(new RegExp(` \\(rule ${e.rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`), '') : e.message };
      }
    }
    const line = answer.allowed ? `allowed by rule ${answer.rule}${answer.text ? `: ${answer.text}` : ''}` : `refused by rule ${answer.rule ?? '-'}: ${answer.text}`;
    if (flags.json) say(JSON.stringify(redactDeep({ allowed: answer.allowed, rule: answer.rule, changes: answer.changes, related: answer.related, text: line })), true);
    else say(line);
    return 0;
  });
}
