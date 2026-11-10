import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Refusal, defaultOf } from '../../src/team/rules/expression.js';
import { step } from '../../src/team/rules/step.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { cases } = read('./fixtures/team-rules/rule-cases.json');
const FILES = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, read(`../../templates/teams/${n}.json`)]));
const NOW = '2026-11-09T12:00:00Z';

// What this harness supports; a case outside it is left to the part that adds it, and the count below says how many run.
const RUN_KINDS = ['update'];
const EFFECTS = ['set', 'add', 'remove'];
const EXPECTED = ['exit', 'text', 'rule', 'items', 'max_ms'];
const RUN_COUNT = 120;

const defaults = entry => Object.fromEntries(Object.entries(entry.item).map(([f, d]) => [f, defaultOf(d)]));
// An item of the rule set's team gets the definition's defaults unless the case is raw.
const items = (given, team, entry) => given.items.map(i => ({ seq: i.seq, slug: `${String(i.seq).padStart(3, '0')}-item`, name: i.name ?? `item ${i.seq}`, team: i.team ?? team,
  repository: i.repository ?? 'acme/app', branch: i.branch ?? 'main', archived: Boolean(i.archived), body: i.body ?? '',
  fields: { ...(!given.raw && (i.team ?? team) === team ? defaults(entry) : {}), ...i.fields } }));

const fileOf = c => (c.rule_set === 'inline' ? c.given.team_file : FILES[c.rule_set]);
const teamOf = (c, file) => c.command.flags?.team ?? Object.keys(file)[0];
// The deciding rule is the one the case names; it may use only the supported effects.
function supported(c) {
  if (!RUN_KINDS.includes(c.command.run) || Object.keys(c.expect).some(k => !EXPECTED.includes(k))) return false;
  const id = c.expect.rule ?? c.rule;
  if (!id) return true;
  const file = fileOf(c); const rule = file[teamOf(c, file)].rules.table.find(r => r.id === id);
  return Object.keys(rule?.do ?? {}).every(k => EFFECTS.includes(k));
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
    let got; const t0 = Date.now();
    try {
      const all = items(c.given, team, entry);
      const r = step({ entry, team, caller: callerOf(cmd), items: all, args: cmd.args ?? {}, session: { repository: 'acme/app', branch: 'main', ...cmd.session }, now: NOW,
        step: cmd.step, item: all.find(i => i.seq === cmd.item && i.repository === 'acme/app') });
      got = { exit: 0, rule: r.rule, items: r.items };
    } catch (e) { if (!(e instanceof Refusal)) throw e; got = { exit: e.exitCode, rule: e.rule, text: e.message }; }
    const want = c.expect;
    assert.equal(got.exit, want.exit, JSON.stringify(got));
    for (const k of ['text', 'rule']) if (k in want) assert.deepEqual(got[k], want[k], k);
    for (const [seq, fields] of Object.entries(want.items ?? {})) for (const [f, v] of Object.entries(fields)) assert.deepEqual(got.items.get(Number(seq)).fields[f], v, `item ${seq} field ${f}`);
    if (want.max_ms) assert.ok(Date.now() - t0 < want.max_ms, `took ${Date.now() - t0} ms`);
  });
}

test('the harness runs every case it supports, none silently dropped', () => {
  console.log(`cases run: ${ran.length}`);
  assert.equal(ran.length, RUN_COUNT);
});
