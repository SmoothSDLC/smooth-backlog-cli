// Scenario tests of the spike: every case of design/rule-cases.json, run through the evaluator. node --test evaluator.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missingText, teamsFile } from './teams-load.mjs';
import { create, filter, itemFindings, migrateAsk, pop, Refusal, resolveAgent, resolveInputs, resolveTeam, step, userReference, userSet, userShow, validate } from './evaluator.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases, verification } = read('../rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../examples/${n}.json`)]));
const NOW = '2026-11-09T12:00:00Z';
const defaults = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, d.default !== undefined ? d.default : ['items', 'list'].includes(d.type) ? [] : d.type === 'item' ? null : '']));

// A case's items; an item of the rule set's team gets the definition's defaults unless the case is raw (it then proves D-32 in the evaluator).
const items = (given, team, entry) => given.items.map(i => ({ seq: i.seq, slug: `${String(i.seq).padStart(3, '0')}-item`, name: i.name ?? `item ${i.seq}`, team: i.team ?? team,
  repository: i.repository ?? 'acme/app', branch: i.branch ?? 'main', archived: Boolean(i.archived), body: i.body ?? '',
  fields: { ...(entry && !given.raw && (i.team ?? team) === team ? defaults(entry) : {}), ...i.fields } }));

function run(c) {
  const cmd = c.command;
  const file = c.rule_set === 'inline' ? c.given.team_file : FILES[c.rule_set];
  if (cmd.run === 'validate') { const f = validate(file); return { exit: f.length ? 2 : 0, findings: f.map(({ path, rule, problem }) => ({ path, rule, problem })) }; }
  if (cmd.run === 'resolve') return { exit: 0, team: resolveTeam(cmd) };
  if (cmd.run === 'inputs') return { exit: 0, ...resolveInputs(cmd) };
  if (cmd.run === 'teams-file') { const f = teamsFile(cmd); return cmd.missing ? { exit: 2, text: missingText(f.path) } : { exit: 0, path: f.path, how: f.how }; }
  if (cmd.run === 'user-show') return { exit: 0, item: userShow(items(c.given), cmd.item, { showAll: cmd.show_all, env: cmd.env }).seq };
  if (cmd.run === 'user-ref') return { exit: 0, ref: userReference(items(c.given), cmd.item, { showAll: cmd.show_all }) };
  if (cmd.run === 'user-set') { const it = userSet(items(c.given), cmd.item, { field: cmd.field, value: cmd.value, user: cmd.user, showAll: cmd.show_all, env: cmd.env, now: NOW }); return { exit: 0, fields: it.fields, history: it.history.map(({ at, ...h }) => h) }; }
  if (cmd.run === 'migrate-ask') return { exit: 0, ok: migrateAsk({ isTerminal: cmd.terminal, team: cmd.flags.team }) };
  const team = resolveTeam({ flags: { team: Object.keys(file)[0], ...cmd.flags } });
  const entry = file[team];
  const caller = cmd.run === 'migrate-check' ? '' : resolveAgent(cmd);
  const all = items(c.given, team, entry);
  const ctx = { entry, team, caller, items: all, args: cmd.args ?? {}, session: { repository: 'acme/app', branch: 'main', ...cmd.session }, now: NOW };
  if (cmd.run === 'pop') { const p = pop({ ...ctx, order: c.given.order ?? all.map(i => i.seq) }); return { exit: p.action === 'idle' ? 3 : 0, ...p }; }
  if (cmd.run === 'filter') return { exit: 0, filter: filter(ctx, cmd.step) };
  if (cmd.run === 'migrate-check') return { exit: 0, findings: itemFindings(entry, all.filter(i => i.team === team)) };
  const state = { last: c.given.last ?? 0 };
  const r = cmd.run === 'new' ? create(ctx, state) : step({ ...ctx, step: cmd.step, item: all.find(i => i.seq === cmd.item && i.repository === 'acme/app') });
  return { exit: 0, rule: r.rule, place: r.place, say: r.say, delete: r.delete, items: r.items };
}

for (const c of cases) {
  test(`${c.id}: ${c.rule ?? 'coded'} (${c.command.run}${c.command.step ? ` ${c.command.step}` : ''})`, () => {
    let got; const t0 = Date.now();
    try { got = run(c); } catch (e) { if (!(e instanceof Refusal)) throw e; got = { exit: e.exit, rule: e.rule, text: e.message }; }
    const want = c.expect;
    assert.equal(got.exit, want.exit, JSON.stringify(got));
    for (const k of ['text', 'rule', 'action', 'item', 'entry', 'team', 'agent', 'all', 'ref', 'history', 'path', 'how', 'filter', 'findings', 'place', 'say', 'delete']) if (k in want) assert.deepEqual(got[k], want[k], k);
    for (const [seq, fields] of Object.entries(want.items ?? {})) for (const [f, v] of Object.entries(fields)) assert.deepEqual(got.items.get(Number(seq)).fields[f], v, `item ${seq} field ${f}`);
    for (const seq of want.archived ?? []) assert.equal(got.items.get(seq).archived, true, `item ${seq} archived`);
    for (const [seq, t] of Object.entries(want.bound ?? {})) assert.equal(got.items.get(Number(seq)).team, t, `item ${seq} team`);
    for (const [seq, b] of Object.entries(want.branch ?? {})) assert.equal(got.items.get(Number(seq)).branch, b, `item ${seq} branch`);
    for (const [f, v] of Object.entries(want.fields ?? {})) assert.deepEqual(got.fields[f], v, `field ${f}`);
    if (want.max_ms) assert.ok(Date.now() - t0 < want.max_ms, `took ${Date.now() - t0} ms`);
  });
}

test('every rule, pop entry and filter of every example has a case and a verification entry', () => {
  const covered = new Set(cases.map(c => `${c.rule_set}/${c.rule}`));
  for (const [name, file] of Object.entries(FILES)) for (const e of Object.values(file)) {
    const ids = [...e.rules.table.map(r => r.id), ...e.rules.pop.map(o => o.id), ...Object.keys(e.rules.filters).map(v => `filter:${v}`)];
    for (const id of ids) {
      assert.ok(covered.has(`${name}/${id}`), `${name}/${id} has no case`);
      assert.ok(verification[`${name}/${id}`], `${name}/${id} has no verification entry`);
    }
  }
});
