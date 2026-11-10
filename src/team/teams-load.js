// The load of the team file before a team command acts (the first step of every team command): where the file is, whether the validated
// copy of the last 24 hours can be used, else read, hash and validate the whole file. Only errors refuse; warnings never do. A command
// that is refused writes nothing; one that proceeds writes the SHA of the file into the repository's .backlog/config.json (or, for another
// repository's file, only into the per-user record), the validated copy and the record.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { BacklogError } from '../errors.js';
import { CONFIG, readConfig } from '../shared/setup.js';
import { FIRST_USE_CONFIG } from '../shared/store.js';
import { errors, readTeamsText, validate } from './rules/validate.js';
import { missingText, teamsFile } from './teams-file.js';

export { missingText, teamsFile };
const DAY = 24 * 3600 * 1000;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = (text, exit = 2) => new BacklogError('TEAMS_FILE', text, exit);
// a path below a root, compared by segments
const below = (root, p) => { const r = relative(root, p); return r === '' || !(r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r)); };
const tryRead = p => { try { return readFileSync(p); } catch { return null; } };
// The reason a file cannot be read: the error code and a fixed phrase, never Node's message (it holds the path).
const REASON = { EACCES: 'permission denied', EPERM: 'permission denied', EISDIR: 'it is a folder, not a file', ENOTDIR: 'a part of the path is not a folder' };
const fsReason = e => (e && typeof e.code === 'string' && e.code ? `${e.code}: ${REASON[e.code] || 'it cannot be opened'}` : 'it cannot be opened');

export const recordPaths = (stateDir, file) => {
  const dir = join(stateDir, 'smooth-backlog-cli', 'teams-validation'); const key = sha(file).slice(0, 16);
  return { dir, record: join(dir, `${key}.json`), copy: join(dir, `${key}.teams.json`) };
};

// Write through a temporary file in the same folder, so a reader never sees half a file.
function atomicWrite(path, data, options) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  try { writeFileSync(tmp, data, options); renameSync(tmp, path); } catch (e) { try { rmSync(tmp, { force: true }); } catch { /* none */ } throw e; }
}
// The one key the CLI writes into the committed configuration. The configuration is read as the commands read it (the older root file
// included), so every key of it is kept; a checkout that cannot be written is skipped silently.
function writeSha(top, value) {
  try {
    const cfg = readConfig(top);
    if (cfg.teams_file_sha === value) return;
    // with no configuration at all the file starts as the store's first use would write it, so a later first use finds nothing to change
    const base = existsSync(join(top, CONFIG)) || Object.keys(cfg).length ? cfg : JSON.parse(FIRST_USE_CONFIG);
    mkdirSync(join(top, '.backlog'), { recursive: true });
    atomicWrite(join(top, CONFIG), `${JSON.stringify({ ...base, teams_file_sha: value }, null, 2)}\n`);
  } catch { /* not writable */ }
}
// The record of the last valid validation; one that is damaged counts as absent.
function readRecord(path) {
  let rec; try { rec = JSON.parse(tryRead(path)); } catch { return null; }
  return rec && typeof rec === 'object' && ['sha', 'valid_teams', 'validated_at'].every(k => typeof rec[k] === 'string') ? rec : null;
}
// the file and every folder between its root (the repository or the backlog folder that holds it) and the file: never a symbolic link
function assertPlain(path, roots, shown) {
  const isLink = p => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  if (isLink(path)) throw refuse(`${shown} is a symbolic link; the team file must be a plain file`);
  const root = roots.find(r => below(r, path));
  if (root) for (let d = dirname(path); d !== root && below(root, d); d = dirname(d)) if (isLink(d)) throw refuse(`${relative(root, d)} is a symbolic link; no folder on the way to the team file may be one`);
}
function readTeamFile(path, top, home, shown) {
  assertPlain(path, [top, home], shown);
  try { return readFileSync(path); } catch (e) {
    if (e.code === 'ENOENT') throw refuse(missingText(shown));
    return { failed: fsReason(e) };
  }
}

