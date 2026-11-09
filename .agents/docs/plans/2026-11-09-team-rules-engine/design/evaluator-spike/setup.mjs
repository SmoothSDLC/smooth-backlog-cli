// Spike of the two additions to `backlog setup` (owner rulings R23 and R25, design chapter 06 section 8): the generic team templates are
// copied into the repository's .backlog folder (the CLI never reads them), and setup recommends the migration according to the two keys
// the migration writes into .backlog/config.json.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const TEMPLATE_DIR = '.backlog/team-templates';
export const TEMPLATES = ['scrum', 'extreme-programming', 'parallel', 'single-agent', 'patterns'];

// The skill copy's rule (src/shared/setup.js:124-134): the folder is the CLI's, removed and copied again on every setup.
export function deployTemplates(top, source) {
  const target = join(top, TEMPLATE_DIR);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const t of TEMPLATES) copyFileSync(join(source, `${t}.json`), join(target, `${t}.json`));
  return `✅ team templates copied to ${TEMPLATE_DIR}: ${TEMPLATES.join(', ')}; copy one to the team file and edit it there`;
}

// R25: what the migration writes after every successful run that is not a dry run.
export const recordMigration = (cfg, { now, version }) => ({ ...cfg, migrated_at: now, migrated_by_version: version });

const parts = v => String(v).split(/[.-]/).slice(0, 3).map(n => Number(n) || 0);
const older = (a, b) => { const [x, y] = [parts(a), parts(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
const RUN = 'backlog team migrate --show-all --dry-run, then backlog team migrate --show-all';
// R25: the line setup prints once the configuration defines a backlog folder.
export function migrateAdvice(cfg, version) {
  if (typeof cfg.backlog_repository !== 'string' || !cfg.backlog_repository) return null;
  if (!cfg.migrated_at) return `ℹ️  the backlog of this repository has not been migrated to JSON items: run ${RUN}`;
  if (older(cfg.migrated_by_version, version)) return `ℹ️  the backlog of this repository was last migrated on ${cfg.migrated_at} by version ${cfg.migrated_by_version}; this is version ${version}: run ${RUN}`;
  return `ℹ️  the backlog of this repository was last migrated on ${cfg.migrated_at} by version ${cfg.migrated_by_version}`;
}
