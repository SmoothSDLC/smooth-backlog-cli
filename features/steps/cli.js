// Step definitions. Every check goes through the CLI itself (backlog query --json), never through the item files.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, parse } from '../../src/shared/frontmatter.js';
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
step(/^team "([^"]+)" reviews in the stages "([^"]*)"$/, (w, team, stages) => w.configureTeam(team, { review: stages.split(',').map(x => x.trim()).filter(Boolean).map(stage => ({ stage, count: 1 })) }));
step(/^team "([^"]+)" has the external reviewers "([^"]+)"$/, (w, team, who) => w.configureTeam(team, { external_reviewers: who.split(',').map(x => x.trim()).filter(Boolean) }));
step(/^team "([^"]+)" refinements are reviewed by "([^"]+)"$/, (w, team, by) => w.configureTeam(team, { refinement_review: [{ team: by, count: 1 }] }));
// in the backlog repository the team configuration is a committed file at its root (the fixture keeps its own copy out of git)
step(/^the team configuration is a committed file$/, w => {
  if (!w.env.BACKLOG_HOME) return; // inside the repository it is created and committed by the command
  w.gitIn(w.home(), 'add', '-f', 'teams.json'); w.gitIn(w.home(), 'commit', '-q', '-m', 'teams'); w.gitIn(w.home(), 'push', '-q');
});
// a team or flow definition given as JSON text goes through the command, from a file outside the repository
step(/^I define the (team|workflow) from the JSON `(.+)`$/, (w, kind, json) => {
  const file = join(w.tmp, `${kind}.json`); writeFileSync(file, json);
  command(w, `backlog team ${kind === 'team' ? 'define' : 'workflow'} --file ${file}`);
});
step(/^another checkout sees team "([^"]+)" with lead "([^"]+)"$/, (w, team, lead) => {
  const r = w.runOther(['query', '--json']); assert.equal(r.status, 0, output(r)); // the read pulls the published configuration
  const file = join(w.other(), w.env.BACKLOG_HOME ? '' : '.backlog', 'teams.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))[team]?.lead, lead, readFileSync(file, 'utf8'));
});
// the repository that holds the items: the backlog repository clone, or the repository itself when the items live inside it
step(/^the backlog repository has no uncommitted or unpushed change$/, w => {
  const top = w.backlogRepo();
  const status = w.gitIn(top, 'status', '--porcelain');
  assert.equal(status, '', `uncommitted changes in the backlog repository:\n${status}`);
  const branch = w.gitIn(top, 'branch', '--show-current');
  assert.equal(w.gitIn(top, 'rev-list', '--count', `origin/${branch}..HEAD`), '0', 'unpushed commits in the backlog repository');
});
step(/^the backlog repository's origin is unreachable$/, w => { w.gitIn(w.backlogRepo(), 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/nowhere.git'); });
step(/^I commit a change to the repository$/, w => { w.git('commit', '-q', '--allow-empty', '-m', 'work'); });
step(/^a branch "([^"]+)" exists on the origin$/, (w, name) => { w.git('branch', name); w.git('push', '-q', 'origin', name); });

step(/^I run `(.+)`$/, (w, text) => { command(w, text); });
step(/^I run `(.+)` and answer "([^"]*)"$/, (w, text, typed) => { const args = split(text); assert.equal(args.shift(), 'backlog'); w.run(args, { input: `${typed}\n` }); });
step(/^an item "([^"]+)" exists$/, (w, name) => {
  const r = command(w, `backlog new --name "${name}" --objective "do ${name}" --summary "${name}" --depends-on none`);
  assert.equal(r.status, 0, `could not create the item: ${output(r)}`);
});
step(/^a refined item "([^"]+)" exists$/, (w, name) => {
  const r = command(w, `backlog new --name "${name}" --objective "do ${name}" --summary "${name}" --depends-on none --review-refs docs/review/code.md --estimate 30 --complexity low --body "## Definition of done\\n- [ ] ${name} works"`);
  assert.equal(r.status, 0, `could not create the refined item: ${output(r)}`);
});
step(/^I have read item (\S+)$/, (w, item) => { const r = command(w, `backlog query --phase ${item} --json`); assert.equal(r.status, 0, output(r)); });

