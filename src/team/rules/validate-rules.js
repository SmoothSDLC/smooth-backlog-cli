// The checks of every rule, pop entry and filter of one team entry. Not written yet: the shape of the entry is checked by validate.js.
// ctx = { team, entry, say, keys }: `entry` and `entry.rules` are objects, but `rules.table`, `rules.pop` and `rules.filters` may be of any type
// (validate.js has already reported a wrong type), so a check here must guard what it reads. `say(path, rule, problem, fix, severity = 'error')`
// adds a finding of the team; `keys(object, kind, path, rule = null)` reports the keys of an object that its kind does not allow.
export function checkRules(ctx) { return ctx; }
