// Step definitions. Every check goes through the CLI itself (backlog query --json), never through the item files.
import assert from 'node:assert/strict';
import { step } from '../support/gherkin.js';

// `backlog ...` with shell-like splitting: double quotes group words, \" is a quote inside them
export const split = s => (s.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []).map(t => t.startsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n') : t);
const command = (world, text) => { const args = split(text); assert.equal(args.shift(), 'backlog', `the command starts with backlog: ${text}`); return world.run(args); };
const output = r => `${r.stdout}\n${r.stderr}`;

step(/^a repository with a backlog$/, () => {}); // the world made it: a git repository with an origin, and the storage location
step(/^the environment (\w+) is "([^"]*)"$/, (w, key, value) => { w.agentEnv[key] = value; });
step(/^I act as agent "([^"]+)"$/, (w, name) => { w.agentEnv.BACKLOG_AGENT = name; });
step(/^I act as a person$/, w => { delete w.agentEnv.BACKLOG_AGENT; });
step(/^a team "([^"]+)" with lead "([^"]+)" and members "([^"]*)"$/, (w, team, lead, members) => w.configureTeam(team, { lead, members: members.split(',').map(x => x.trim()).filter(Boolean) }));
step(/^team "([^"]+)" work needs (\d+) pass(?:es)? by "([^"]+)"(?: and (\d+) pass(?:es)? by "([^"]+)")?$/, (w, team, n1, t1, n2, t2) => {
  const review = [{ team: t1, count: Number(n1) }]; if (t2) review.push({ team: t2, count: Number(n2) });
  w.configureTeam(team, { review });
});
step(/^team "([^"]+)" refinements are reviewed by "([^"]+)"$/, (w, team, by) => w.configureTeam(team, { refinement_review: [{ team: by, count: 1 }] }));
step(/^I commit a change to the repository$/, w => { w.git('commit', '-q', '--allow-empty', '-m', 'work'); });
step(/^a branch "([^"]+)" exists on the origin$/, (w, name) => { w.git('branch', name); w.git('push', '-q', 'origin', name); });

step(/^I run `(.+)`$/, (w, text) => { command(w, text); });
step(/^an item "([^"]+)" exists$/, (w, name) => {
  const r = command(w, `backlog new --name "${name}" --objective "do ${name}" --summary "${name}" --depends-on none`);
  assert.equal(r.status, 0, `could not create the item: ${output(r)}`);
});
step(/^a refined item "([^"]+)" exists$/, (w, name) => {
  const r = command(w, `backlog new --name "${name}" --objective "do ${name}" --summary "${name}" --depends-on none --review-refs docs/review/code.md --estimate 30 --complexity low --body "## Definition of done\\n- [ ] ${name} works"`);
  assert.equal(r.status, 0, `could not create the refined item: ${output(r)}`);
});
step(/^I have read item (\S+)$/, (w, item) => { const r = command(w, `backlog query --phase ${item} --json`); assert.equal(r.status, 0, output(r)); });

step(/^the command succeeds$/, w => assert.equal(w.last.status, 0, `exit ${w.last.status}: ${output(w.last)}`));
step(/^the command fails$/, w => assert.notEqual(w.last.status, 0, `the command succeeded: ${output(w.last)}`));
step(/^the command fails with exit code (\d+)$/, (w, code) => assert.equal(w.last.status, Number(code), `exit ${w.last.status}: ${output(w.last)}`));
step(/^the output contains "((?:[^"\\]|\\.)*)"$/, (w, text) => assert.ok(output(w.last).includes(text.replace(/\\"/g, '"')), `not in the output: ${text}\n${output(w.last)}`));
step(/^the output does not contain "((?:[^"\\]|\\.)*)"$/, (w, text) => assert.ok(!output(w.last).includes(text.replace(/\\"/g, '"')), `in the output: ${text}\n${output(w.last)}`));
step(/^the output matches \/(.+)\/$/, (w, re) => assert.match(output(w.last), new RegExp(re), output(w.last)));
step(/^the JSON output has (\d+) items?$/, (w, n) => { const v = JSON.parse(w.last.stdout); const items = Array.isArray(v) ? v : v.phases ?? []; assert.equal(items.length, Number(n), w.last.stdout); });

// item facts, read back through the CLI
const read = (w, item) => {
  const r = w.run(['query', '--phase', item, '--json'], { env: { BACKLOG_AGENT: 'reader' } });
  assert.equal(r.status, 0, `cannot read item ${item}: ${output(r)}`);
  const v = JSON.parse(r.stdout); return { ...v, ...(v.front_matter ?? {}) };
};
step(/^item (\S+) has (\w+) "([^"]*)"$/, (w, item, field, value) => { const v = read(w, item); assert.equal(String(v[field] ?? ''), value, `${field} of ${item}: ${JSON.stringify(v[field])}`); });
step(/^item (\S+) has (\w+) (\d+)$/, (w, item, field, value) => { const v = read(w, item); assert.equal(Number(v[field]), Number(value), `${field} of ${item}: ${JSON.stringify(v[field])}`); });
step(/^item (\S+) body contains "([^"]*)"$/, (w, item, text) => { const v = read(w, item); assert.ok(String(v.body ?? '').includes(text), `body of ${item}:\n${v.body}`); });
step(/^item (\S+) does not exist$/, (w, item) => { const r = w.run(['query', '--phase', item, '--json'], { env: { BACKLOG_AGENT: 'reader' } }); assert.notEqual(r.status, 0, `item ${item} exists: ${r.stdout}`); });
step(/^the queue is (\d+(?:, \d+)*)$/, (w, list) => {
  const r = w.run(['query', '--json'], { env: { BACKLOG_AGENT: 'reader' } }); assert.equal(r.status, 0, output(r));
  const open = (JSON.parse(r.stdout).phases ?? []).filter(p => ['pending', 'in_progress'].includes(p.status)).sort((a, b) => a.priority - b.priority).map(p => String(p.seq));
  assert.deepEqual(open, list.split(', '), r.stdout);
});
step(/^the queue is empty$/, w => { const r = w.run(['query', '--json'], { env: { BACKLOG_AGENT: 'reader' } }); assert.equal(r.status, 0, output(r)); assert.deepEqual((JSON.parse(r.stdout).phases ?? []).filter(p => ['pending', 'in_progress'].includes(p.status)), [], r.stdout); });
