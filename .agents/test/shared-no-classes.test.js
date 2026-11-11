// The retired class options are out of the CLI's help, COMMANDS.md and the other public files of the repository
// (src, README.md, templates, CHANGELOG.md), pinned by a negative test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HELP, USAGE as topHelp } from '../../src/help.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// The class options removed from the CLI: the work and review class fields and the --classes / --review-classes options.
const CLASS = /work[_ -]?class|review[_ -]?class|--classes/i;

test('the help of every command names no work or review class option', () => {
  for (const [command, text] of Object.entries(HELP)) assert.doesNotMatch(text, CLASS, command);
  assert.doesNotMatch(topHelp, CLASS, 'backlog --help');
});

test('COMMANDS.md names no class option', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  assert.doesNotMatch(doc, CLASS);
});

test('git grep for the class words finds nothing in src, COMMANDS.md, README.md, templates and CHANGELOG.md', () => {
  // git grep exits 1 with no output when nothing matches (0: a match, 2: an error). The ERE is the
  // lead's amended scope: --classes is covered by the help regex of the two tests above, not by the grep.
  const r = spawnSync('git', ['grep', '-n', '-i', '-E', 'work[_ -]?class|review[_ -]?class',
    // the migration is the one module that must name the retired keys: it drops them (design chapter 02 section 5)
    '--', 'src', ':(exclude)src/team/migrate-convert.js', 'COMMANDS.md', 'README.md', 'templates', 'CHANGELOG.md'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(r.status, 1, `git grep exit ${r.status}: ${r.stdout || r.stderr}`);
  assert.equal(r.stdout, '', `git grep found: ${r.stdout}`);
});
