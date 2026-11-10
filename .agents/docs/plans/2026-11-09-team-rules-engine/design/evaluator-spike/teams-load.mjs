// Spike of where teams.json is and how it is validated on load (owner rulings R21 and R22, design chapter 01 sections 4 and 5).
// The location comes from the actionable repository's .backlog/config.json: its key teams_file, else the repository's folder in a
// configured backlog repository (<backlog folder>/<owner>/<name>/teams.json), else .backlog/teams.json. The SHA of the validated file is
// kept in the same configuration (key teams_file_sha). The record of the last valid validation (the valid teams, the time) and the
// validated copy live in the user's per-user state, so that within 24 hours a command neither reads nor validates the file again.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Refusal, validate } from './evaluator.mjs';

const DAY = 24 * 3600 * 1000;
const CONFIG = '.backlog/config.json';
const sha = text => createHash('sha256').update(text).digest('hex');
const tryRead = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
// An unparsable configuration stops every command (exit 2) and is never overwritten (review C M10); a missing one is empty.
export function readConfig(top) {
  const text = tryRead(join(top, CONFIG));
  if (text === null) return { cfg: {}, exists: false };
  let cfg; try { cfg = JSON.parse(text); } catch (e) { throw new Refusal(`${CONFIG} cannot be read (${e.message}); fix it: no command runs and nothing is written while it cannot be read`, 2); }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Refusal(`${CONFIG} cannot be read (it is not a JSON object); fix it: no command runs and nothing is written while it cannot be read`, 2);
  return { cfg, exists: true };
}
// a path below a root, compared by segments: a folder named "..backlog" is inside (review C L3)
const below = (root, p) => { const r = relative(root, p); return r === '' || !(r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r)); };

// top: the working copy's repository; home: the backlog folder the CLI resolved (however it was resolved: a configuration key, the
// session variable or the per-user record, question 6); repo: owner/name of the actionable repository (the repository input when given,
// question 1); workRepo: owner/name of the working copy. shaIn says where the SHA of R21 is kept: the working copy's configuration when
// it exists and belongs to the actionable repository, else the per-user record (the CLI never creates .backlog/config.json for it).
export function teamsFile({ top, home, repo, workRepo = repo, cfg, exists = true }) {
  if (cfg === undefined) ({ cfg, exists } = readConfig(top));
  const folder = join(home, ...repo.split('/'), 'teams.json');
  if (repo !== workRepo) return { path: folder, how: 'the repository input', shaIn: 'record' };
  const shaIn = exists ? 'config' : 'record';
  if (typeof cfg.teams_file === 'string' && cfg.teams_file.trim()) return { path: resolve(top, cfg.teams_file.trim()), how: 'the teams_file key', shaIn };
  if (!below(top, home)) return { path: folder, how: 'the backlog repository folder', shaIn };
  return { path: join(top, '.backlog', 'teams.json'), how: 'the default .backlog/teams.json', shaIn };
}
export const missingText = path => `no team file at ${path}; name one with the "teams_file" key of .backlog/config.json, or put it at <backlog repository>/<owner>/<name>/teams.json when the backlog folder lies outside the repository, else at .backlog/teams.json`;
export const recordPaths = (stateDir, file) => { const key = sha(file).slice(0, 16); const d = join(stateDir, 'smooth-backlog-cli', 'teams-validation'); return { dir: d, record: join(d, `${key}.json`), copy: join(d, `${key}.teams.json`) }; };
function writeSha(top, value) { // the one key the CLI writes into the committed configuration (R22); a read-only checkout is skipped silently
  const { cfg } = readConfig(top);
  if (cfg.teams_file_sha === value) return;
  try { writeFileSync(join(top, `${CONFIG}.tmp`), `${JSON.stringify({ ...cfg, teams_file_sha: value }, null, 2)}\n`); renameSync(join(top, `${CONFIG}.tmp`), join(top, CONFIG)); } catch { /* not writable */ }
}
// the file and every folder between its root (the repository or the backlog folder that holds it) and the file: never a symbolic link
function assertPlain(path, roots) {
  const isLink = p => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  if (isLink(path)) throw new Refusal(`${path} is a symbolic link; the team file must be a plain file`, 2);
  const root = roots.find(r => below(r, path));
  if (root) for (let d = dirname(path); d !== root && below(root, d); d = dirname(d)) if (isLink(d)) throw new Refusal(`${d} is a symbolic link; no folder between ${root} and the team file may be one`, 2);
}

// team: a team name, or null for --show-all. full: backlog team validate (always reads, validates and refreshes).
export function loadTeams({ top, home, repo, workRepo = repo, stateDir, team, now, full = false }) {
  const { cfg, exists } = readConfig(top);
  const { path, shaIn } = teamsFile({ top, home, repo, workRepo, cfg, exists });
  const paths = recordPaths(stateDir, path);
  let rec; try { rec = JSON.parse(tryRead(paths.record)); } catch { rec = null; }
  const recorded = shaIn === 'config' ? cfg.teams_file_sha : rec?.sha;
  if (!full && recorded && rec) {
    const copy = tryRead(paths.copy);
    const age = Date.parse(now) - Date.parse(rec.validated_at);
    // the configuration's SHA names what this branch's teams.json should be: a record of another version is not used (lead decision c);
    // a record dated in the future (clock skew) is stale (review C L1)
    if (copy && sha(copy) === recorded && rec.sha === recorded && age >= 0 && age < DAY) {
      const valid = rec.valid_teams.split(','); const file = JSON.parse(copy);
      if (team === null ? Object.keys(file).every(t => valid.includes(t)) : valid.includes(team)) return { file, from: 'record' };
    }
  }
  assertPlain(path, [top, home]);
  const text = tryRead(path);
  if (text === null) throw new Refusal(missingText(path), 2);
  let file; try { file = JSON.parse(text); } catch (e) { throw new Refusal(`${path} cannot be read (${e.message}); fix it and run backlog team validate`, 2); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Refusal(`${path} cannot be read (it is not a JSON object); fix it and run backlog team validate`, 2);
  const findings = validate(file);
  const bad = new Set(findings.map(f => f.team));
  const valid = Object.keys(file).filter(t => !bad.has(t));
  // the refusal comes first: a refused command writes nothing, no SHA, no record, no copy (R18, review C H1)
  if (!full) {
    if (team === null) { if (bad.size) throw new Refusal(`${path} fails validation for ${[...bad].join(', ')}; run backlog team validate --show-all`, 2); }
    else if (!(team in file)) throw new Refusal(`team ${team} has no entry in ${path} (teams: ${Object.keys(file).join(', ')})`, 1);
    else if (bad.has(team)) throw new Refusal(`team ${team} fails validation in ${path}; run backlog team validate --team ${team}`, 2);
  }
  if (valid.length) { // the SHA, the record and the copy change only after a validation that found valid teams (lead decision c)
    if (shaIn === 'config') writeSha(top, sha(text));
    try {
      mkdirSync(paths.dir, { recursive: true });
      writeFileSync(`${paths.copy}.tmp`, text); renameSync(`${paths.copy}.tmp`, paths.copy);
      writeFileSync(`${paths.record}.tmp`, JSON.stringify({ sha: sha(text), valid_teams: valid.join(','), validated_at: now })); renameSync(`${paths.record}.tmp`, paths.record);
    } catch { /* a state folder that cannot be written: every command validates in full, silently */ }
  }
  return full ? { file, from: 'disk', findings } : { file, from: 'disk' };
}