// the second checkout of the same backlog (see world.other)
step(/^another checkout runs `(.+)`$/, (w, text) => {
  const args = split(text); assert.equal(args.shift(), 'backlog');
  const by = args.indexOf('--by'); const env = by >= 0 ? { BACKLOG_AGENT: args[by + 1] } : {};
  const r = w.runOther(args, { env }); assert.equal(r.status, 0, `the other checkout failed: ${output(r)}`);
});
step(/^another checkout sees item (\S+) with status "([^"]*)"$/, (w, item, status) => {
  const r = w.runOther(['query', '--phase', item, '--json']); assert.equal(r.status, 0, output(r));
  assert.equal(JSON.parse(r.stdout).status, status, r.stdout);
});
step(/^another checkout sees (\d+) items$/, (w, n) => {
  const r = w.runOther(['query', '--json']); assert.equal(r.status, 0, output(r));
  assert.equal((JSON.parse(r.stdout).phases ?? []).length, Number(n), r.stdout);
});
// a pre-push hook in the repository that holds the items: on its first run only, the other checkout publishes a change, so this push is rejected once
const raceWith = (w, change) => {
  const hooks = join(w.gitIn(w.backlogRepo(), 'rev-parse', '--git-dir').replace(/^(?!\/)/, `${w.backlogRepo()}/`), 'hooks');
  const marker = join(w.tmp, 'raced');
  const other = w.other();
  const bin = fileURLToPath(new URL('../../bin/backlog.js', import.meta.url));
  const env = w.env.BACKLOG_HOME ? `BACKLOG_HOME='${other}' ` : '';
  const cwd = w.env.BACKLOG_HOME ? w.repo : other;
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, 'pre-push'), `#!/bin/sh\n[ -e '${marker}' ] && exit 0\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX\ntouch '${marker}'\ncd '${cwd}' && ${env}BACKLOG_AGENT=racer '${process.execPath}' '${bin}' update ${change} >/dev/null 2>&1\nexit 0\n`, { mode: 0o755 });
};
step(/^the origin will receive another checkout's change just before my push$/, w => raceWith(w, '1 --note raced'));
step(/^the origin will receive another checkout's rank change of item 2 just before my push$/, w => raceWith(w, '2 --priority 0'));

step(/^the command succeeds$/, w => assert.equal(w.last.status, 0, `exit ${w.last.status}: ${output(w.last)}`));
step(/^the command fails$/, w => assert.notEqual(w.last.status, 0, `the command succeeded: ${output(w.last)}`));
step(/^the command fails with exit code (\d+)$/, (w, code) => assert.equal(w.last.status, Number(code), `exit ${w.last.status}: ${output(w.last)}`));
step(/^the output contains "((?:[^"\\]|\\.)*)"$/, (w, text) => assert.ok(output(w.last).includes(text.replace(/\\"/g, '"')), `not in the output: ${text}\n${output(w.last)}`));
step(/^the output does not contain the backlog folder path$/, w => assert.ok(!output(w.last).includes(w.home()), `the backlog folder path is in the output:\n${output(w.last)}`));
step(/^the output does not contain "((?:[^"\\]|\\.)*)"$/, (w, text) => assert.ok(!output(w.last).includes(text.replace(/\\"/g, '"')), `in the output: ${text}\n${output(w.last)}`));
step(/^the output matches \/(.+)\/$/, (w, re) => assert.match(output(w.last), new RegExp(re), output(w.last)));
step(/^the JSON field (\S+) has (\d+) or more entries$/, (w, dotted, n) => {
  const v = dotted.split('.').reduce((o, k) => (o ?? {})[k], JSON.parse(w.last.stdout));
  assert.ok(Array.isArray(v) && v.length >= Number(n), `${dotted}: ${JSON.stringify(v)}`);
});
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
  const open = (JSON.parse(r.stdout).phases ?? []).filter(p => !['closed', 'done', 'archived'].includes(p.status)).sort((a, b) => a.priority - b.priority).map(p => String(p.seq));
  assert.deepEqual(open, list.split(', '), r.stdout);
});
// The folder as an earlier release left it: the order in a priority field of each item (the last item first), no index file.
step(/^the order is kept in the items, as an earlier release did$/, w => {
  const dir = w.folder();
  const names = readdirSync(join(dir, 'phases')).filter(n => n.endsWith('.md')).sort();
  names.forEach((n, i) => { const p = join(dir, 'phases', n); const doc = parse(readFileSync(p, 'utf8')); writeFileSync(p, dump({ ...doc.fm, priority: names.length - 1 - i }, doc.body)); });
  rmSync(join(dir, 'index.json'), { force: true });
  const repo = w.backlogRepo();
  w.gitIn(repo, 'add', '-A'); w.gitIn(repo, 'commit', '-q', '-m', 'earlier release'); w.gitIn(repo, 'push', '-q', 'origin', 'HEAD');
});
// An item damaged by a hand edit or a bad merge, committed and pushed to the repository that holds the items: its status line is cut open.
step(/^the status of item (\d+) is damaged in the backlog repository$/, (w, n) => {
  const dir = w.folder();
  const name = readdirSync(join(dir, 'phases')).find(f => f.startsWith(String(n).padStart(3, '0')));
  const p = join(dir, 'phases', name);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^status: .*$/m, 'status: "pend'));
  const repo = w.backlogRepo();
  w.gitIn(repo, 'add', '-A'); w.gitIn(repo, 'commit', '-q', '-m', 'damaged'); w.gitIn(repo, 'push', '-q', 'origin', 'HEAD');
});
step(/^the backlog has an index$/, w => assert.ok(existsSync(join(w.folder(), 'index.json')), 'no index file in the backlog folder'));
step(/^the queue is empty$/, w => { const r = w.run(['query', '--json'], { env: { BACKLOG_AGENT: 'reader' } }); assert.equal(r.status, 0, output(r)); assert.deepEqual((JSON.parse(r.stdout).phases ?? []).filter(p => !['closed', 'done', 'archived'].includes(p.status)), [], r.stdout); });
