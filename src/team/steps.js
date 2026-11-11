// The steps of a team: the words its rules name. `backlog team update` refuses any other word, and `backlog team query steps` lists them.
// A rule for every step (`*`) names none; `new` is a step of every team, the one `backlog team new` takes.
export { stepArgs } from './rules/step.js';

// The step words of one rule: its `step` is a word or a list of words.
export const stepWords = r => (typeof r.step === 'string' ? [r.step] : Array.isArray(r.step) ? r.step.filter(s => typeof s === 'string') : []);

export const stepNames = entry => [...new Set(['new', ...entry.rules.table.flatMap(r => (r !== null && typeof r === 'object' ? stepWords(r) : [])).filter(s => s !== '*')])].sort();
