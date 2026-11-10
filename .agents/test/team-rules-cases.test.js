import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Refusal, defaultOf } from '../../src/team/rules/expression.js';
import { create, step } from '../../src/team/rules/step.js';
import { filter, pop } from '../../src/team/rules/pop.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));
const NOW = '2026-11-09T12:00:00Z';

// What this harness supports; a case outside it is left to the part that adds it, and the count below says how many run.
const RUN_KINDS = ['update', 'new', 'pop', 'filter'];
const EXPECTED = ['exit', 'text', 'rule', 'items', 'max_ms', 'place', 'say', 'delete', 'archived', 'bound', 'branch', 'action', 'item', 'entry', 'filter'];
// 205 cases run: the cases file holds 206 runnable ones, and COD-05 (a new without an agent) tests the agent text of the input resolution, which is not the evaluator's.
const RUN_COUNT = 205;
const LEFT_OUT = ['COD-05'];

const defaults = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
// An item of the rule set's team gets the definition's defaults unless the case is raw.
const items = (given, team, entry) => given.items.map(i => ({ seq: i.seq, slug: `${String(i.seq).padStart(3, '0')}-item`, name: i.name ?? `item ${i.seq}`, team: i.team ?? team,
  repository: i.repository ?? 'acme/app', branch: i.branch ?? 'main', archived: Boolean(i.archived), body: i.body ?? '',
  fields: { ...(!given.raw && (i.team ?? team) === team ? defaults(entry) : {}), ...i.fields } }));

const fileOf = c => (c.rule_set === 'inline' ? c.given.team_file : FILES[c.rule_set]);
const teamOf = (c, file) => c.command.flags?.team ?? Object.keys(file)[0];
function supported(c) {
  return !LEFT_OUT.includes(c.id) && RUN_KINDS.includes(c.command.run) && Object.keys(c.expect).every(k => EXPECTED.includes(k));
}
// The caller: the agent flag wins over the environment variable (stand-in for the real resolution).
const callerOf = cmd => {
  const agent = cmd.flags?.agent || cmd.env?.SMOOTH_BACKLOG_CLI_AGENT;
  if (!agent) throw new Refusal('this team command needs the agent: give --agent <name>, or set the SMOOTH_BACKLOG_CLI_AGENT variable', 2);
  return agent;
};

const ran = cases.filter(supported);

for (const c of ran) {
  test(`${c.id}: ${c.rule ?? 'coded'} (${c.command.step})`, () => {
    const cmd = c.command; const file = fileOf(c); const team = teamOf(c, file); const entry = file[team];
    let got; const t0 = Date.now(); const all = items(c.given, team, entry); const before = JSON.stringify(all);
    try {
      const ctx = { entry, team, caller: callerOf(cmd), items: all, args: cmd.args ?? {}, session: { repository: 'acme/app', branch: 'main', ...cmd.session }, now: NOW };
      // The number of a new item: the caller's counter or the highest number of the folder, plus one.
      if (cmd.run === 'pop') {
        const p = pop({ ...ctx, order: c.given.order });
        got = { exit: p.action === 'idle' ? 3 : 0, action: p.action, item: p.item, entry: p.entry };
      } else if (cmd.run === 'filter') got = { exit: 0, filter: filter(ctx, cmd.step) };
      else {
        const r = cmd.run === 'new' ? create(ctx, Math.max(c.given.last ?? 0, ...all.filter(i => i.repository === 'acme/app').map(i => i.seq)) + 1)
          : step({ ...ctx, step: cmd.step, item: all.find(i => i.seq === cmd.item && i.repository === 'acme/app') });
        got = { exit: 0, rule: r.rule, items: r.items, place: r.place, say: r.say, delete: r.delete };
      }
    } catch (e) { if (!(e instanceof Refusal)) throw e; got = { exit: e.exitCode, rule: e.rule, text: e.message }; }
    assert.equal(JSON.stringify(all), before, 'the items were changed');
    const want = c.expect;
    assert.equal(got.exit, want.exit, JSON.stringify(got));
    for (const k of ['text', 'rule', 'action', 'item', 'entry', 'filter']) if (k in want) assert.deepEqual(got[k], want[k], k);
    for (const [seq, fields] of Object.entries(want.items ?? {})) for (const [f, v] of Object.entries(fields)) assert.deepEqual(got.items.get(Number(seq)).fields[f], v, `item ${seq} field ${f}`);
    for (const k of ['place', 'say', 'delete']) if (k in want) assert.deepEqual(got[k], want[k], k);
    for (const seq of want.archived ?? []) assert.equal(got.items.get(seq).archived, true, `item ${seq} archived`);
    for (const [seq, t] of Object.entries(want.bound ?? {})) assert.equal(got.items.get(Number(seq)).team, t, `item ${seq} team`);
    for (const [seq, b] of Object.entries(want.branch ?? {})) assert.equal(got.items.get(Number(seq)).branch, b, `item ${seq} branch`);
    if (want.max_ms) assert.ok(Date.now() - t0 < want.max_ms, `took ${Date.now() - t0} ms`);
  });
}

test('the harness runs every case it supports, none silently dropped', () => {
  console.log(`cases run: ${ran.length}`);
  assert.equal(ran.length, RUN_COUNT);
});
