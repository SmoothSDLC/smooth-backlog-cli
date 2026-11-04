// A small Gherkin reader and runner for the Node test runner: Feature, Background, Scenario, Given/When/Then/And/But,
// one-line steps with "quoted" or `backticked` arguments. No tags, outlines or tables: every workflow here is a
// plain sequence of commands and checks. shortcut: no Scenario Outline, add one when a scenario needs a table.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function parseFeature(text, file) {
  const feature = { file, name: '', background: [], scenarios: [] };
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = /^Feature:\s*(.*)$/.exec(line))) feature.name = m[1];
    else if (/^Background:/.test(line)) current = feature.background;
    else if ((m = /^Scenario:\s*(.*)$/.exec(line))) { current = []; feature.scenarios.push({ name: m[1], steps: current }); }
    else if ((m = /^(Given|When|Then|And|But)\s+(.*)$/.exec(line))) {
      if (!current) throw new Error(`${file}: step before any Scenario: ${line}`);
      current.push(m[2]);
    } else if (current === null && feature.name) continue; // the feature's description lines
    else throw new Error(`${file}: unreadable line: ${line}`);
  }
  return feature;
}

export function loadFeatures(dir) {
  return readdirSync(dir).filter(n => n.endsWith('.feature')).sort()
    .map(n => parseFeature(readFileSync(join(dir, n), 'utf8'), n));
}

// Step definitions: a regular expression and a function (world, ...captures).
const definitions = [];
export const step = (pattern, fn) => definitions.push({ pattern, fn });

export async function runStep(text, world) {
  const hits = definitions.filter(d => d.pattern.test(text));
  if (hits.length !== 1) throw new Error(`${hits.length ? 'ambiguous' : 'undefined'} step: ${text}`);
  const captures = [...text.match(hits[0].pattern)].slice(1);
  await hits[0].fn(world, ...captures);
}

export async function runScenario(feature, scenario, world) {
  for (const text of [...feature.background, ...scenario.steps]) {
    try { await runStep(text, world); }
    catch (e) {
      const last = world.last ? `\n  last command: backlog ${world.last.args.join(' ')} (exit ${world.last.status})\n  stdout: ${world.last.stdout.trim()}\n  stderr: ${world.last.stderr.trim()}` : '';
      throw new Error(`${feature.file} / ${scenario.name}\n  at step: ${text}\n  ${e.message}${last}`, { cause: e });
    }
  }
}
