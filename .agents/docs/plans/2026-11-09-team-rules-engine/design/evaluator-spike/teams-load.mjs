// Spike of the validation of teams.json on load (owner ruling R21, design chapter 01 section 4). The record (the SHA of the file, the
// valid teams as a comma separated list, the time of the validation) and the validated copy live in the per-user configuration folder
// of the CLI, outside every repository. While the record is less than 24 hours old and names the team, a command uses the validated copy
// and does not read teams.json; otherwise it reads the file and validates it in full. The CLI says nothing about the record.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Refusal, validate } from './evaluator.mjs';

const DAY = 24 * 3600 * 1000;
const sha = text => createHash('sha256').update(text).digest('hex');
export const recordPaths = (configDir, home) => { const key = sha(home).slice(0, 16); const d = join(configDir, 'smooth-backlog-cli', 'teams-validation'); return { dir: d, record: join(d, `${key}.json`), copy: join(d, `${key}.teams.json`) }; };
const tryRead = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

// team: a team name, or null for --show-all. full: backlog team validate (always reads, validates and refreshes).
export function loadTeams({ home, configDir, team, now, full = false }) {
  const paths = recordPaths(configDir, home);
  if (!full) {
    let rec; try { rec = JSON.parse(tryRead(paths.record)); } catch { rec = null; }
    const copy = rec && tryRead(paths.copy);
    if (rec && copy && sha(copy) === rec.sha && Date.parse(now) - Date.parse(rec.validated_at) < DAY) {
      const valid = rec.valid_teams.split(',');
      const file = JSON.parse(copy);
      if (team === null ? Object.keys(file).every(t => valid.includes(t)) : valid.includes(team)) return { file, from: 'record' };
    }
  }
  const text = tryRead(join(home, 'teams.json'));
  if (text === null) throw new Refusal('teams.json cannot be read (it is missing or unreadable); fix it and run backlog team validate', 2);
  let file; try { file = JSON.parse(text); } catch (e) { throw new Refusal(`teams.json cannot be read (${e.message}); fix it and run backlog team validate`, 2); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Refusal('teams.json cannot be read (it is not a JSON object); fix it and run backlog team validate', 2);
  const findings = validate(file);
  const bad = new Set(findings.map(f => f.team));
  const valid = Object.keys(file).filter(t => !bad.has(t));
  if (valid.length) { // the record and the copy change only when a validation found valid teams (lead decision c)
    try {
      mkdirSync(paths.dir, { recursive: true });
      writeFileSync(`${paths.copy}.tmp`, text); renameSync(`${paths.copy}.tmp`, paths.copy);
      writeFileSync(`${paths.record}.tmp`, JSON.stringify({ sha: sha(text), valid_teams: valid.join(','), validated_at: now })); renameSync(`${paths.record}.tmp`, paths.record);
    } catch { /* a folder that cannot be written: every command validates in full, silently */ }
  }
  if (full) return { file, from: 'disk', findings };
  if (team === null) { if (bad.size) throw new Refusal(`teams.json fails validation for ${[...bad].join(', ')}; run backlog team validate --show-all`, 2); }
  else if (!(team in file)) throw new Refusal(`team ${team} has no entry in teams.json (teams: ${Object.keys(file).join(', ')})`, 1);
  else if (bad.has(team)) throw new Refusal(`team ${team} fails validation in teams.json; run backlog team validate --team ${team}`, 2);
  return { file, from: 'disk' };
}
