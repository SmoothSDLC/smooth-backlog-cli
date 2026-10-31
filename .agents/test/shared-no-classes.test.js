// 049: the class options are out of the CLI's help and COMMANDS.md, pinned by a negative test.
// The lead's amended scope (2026-10-29): the test greps the help, COMMANDS.md and the other public files
// of the repository (src, README.md, templates, CHANGELOG.md). The repository-wide negative test is item
// 050's: it adds its own test in its own new file and does not edit this one (lead scope note, refinement
// 2026-10-31). The help texts are the complete set: the shared-mode HELP of src/help.js (the router prints
// it per command) and the top-level help constant of src/output.js (local subcommands have no separate
// help texts - src/main.js prints that one constant for the help command).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HELP } from '../../src/help.js';
import { help as topHelp } from '../../src/output.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// The class options removed from the CLI (owner 2026-10-28): the work and review class fields and the
// --classes / --review-classes options, with no class profiles.
const CLASS = /work[_ -]?class|review[_ -]?class|--classes/i;

test('049: the help of every command names no work or review class option', () => {
  for (const [command, text] of Object.entries(HELP)) assert.doesNotMatch(text, CLASS, command);
  assert.doesNotMatch(topHelp, CLASS, 'top-level backlog --help (the help constant of src/output.js)');
});

test('049: COMMANDS.md names no class option', () => {
  const doc = readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8');
  assert.doesNotMatch(doc, CLASS);
});

test('049: git grep for the class words finds nothing in src, COMMANDS.md, README.md, templates and CHANGELOG.md', () => {
  // git grep exits 1 with no output when nothing matches (0: a match, 2: an error). The ERE is the
  // lead's amended scope: --classes is covered by the help regex of the two tests above, not by the grep.
  const r = spawnSync('git', ['grep', '-n', '-i', '-E', 'work[_ -]?class|review[_ -]?class',
    '--', 'src', 'COMMANDS.md', 'README.md', 'templates', 'CHANGELOG.md'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(r.status, 1, `git grep exit ${r.status}: ${r.stdout || r.stderr}`);
  assert.equal(r.stdout, '', `git grep found: ${r.stdout}`);
});
