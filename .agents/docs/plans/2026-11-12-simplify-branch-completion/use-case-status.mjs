#!/usr/bin/env node
// The use-case status table of the plan beside this folder: one row per use case of every source.
//   node use-case-status.mjs check                      the guard: denominators, one status per row, counts
//   node use-case-status.mjs counts                     rewrite source-counts.tsv from the table
//   node use-case-status.mjs init [--case-tests <tap>]  build the first table from the sources (refuses to overwrite)
// After `init` the table is edited by hand: the commit that delivers a use case moves its row to DONE.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const ENGINE = '.agents/docs/plans/2026-11-09-team-rules-engine';
const PLAN = join(HERE, '..', '2026-11-12-simplify-branch-completion.md');
const TABLE = join(HERE, 'use-case-status.tsv');
const COUNTS = join(HERE, 'source-counts.tsv');
const HEADER = ['source', 'id', 'statement', 'decision', 'status', 'task', 'test', 'evidence'];
const STATUSES = ['DONE', 'PLANNED', 'SUPERSEDED', 'DEFERRED-WITH-EXPLICIT-BLOCKER'];
// Rows of the sources that state no behaviour of the CLI are not use cases: they are listed here with the reason, so that
// every source row is still accounted for, and they are not in the table.
const EXCLUDED = join(HERE, 'not-use-cases.tsv');
const readExcluded = () => readFileSync(EXCLUDED, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const SOURCES = {
  'uc-matrix': '.agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md',
  'rule-cases': `${ENGINE}/design/rule-cases.json`,
  coverage: `${ENGINE}/design/coverage.tsv`,
  'bdd-plan': `${ENGINE}/implementation/02-bdd-plan.md`,
  'command-matrix': `${ENGINE}/01-command-behaviour-matrix.md`,
  features: 'features',
  'inventory.tsv': `${ENGINE}/reference/inventory.tsv`,
  'tests.tsv': `${ENGINE}/reference/tests.tsv`,
  'gaps.tsv': `${ENGINE}/reference/gaps.tsv`,
  'consumers.tsv': `${ENGINE}/reference/consumers.tsv`,
};

const read = p => readFileSync(join(ROOT, p), 'utf8');
const clean = s => String(s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const short = s => { const c = clean(s); return c.length > 200 ? `${c.slice(0, 197)}...` : c; };
// The 2026-10-25 analysis names the agents and tools of one team; the table states its use cases without them.
const neutral = s => s.replace(/QWEN_\w+/g, 'an agent variable').replace(/\b(cody|archy|qwen|claude|codex)\b/gi, 'agent');
const tsv = p => read(p).split('\n').filter(Boolean).map(l => l.split('\t'));

// Every data row of every markdown table: { section, cells }. `skip(header)` drops a whole table.
function tableRows(text, sectionOf, skip = () => false) {
  const lines = text.split('\n'), rows = [];
  let section = '0', skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const s = sectionOf(lines[i]);
    if (s) section = s;
    if (!lines[i].startsWith('|')) continue;
    const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (/^:?-{2,}/.test(cells[0])) continue;
    if (/^\|\s*:?-{2,}/.test(lines[i + 1] ?? '')) { skipping = skip(cells); continue; }
    if (!skipping) rows.push({ section, cells });
  }
  return rows;
}
const numbered = (rows, prefix) => {
  const n = {};
  return rows.map(r => ({ ...r, id: `${prefix}-${r.section}-${String(n[r.section] = (n[r.section] ?? 0) + 1).padStart(2, '0')}` }));
};

// One extractor per source: [{ id, statement, ...fields the first classification reads }].
const EXTRACT = {
  'uc-matrix'() { // every table row of the analysis except its legend ("Key") table
    const rows = tableRows(read(SOURCES['uc-matrix']), l => /^## /.test(l) && (l.match(/^## (\d+)\./)?.[1] ?? '0'), h => h[0] === 'Key');
    const n = {};
    return rows.map(r => {
      const first = r.cells[0].replace(/\*/g, '');
      const m = first.match(/^(UC-\d{3}|GAP-\d{2}|INV-\d{2}|C-\d{2}|A\d|S\d|F\d{2}(?:–F\d{2})?|R\d{2})(?=\s|$)/);
      const id = m ? (m[1].startsWith('R') ? `RISK-${m[1]}` : m[1]) : `M${r.section}-${String(n[r.section] = (n[r.section] ?? 0) + 1).padStart(2, '0')}`;
      return { id, statement: neutral(short(r.cells.slice(m && m[0] === first ? 1 : 0, 6).join(' | '))), text: r.cells.join(' | ') };
    });
  },
  'rule-cases'() {
    return JSON.parse(read(SOURCES['rule-cases'])).cases.map(c => ({ id: c.id, statement: short(`${c.rule_set ?? ''} ${c.rule ?? 'coded'}: ${c.command.run} ${c.command.step ?? ''} expects exit ${c.expect?.exit ?? '?'}`), c }));
  },
  coverage() {
    return tsv(SOURCES.coverage).slice(1).map(([src, id, ref, state, target, reason]) => ({ id: `${src}:${id}`, statement: short(`${ref} | ${target}`), src, rawId: id, state, target, reason }));
  },
  'bdd-plan'() {
    return numbered(tableRows(read(SOURCES['bdd-plan']), l => l.match(/^#{2,3} (\d+(?:\.\d+)?)/)?.[1]), 'BDD').map(r => ({ id: r.id, statement: short(r.cells.join(' | ')), text: r.cells.join(' | '), section: r.section }));
  },
  'command-matrix'() {
    const sec = l => (/^## Group (\d)/.test(l) ? `G${l.match(/^## Group (\d)/)[1]}` : /^## Commands that behave the same/.test(l) ? 'G3' : null);
    return numbered(tableRows(read(SOURCES['command-matrix']), sec), 'CBM').map(r => ({ id: r.id, statement: short(r.cells.join(' | ')) }));
  },
  features() {
    const files = execFileSync('git', ['ls-files', 'features/*.feature'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    const out = [], seen = {};
    for (const f of files) for (const l of read(f).split('\n')) {
      const m = l.match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/);
      if (!m) continue;
      const base = `${f.slice('features/'.length)}#${clean(m[1])}`;
      seen[base] = (seen[base] ?? 0) + 1;
      out.push({ id: seen[base] > 1 ? `${base} (${seen[base]})` : base, statement: short(m[1]), file: f, name: clean(m[1]) });
    }
    return out;
  },
};
for (const name of ['inventory.tsv', 'tests.tsv', 'gaps.tsv', 'consumers.tsv']) {
  EXTRACT[name] = () => tsv(SOURCES[name]).slice(1).map(c => ({ id: c[0], statement: short(c.slice(1).filter(Boolean).join(' | ')), cells: c }));
}

const readTable = () => readFileSync(TABLE, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
const countsOf = rows => {
  const by = {};
  for (const r of rows) (by[r[0]] ??= Object.fromEntries(STATUSES.map(s => [s, 0])))[r[4]]++;
  const all = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const lines = [['source', ...STATUSES, 'total'].join('\t')];
  for (const s of Object.keys(SOURCES)) {
    if (!by[s]) continue;
    STATUSES.forEach(k => (all[k] += by[s][k]));
    lines.push([s, ...STATUSES.map(k => by[s][k]), STATUSES.reduce((a, k) => a + by[s][k], 0)].join('\t'));
  }
  lines.push(['all', ...STATUSES.map(k => all[k]), STATUSES.reduce((a, k) => a + all[k], 0)].join('\t'));
  return `${lines.join('\n')}\n`;
};

function check() {
  const errors = [], [header, ...rows] = readTable();
  const out = {};
  for (const [source, id, reason] of readExcluded()) { (out[source] ??= new Set()).add(id); if (!reason) errors.push(`${source} ${id}: excluded without a reason`); }
  if (header.join('\t') !== HEADER.join('\t')) errors.push(`header is not ${HEADER.join(', ')}`);
  const tasks = new Set([...readFileSync(PLAN, 'utf8').matchAll(/^### (Task [0-9a-z]+):/gm)].map(m => m[1]));
  const ids = {};
  for (const r of rows) {
    const [source, id, , decision, status, task, test, evidence] = r, at = `${source} ${id}`;
    if (r.length !== HEADER.length) { errors.push(`${at}: ${r.length} columns`); continue; }
    if (!SOURCES[source]) errors.push(`${at}: unknown source`);
    if ((ids[source] ??= new Set()).has(id)) errors.push(`${at}: listed twice`);
    ids[source].add(id);
    if (!STATUSES.includes(status)) errors.push(`${at}: status "${status}" is not one of ${STATUSES.join(', ')}`);
    if (!decision) errors.push(`${at}: no decision`);
    if (status === 'DONE' && (!test || !evidence)) errors.push(`${at}: DONE needs a test and a commit`);
    if (status === 'DONE' && test && !existsSync(join(ROOT, test.split(' :: ')[0]))) errors.push(`${at}: its test file ${test.split(' :: ')[0]} does not exist`);
    if (status === 'PLANNED' && !tasks.has(task)) errors.push(`${at}: PLANNED needs a task of the plan, got "${task}"`);
  }
  const counts = existsSync(COUNTS) ? readFileSync(COUNTS, 'utf8') : '';
  const pinned = Object.fromEntries(counts.split('\n').slice(1).filter(Boolean).map(l => [l.split('\t')[0], Number(l.split('\t').at(-1))]));
  for (const [source, path] of Object.entries(SOURCES)) {
    const have = new Set([...(ids[source] ?? []), ...(out[source] ?? [])]);
    for (const id of out[source] ?? []) if (ids[source]?.has(id)) errors.push(`${source} ${id}: both a use case and excluded`);
    if (existsSync(join(ROOT, path))) { // the source is still in the repository: the table holds exactly its use cases
      const want = new Set(EXTRACT[source]().map(u => u.id));
      for (const id of want) if (!have.has(id)) errors.push(`${source} ${id}: in the source, neither in the table nor excluded`);
      for (const id of have) if (!want.has(id)) errors.push(`${source} ${id}: in the table or excluded, not in the source`);
    } else if ((ids[source]?.size ?? 0) !== pinned[source]) errors.push(`${source}: removed from the repository; the table holds ${ids[source]?.size ?? 0} rows, source-counts.tsv pins ${pinned[source]}`);
  }
  if (counts !== countsOf(rows)) errors.push('source-counts.tsv does not match the table: run `node use-case-status.mjs counts`');
  if (errors.length) { console.error(errors.slice(0, 40).join('\n')); console.error(`${errors.length} problem(s)`); process.exit(1); }
  process.stdout.write(counts);
}

// ---- The first classification (2026-11-12). Evidence is mechanical; a row with none is PLANNED under the task that pins it.
function init(args) {
  if (existsSync(TABLE) && !args.includes('--force')) { console.error('the table exists; it is edited by hand from here on (--force rebuilds it)'); process.exit(1); }
  const tap = args.includes('--case-tests') ? readFileSync(args[args.indexOf('--case-tests') + 1], 'utf8') : '';
  const commitOf = (() => { const c = {}; return f => (c[f] ??= execFileSync('git', ['log', '-1', '--format=%h', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim()); })();
  const VERIFY = { matrix: 'Task 36', coverage: 'Task 37', plans: 'Task 38' };
  const out = [];
  const row = (source, u, decision, status, task = '', test = '', evidence = '') => out.push([source, u.id, u.statement, clean(decision), status, task, clean(test), evidence]);
  const done = (source, u, decision, file, title) => row(source, u, decision, 'DONE', 'merged', `${file} :: ${title}`, commitOf(file));

  // 1. features: every scenario is run in both storage locations by the feature runner.
  for (const u of EXTRACT.features()) done('features', u, 'every BDD scenario passes in both storage locations (2026-11-04-simplification-plan.md, Task 8; the feature runner .agents/test/features.test.js)', u.file, u.name);

  // 2. rule cases: DONE when a passing test is titled with the case id.
  const titled = {}; // case id -> [file, title], the command-level replay preferred
  for (const l of tap.split('\n')) {
    const m = l.match(/^(\S+)\tok \d+ - ((\S+): .*)$/);
    if (m && (!titled[m[3]] || m[1].endsWith('team-commands.test.js'))) titled[m[3]] = [m[1], m[2]];
  }
  const CASE_TASK = { 'R19A/user-show': 'Task 18', 'R16/user-show': 'Task 11', 'R16/user-ref': 'Task 11', 'R19/user-set': 'Task 13', 'R17/migrate-check': 'Task 25', 'R17/migrate-ask': 'Task 26' };
  const caseState = {}, cases = EXTRACT['rule-cases']();
  for (const u of cases) {
    const ruling = u.id.match(/^R(\d+A?)-/);
    const decision = ruling ? `owner ruling R${ruling[1].toLowerCase()} (00-owner-rulings.md)` : `the rule ${u.c.rule ?? '(coded check)'} of the example rule set ${u.c.rule_set ?? '-'} (design chapters 03 and 08)`;
    if (titled[u.id]) { caseState[u.id] = { status: 'DONE' }; done('rule-cases', u, decision, ...titled[u.id]); } else {
      const task = CASE_TASK[`${u.id.split('-')[0]}/${u.c.command.run}`] ?? VERIFY.coverage;
      caseState[u.id] = { status: 'PLANNED', task }; row('rule-cases', u, decision, 'PLANNED', task);
    }
  }
  const pinnedRules = new Set(cases.filter(u => caseState[u.id].status === 'DONE').map(u => `${u.c.rule_set}/${u.c.rule}`));
  const casesOfRule = name => cases.filter(u => `${u.c.rule_set}/${u.c.rule}` === name).map(u => u.id);
  const caseIds = text => { // "cases PAT-36 to PAT-41", "case R22-06"
    const ids = [];
    for (const m of text.matchAll(/\bcases? ((?:[A-Z0-9]+-\d{2}(?:,? (?:to|and) |, )?)+)/g)) {
      const list = [...m[1].matchAll(/([A-Z0-9]+)-(\d{2})( to )?/g)];
      for (let i = 0; i < list.length; i++) {
        if (list[i][3] && list[i + 1]) { for (let n = +list[i][2]; n <= +list[i + 1][2]; n++) ids.push(`${list[i][1]}-${String(n).padStart(2, '0')}`); i++; } else ids.push(`${list[i][1]}-${list[i][2]}`);
      }
    }
    return ids;
  };
  const byCases = (source, u, decision, ids) => { // DONE when every named case is DONE, else PLANNED under the first open case's task
    if (!ids.length || ids.some(i => !caseState[i])) return false;
    const open = ids.find(i => caseState[i].status !== 'DONE');
    if (open) row(source, u, decision, 'PLANNED', caseState[open].task);
    else done(source, u, decision, '.agents/test/team-commands.test.js', `the cases ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ` and ${ids.length - 12} more` : ''} (replayed case by case)`);
    return true;
  };

  // 3. coverage: the design disposition decides; BAKE-IN and LAZY-LOAD rows need evidence of their own.
  const testTitle = Object.fromEntries(EXTRACT['tests.tsv']().map(u => [u.id, { file: `.agents/test/${u.cells[1].split(':')[0]}`, title: u.cells[6] ?? '' }]));
  const KEYWORD_TASK = [
    [/--ask repairs|migrate --ask/, 'Task 26'], [/reports every missing/, 'Task 25'],
    [/migrat.*(unbind|split|priority|archived items)|(unbind|split items|archived items).*migrat/, 'Task 24'],
    [/backlog team migrate|the migration|migrate /, 'Task 23'],
    [/clean (removes only|runs setup)|user command clean/, 'Task 17'],
    [/R19a guard|every user command fails with the blanket text|empty team variable/, 'Task 18'],
    [/unpublished-commit guard|conflict guard|guards look only/, 'Task 21'], [/foreign/, 'Task 22'],
    [/templates\/workflows is deleted/, 'Task 29'],
    [/--show-all.*(may set values|allows for done|may change)/, 'Task 13'], [/show-all/, 'Task 11'],
    [/help texts|every command with its scenario/, 'Task 32'],
  ];
  const coverageState = {};
  for (const u of EXTRACT.coverage()) {
    const before = out.length, text = `${u.target} ${u.reason}`;
    if (u.state === 'SKIP') row('coverage', u, u.reason || u.target, 'SKIP');
    else if (u.state === 'DEFERRED-WITH-EXPLICIT-BLOCKER') {
      if (/owner question Q-/.test(u.target)) row('coverage', u, `blocker: ${u.target}`, 'DEFERRED-WITH-EXPLICIT-BLOCKER', 'Task 48');
      else row('coverage', u, u.target, 'PLANNED', /entry plan Task 8/.test(u.target) ? 'Task 48' : /changes this consumer/.test(u.target) ? 'Task 46' : 'Task 43');
    } else {
      const decision = `design disposition ${u.state}: ${u.target}${u.reason ? ` (${u.reason})` : ''}`;
      const rules = [...u.target.matchAll(/\b([a-z-]+\/[a-z0-9:-]+)\b/g)].map(m => m[1]);
      const t = u.src === 'tests.tsv' ? testTitle[u.rawId] : null;
      if (/^(example|pattern): /.test(u.target) && rules.length && rules.every(r => pinnedRules.has(r))) byCases('coverage', u, decision, rules.flatMap(casesOfRule));
      else if (byCases('coverage', u, decision, caseIds(text))) { /* pinned by the named cases */ }
      else if (t && t.title && existsSync(join(ROOT, t.file)) && read(t.file).includes(t.title)) done('coverage', u, decision, t.file, t.title);
      else row('coverage', u, decision, 'PLANNED', KEYWORD_TASK.find(([re]) => re.test(text))?.[1] ?? VERIFY.coverage);
    }
    coverageState[u.id] = out[before];
  }
  // 4. the reference tables are the inputs of the coverage file: each row takes the state of its coverage row.
  for (const name of ['inventory.tsv', 'tests.tsv', 'gaps.tsv', 'consumers.tsv']) for (const u of EXTRACT[name]()) {
    const c = coverageState[`${name}:${u.id}`];
    if (c) out.push([name, u.id, u.statement, `as its coverage row ${name}:${u.id}`, ...c.slice(4)]);
    else row(name, u, 'no coverage row carries this id', 'PLANNED', VERIFY.coverage);
  }

  // 5. the BDD and test plan: a row whose cases are all pinned is DONE; the others wait for the task of their batch.
  const BATCH_TASK = { B16: 'Task 9', B17: 'Task 11', B18: 'Task 13', B19: 'Task 16', B20: 'Task 18', B21: 'Task 20', B22: 'Task 23', B23: 'Task 24', B24: 'Task 25', B27: 'Task 27', B28: 'Task 30', B29: 'Task 32' };
  for (const u of EXTRACT['bdd-plan']()) {
    const decision = `the BDD and test plan, section ${u.section} (02-bdd-plan.md), under the owner rulings and design decisions`;
    const prefix = u.section === '2.1' && u.text.match(/^([A-Z0-9]+) /)?.[1];
    const ids = prefix ? cases.filter(c => c.id.startsWith(`${prefix}-`)).map(c => c.id) : [];
    if (u.section === '4') row('bdd-plan', u, decision, 'PLANNED', 'Task 47');
    else if (!byCases('bdd-plan', u, decision, ids)) { // one open batch names the task; a row of several batches is checked in the verification task
      const batches = [...new Set([...u.text.matchAll(/\bB\d{2}/g)].map(m => m[0]))];
      row('bdd-plan', u, decision, 'PLANNED', (batches.length === 1 && BATCH_TASK[batches[0]]) || VERIFY.plans);
    }
  }
  for (const u of EXTRACT['command-matrix']()) row('command-matrix', u, 'the command behaviour matrix (01-command-behaviour-matrix.md), column Target, under owner rulings R1 to R25', 'PLANNED', VERIFY.plans);

  // 6. the analysis of 2026-10-25 was written before the simplification: its work units build nothing; every other row is
  //    re-read against the decisions named here in the task that pins or retires it.
  for (const u of EXTRACT['uc-matrix']()) {
    const d = [];
    if (/SQLite|\bDB\b|mirror|journal|relational|view cache/i.test(u.text)) d.push('no committed database: item files and the committed index are the store (2026-11-04-simplification-plan.md, decision D; phases 3, 4 and 6)');
    if (/\b(LOCAL|SHARED|MODE|mode)\b/.test(u.text)) d.push('one command set with no mode; where the item files live is a storage setting (2026-11-04-simplification-plan.md, decision A)');
    if (/team|pop|review|lead|claim/i.test(u.text)) d.push('team behaviour is the rule set of the team file, evaluated by the team commands (00-owner-rulings.md, R1 to R25)');
    if (/stale|two clones|2 clones|push|race|concurren/i.test(u.text)) d.push('pull before every command, push after every change, stale writes rejected (phase 5 of the simplification)');
    if (!d.length) d.push('the simplification plan and the owner rulings R1 to R25 (2026-11-04-simplification-plan.md, 00-owner-rulings.md)');
    if (/^A\d$/.test(u.id)) row('uc-matrix', u, 'a work unit of the 2026-10-25 analysis, not a behaviour of the CLI', 'SKIP');
    else row('uc-matrix', u, d.join('; '), 'PLANNED', VERIFY.matrix);
  }

  const order = Object.keys(SOURCES);
  out.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const kept = out.filter(r => r[4] !== 'SKIP'); // a row with no behaviour to build is not a use case
  writeFileSync(EXCLUDED, `${[['source', 'id', 'reason', 'statement'], ...out.filter(r => r[4] === 'SKIP').map(r => [r[0], r[1], r[3], r[2]])].map(r => r.join('\t')).join('\n')}\n`);
  writeFileSync(TABLE, `${[HEADER, ...kept].map(r => r.join('\t')).join('\n')}\n`);
  writeFileSync(COUNTS, countsOf(kept));
  process.stdout.write(countsOf(kept));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'check') check();
else if (cmd === 'counts') { writeFileSync(COUNTS, countsOf(readTable().slice(1))); process.stdout.write(readFileSync(COUNTS, 'utf8')); }
else if (cmd === 'init') init(args);
else { console.error('usage: node use-case-status.mjs check | counts | init [--case-tests <tap listing>] [--force]'); process.exit(2); }
