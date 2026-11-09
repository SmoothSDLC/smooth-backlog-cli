// Spike of where teams.json is and how it is validated on load (owner rulings R21 and R22, design chapter 01 sections 4 and 5).
// The location comes from the actionable repository's .backlog/config.json: its key teams_file, else the repository's folder in a
// configured backlog repository (<backlog folder>/<owner>/<name>/teams.json), else .backlog/teams.json. The SHA of the validated file is
// kept in the same configuration (key teams_file_sha). The record of the last valid validation (the valid teams, the time) and the
// validated copy live in the user's per-user state, so that within 24 hours a command neither reads nor validates the file again.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Refusal, validate } from './evaluator.mjs';

const DAY = 24 * 3600 * 1000;
const CONFIG = '.backlog/config.json';
const sha = text => createHash('sha256').update(text).digest('hex');
const tryRead = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const readConfig = top => { try { const c = JSON.parse(readFileSync(join(top, CONFIG), 'utf8')); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; } catch { return {}; } };

// top: the actionable repository; home: the backlog folder the CLI resolved; repo: owner/name of the repository folder.
export function teamsFile({ top, home, repo, cfg = readConfig(top) }) {
  if (typeof cfg.teams_file === 'string' && cfg.teams_file.trim()) return { path: resolve(top, cfg.teams_file.trim()), how: 'the teams_file key' };
  const inside = !relative(top, home).startsWith('..') && !isAbsolute(relative(top, home));
  if (!inside) return { path: join(home, ...repo.split('/'), 'teams.json'), how: 'the configured backlog repository' };
  return { path: join(top, '.backlog', 'teams.json'), how: 'the default .backlog/teams.json' };
}
export const missingText = path => `no team file at ${path}; name one with the "teams_file" key of .backlog/config.json, or put it at <backlog repository>/<owner>/<name>/teams.json when the configuration names a backlog repository, else at .backlog/teams.json`;
export const recordPaths = (stateDir, file) => { const key = sha(file).slice(0, 16); const d = join(stateDir, 'smooth-backlog-cli', 'teams-validation'); return { dir: d, record: join(d, `${key}.json`), copy: join(d, `${key}.teams.json`) }; };
function writeSha(top, value) { // the one key the CLI writes into the committed configuration (R22); a read-only checkout is skipped silently
  const cfg = readConfig(top);
  if (cfg.teams_file_sha === value) return;
  try { mkdirSync(join(top, '.backlog'), { recursive: true }); writeFileSync(join(top, `${CONFIG}.tmp`), `${JSON.stringify({ ...cfg, teams_file_sha: value }, null, 2)}\n`); renameSync(join(top, `${CONFIG}.tmp`), join(top, CONFIG)); } catch { /* not writable */ }
}

// team: a team name, or null for --show-all. full: backlog team validate (always reads, validates and refreshes).
export function loadTeams({ top, home, repo, stateDir, team, now, full = false }) {
  const { path } = teamsFile({ top, home, repo });
  const paths = recordPaths(stateDir, path);
  const recorded = readConfig(top).teams_file_sha;
  if (!full && recorded) {
    let rec; try { rec = JSON.parse(tryRead(paths.record)); } catch { rec = null; }
    const copy = rec && tryRead(paths.copy);
    // the configuration's SHA names what this branch's teams.json should be: a record of another version is not used (lead decision c)
    if (rec && copy && sha(copy) === recorded && rec.sha === recorded && Date.parse(now) - Date.parse(rec.validated_at) < DAY) {
      const valid = rec.valid_teams.split(','); const file = JSON.parse(copy);
      if (team === null ? Object.keys(file).every(t => valid.includes(t)) : valid.includes(team)) return { file, from: 'record' };
    }
  }
  let link = false; try { link = lstatSync(path).isSymbolicLink(); } catch { /* missing: below */ }
  if (link) throw new Refusal(`${path} is a symbolic link; the team file must be a plain file`, 2);
  const text = tryRead(path);
  if (text === null) throw new Refusal(missingText(path), 2);
  let file; try { file = JSON.parse(text); } catch (e) { throw new Refusal(`${path} cannot be read (${e.message}); fix it and run backlog team validate`, 2); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Refusal(`${path} cannot be read (it is not a JSON object); fix it and run backlog team validate`, 2);
  const findings = validate(file);
  const bad = new Set(findings.map(f => f.team));
  const valid = Object.keys(file).filter(t => !bad.has(t));
  if (valid.length) { // the SHA, the record and the copy change only after a validation that found valid teams (lead decision c)
    writeSha(top, sha(text));
    try {
      mkdirSync(paths.dir, { recursive: true });
      writeFileSync(`${paths.copy}.tmp`, text); renameSync(`${paths.copy}.tmp`, paths.copy);
      writeFileSync(`${paths.record}.tmp`, JSON.stringify({ sha: sha(text), valid_teams: valid.join(','), validated_at: now })); renameSync(`${paths.record}.tmp`, paths.record);
    } catch { /* a state folder that cannot be written: every command validates in full, silently */ }
  }
  if (full) return { file, from: 'disk', findings };
  if (team === null) { if (bad.size) throw new Refusal(`${path} fails validation for ${[...bad].join(', ')}; run backlog team validate --show-all`, 2); }
  else if (!(team in file)) throw new Refusal(`team ${team} has no entry in ${path} (teams: ${Object.keys(file).join(', ')})`, 1);
  else if (bad.has(team)) throw new Refusal(`team ${team} fails validation in ${path}; run backlog team validate --team ${team}`, 2);
  return { file, from: 'disk' };
}
