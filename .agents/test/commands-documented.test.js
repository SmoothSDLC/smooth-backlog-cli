// Every command and subcommand the CLI answers to has an entry in COMMANDS.md, in the skill reference, in its own help and (a command) in backlog --help.
// The lists come from the code (the router table, the team subcommands, the words of list), so a new command with no documentation fails here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, consumer, sharedBacklog } from './shared-fixtures.js';
import { TABLE } from '../../src/shared/router.js';
import { LIST } from '../../src/shared/read.js';
import { SUBS } from '../../src/team/cli.js';
import { HELP, USAGE } from '../../src/help.js';
import { teamHelp } from '../../src/team/help.js';

const t = mkdtempSync(join(tmpdir(), 'commands-doc-'));
after(() => rmSync(t, { recursive: true, force: true }));
sharedBacklog(t);
const cons = consumer(t, 'acme', 'demo', 'main');

const COMMANDS = [...Object.keys(TABLE), 'setup', 'upgrade']; // main.js answers setup and upgrade itself
const SUBCOMMANDS = SUBS.map(s => `team ${s}`);
const WORDS = ['archive done', 'next all-branches']; // the words of archive and next that have an entry of their own
const docs = { 'COMMANDS.md': readFileSync(new URL('../../COMMANDS.md', import.meta.url), 'utf8'), 'the skill reference': readFileSync(new URL('../../templates/skills/backlog/references/commands.md', import.meta.url), 'utf8') };

test('every command, team subcommand and word with an entry of its own has a section in COMMANDS.md and in the skill reference', () => {
  for (const name of [...COMMANDS, ...SUBCOMMANDS, ...WORDS]) {
    for (const [doc, text] of Object.entries(docs)) assert.ok(text.split('\n').includes(`### backlog ${name}`), `${doc} has no section "### backlog ${name}"`);
  }
});

test('every command, team subcommand and word has its own help, and backlog <it> --help prints it', () => {
  const all = { ...HELP, ...teamHelp };
  for (const name of [...COMMANDS, ...SUBCOMMANDS, ...WORDS]) {
    assert.ok(all[name], `src/help.js and src/team/help.js have no help for "${name}"`);
    const r = cli([...name.split(' '), '--help'], { cwd: cons, tmp: t });
    assert.equal(r.status, 0, `backlog ${name} --help: ${r.stderr}`);
    assert.equal(r.stdout.trimEnd(), all[name].trimEnd(), `backlog ${name} --help prints another text than its help`);
  }
});

test('backlog --help names every command, and the help of list names every word of list', () => {
  for (const name of COMMANDS) assert.match(USAGE, new RegExp(`\\bbacklog ${name}\\b|^  ${name}\\b`, 'm'), `backlog --help does not name ${name}`);
  for (const w of Object.keys(LIST)) assert.ok(HELP.list.includes(w), `the help of list does not name the word ${w}`);
  for (const s of SUBS) assert.ok(teamHelp.team.includes(s), `the help of team does not name ${s}`);
});
