// The steps of a team: the words its rules name. `backlog team update` refuses any other word.
// A rule for every step (`*`) names none; `new` is a step of every team, the one `backlog team new` takes.
export { stepArgs } from './rules/step.js';

// The step words of one rule: its `step` is a word or a list of words. A list with anything else in it names no step (the validation refuses such a rule, chapter 08), here and in the shadowing check.
export const stepWords = r => (typeof r.step === 'string' ? [r.step] : Array.isArray(r.step) && r.step.every(s => typeof s === 'string') ? r.step : []);

export const stepNames = entry => [...new Set(['new', ...entry.rules.table.flatMap(r => (r !== null && typeof r === 'object' ? stepWords(r) : [])).filter(s => s !== '*')])].sort();
