// Spike of the two additions to `backlog setup` (owner rulings R23 and R25, design chapter 06 section 2.0): the generic team templates are
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

// R25: what the migration writes after a successful run that is not a dry run (review C M9). migrated_at is when the folder became JSON:
// it changes only when the run converted at least one file, or on the first run over a folder that had nothing to convert;
// migrated_by_version names the CLI of the latest run.
export const recordMigration = (cfg, { now, version, converted }) => ({ ...cfg, migrated_at: converted > 0 || !cfg.migrated_at ? now : cfg.migrated_at, migrated_by_version: version });

const RUN = 'backlog team migrate --show-all --dry-run, then backlog team migrate --show-all';
// R25: the line setup prints once the configuration defines a backlog folder. No version comparison: every build of the CLI reports the
// same development version today, and R25 asks only for the recommendation and the record (review D M4).
export function migrateAdvice(cfg) {
  if (typeof cfg.backlog_repository !== 'string' || !cfg.backlog_repository) return null;
  if (!cfg.migrated_at) return `ℹ️  the backlog of this repository has not been migrated to JSON items: run ${RUN}`;
  return `ℹ️  the backlog of this repository was last migrated on ${cfg.migrated_at} by version ${cfg.migrated_by_version}`;
}
