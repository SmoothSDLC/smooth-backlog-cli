// Rewrites the help block of every command in COMMANDS.md from src/help.js, so the two stay verbatim equal
// (shared-help.test.js checks it). Run from the repository root after changing src/help.js:
//   node .agents/scripts/sync-commands-md.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const { HELP } = await import(new URL('../../src/help.js', import.meta.url));
const { teamHelp } = await import(new URL('../../src/team/help.js', import.meta.url));
const { ALIASES } = await import(new URL('../../src/shared/aliases.js', import.meta.url));
const file = new URL('../../COMMANDS.md', import.meta.url);
let doc = readFileSync(file, 'utf8'); let changed = 0;
let before = null; // the team commands follow one another: a heading that is missing goes after the block of the one before it
for (const [cmd, text] of Object.entries({ ...HELP, ...teamHelp })) {
  const heading = `### backlog ${cmd}\n`;
  let at = doc.indexOf(heading);
  if (at < 0 && before) {
    const end = doc.indexOf('\n```\n', doc.indexOf('```text\n', doc.indexOf(`### backlog ${before}\n`))) + 5;
    doc = `${doc.slice(0, end)}\n${heading}\n\`\`\`text\n(new)\n\`\`\`\n${doc.slice(end)}`;
    at = doc.indexOf(heading);
  }
  if (at < 0) { console.error(`COMMANDS.md has no heading "${heading.trim()}"`); process.exit(1); }
  before = cmd;
  const open = doc.indexOf('```text\n', at); const close = doc.indexOf('\n```', open + 8);
  if (open < 0 || close < 0) { console.error(`no text block after "${heading.trim()}"`); process.exit(1); }
  const block = `\`\`\`text\n${text.trimEnd()}`;
  if (doc.slice(open, close) !== block) { doc = doc.slice(0, open) + block + doc.slice(close); changed++; }
}
// the Aliases section, from the table the CLI itself uses
const section = `## Aliases\n\nThe command names of the first release still work; each runs the command set below. \`backlog <alias> --help\` prints the alias line and then the help of the command it runs.\n\n${ALIASES.map(a => `- \`${a.form}\` runs \`${a.runs}\``).join('\n')}\n\n`;
const from = doc.indexOf('## Aliases\n');
if (from >= 0) doc = doc.slice(0, from) + section + doc.slice(doc.indexOf('## Commands\n'));
else doc = doc.replace('## Commands\n', `${section}## Commands\n`);
writeFileSync(file, doc); console.log(`COMMANDS.md: ${changed} block(s) rewritten`);
