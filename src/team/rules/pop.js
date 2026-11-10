// What `team pop` would do and which items a named filter selects. Pure: nothing is written and no item is changed.
import { Refusal, get, test } from './expression.js';
import { step } from './step.js';

// The team's queue: open items of the team in the session's folder (status not final, not archived), in the given order
// (ctx.order, a list of item numbers; the order of ctx.items when absent), without the items of ctx.skip.
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
// A table that validation has not seen is a wrong rule file (exit 2), never a TypeError.
const shape = (ctx, ...parts) => {
  const { entry } = ctx; const bad = why => { throw new Refusal(`team ${ctx.team}: ${why}`, 2); };
  if (!isObj(entry?.item?.status)) bad('the item definition has no status field');
  if (parts.includes('pop') && !(Array.isArray(entry.rules?.pop) && entry.rules.pop.every(isObj))) bad('rules.pop must be a list of pop entries (objects)');
  if (parts.includes('filters') && !(isObj(entry.rules?.filters) && Object.values(entry.rules.filters).every(isObj))) bad('rules.filters must be an object of filters (objects)');
};
export const queue = ctx => {
  shape(ctx);
  const final = ctx.entry.item.status.final ?? [];
  return [...new Set(ctx.order ?? ctx.items.map(i => i.seq))].filter(s => !ctx.skip?.has(s))
    .map(s => ctx.items.find(i => i.seq === s && i.repository === ctx.session.repository))
    .filter(i => i && i.team === ctx.team && !i.archived && !final.includes(get(i, 'status', ctx.entry)));
};

// The first pop entry, in table order, whose whole step succeeds on the first queue item it applies to. A refusal (exit 1) tries the
// next item; any other error (a malformed rule or value, exit 2) stops: it is never an idle answer.
export function pop(ctx) {
  shape(ctx, 'pop');
  const items = queue(ctx);
  for (const entry of ctx.entry.rules.pop) for (const item of items) {
    const c = { ...ctx, item, step: entry.step, args: {} };
    if (entry.when && !test(entry.when, c)) continue;
    try {
      const result = step(c);
      return { action: entry.step, item: item.seq, entry: entry.id, rule: result.rule, result };
    } catch (e) { if (!(e instanceof Refusal && e.exitCode === 1)) throw e; }
  }
  return { action: 'idle' };
}

// The item numbers a named filter selects, in queue order (the skip set does not apply).
export function filter(ctx, name) {
  shape(ctx, 'filters');
  const filters = ctx.entry.rules.filters;
  if (!Object.hasOwn(filters, name)) throw new Refusal(`team ${ctx.team} has no filter ${name} (filters: ${Object.keys(filters).join(', ')})`, 1);
  return queue({ ...ctx, skip: undefined }).filter(item => test(filters[name].when, { ...ctx, item })).map(i => i.seq);
}