// team: a team name, or null for every team (--show-all). full: `backlog team validate`, which always reads, validates and refreshes; a file
// that is not JSON is then a finding, not a refusal. deferSha: the SHA is not written into the configuration by this call but by persistSha(),
// which the caller runs when its command has gone through (a refused command never writes it).
// Returns { file, from: 'record' | 'disk', shown, persistSha } (shown: the file as a message names it) and, with full, the findings (errors and warnings) too.
export function loadTeams({ top, home, repo, workRepo = repo, stateDir, team, now, full = false, deferSha = false }) {
  const cfg = readConfig(top);
  const { path, shaIn, how } = teamsFile({ top, home, repo, workRepo, cfg });
  // A message names the file as the person wrote it: relative to the repository when it is inside, never an absolute path of this machine.
  const shown = below(top, path) ? relative(top, path)
    : how === 'the teams_file key' ? cfg.teams_file.trim()
      : how === 'the backlog repository folder' ? join(cfg.backlog_repository.trim(), ...repo.split('/'), 'teams.json')
        : join(...repo.split('/'), 'teams.json');
  const paths = recordPaths(stateDir, path);
  const rec = readRecord(paths.record);
  const fix = team === null ? 'run backlog team validate --show-all' : `run backlog team validate --team ${team}`;
  let bytes = null;
  // Another repository's file has no SHA committed beside it: it is hashed at every load and compared with the record's.
  if (shaIn === 'record' && !full) { bytes = readTeamFile(path, top, home, shown); if (bytes.failed) throw refuse(`${shown} cannot be read (${bytes.failed}); ${fix}`); }
  const recorded = shaIn === 'config' ? cfg.teams_file_sha : (bytes ? sha(bytes) : undefined);
  if (!full && typeof recorded === 'string' && rec) {
    const copy = tryRead(paths.copy);
    const age = Date.parse(now) - Date.parse(rec.validated_at);
    // a record of another version than the recorded SHA is not used; a record dated in the future (clock change) is stale
    if (copy && sha(copy) === recorded && rec.sha === recorded && age >= 0 && age < DAY) {
      const { file } = readTeamsText(copy.toString('utf8'));
      const valid = rec.valid_teams.split(',');
      if (file && (team === null ? Object.keys(file).every(t => valid.includes(t)) : valid.includes(team))) return { file, from: 'record', shown, persistSha: () => {} };
    }
  }
  if (!bytes) bytes = readTeamFile(path, top, home, shown);
  const read = bytes.failed ? { finding: { problem: '' } } : readTeamsText(bytes.toString('utf8'));
  if (full && !bytes.failed && read.finding) return { file: null, from: 'disk', shown, findings: [read.finding], persistSha: () => {} };
  if (bytes.failed || read.finding) {
    const m = !bytes.failed && read.finding.problem.match(/^teams\.json is not JSON \((.*)\)$/s);
    throw refuse(`${shown} cannot be read (${bytes.failed || (m ? m[1] : 'it is not a JSON object')}); fix it and ${fix}`);
  }
  const { file } = read;
  const findings = validate(file);
  const errs = errors(findings);
  // The whole file must be valid: an error in any entry stops every team command of every team. The refusal comes first, so that a
  // refused command writes nothing.
  if (!full) {
    const bad = [...new Set(errs.map(f => f.team))].filter(Boolean);
    if (errs.length) throw refuse(`${shown} fails validation${bad.length ? ` for ${bad.join(', ')}` : ''}; no team command runs until the whole file is valid; run backlog team validate --show-all`);
    if (team !== null && !Object.hasOwn(file, team)) throw refuse(`team ${team} has no entry in ${shown} (teams: ${Object.keys(file).join(', ')})`, 1);
  }
  let persistSha = () => {};
  if (!errs.length) {
    const hash = sha(bytes);
    if (shaIn === 'config') { persistSha = () => writeSha(top, hash); if (!deferSha) persistSha(); }
    try {
      mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
      atomicWrite(paths.copy, bytes, { mode: 0o600 });
      atomicWrite(paths.record, JSON.stringify({ sha: hash, valid_teams: Object.keys(file).join(','), validated_at: now }), { mode: 0o600 });
    } catch { /* a state folder that cannot be written: every command validates in full, silently */ }
  }
  return full ? { file, from: 'disk', shown, persistSha, findings } : { file, from: 'disk', shown, persistSha };
}
