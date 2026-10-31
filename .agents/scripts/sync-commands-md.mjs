// Rewrites the help block of every command in COMMANDS.md from src/help.js, so the two stay verbatim equal
// (shared-help.test.js checks it). Run from the repository root after changing src/help.js:
//   node .agents/scripts/sync-commands-md.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const { HELP } = await import(new URL('../../src/help.js', import.meta.url));
const file = new URL('../../COMMANDS.md', import.meta.url);
let doc = readFileSync(file, 'utf8'); let changed = 0;
for (const [cmd, text] of Object.entries(HELP)) {
  const heading = `### backlog ${cmd === 'team' ? 'team pop' : cmd}\n`;
  const at = doc.indexOf(heading);
  if (at < 0) { console.error(`COMMANDS.md has no heading "${heading.trim()}"`); process.exit(1); }
  const open = doc.indexOf('```text\n', at); const close = doc.indexOf('\n```', open + 8);
  if (open < 0 || close < 0) { console.error(`no text block after "${heading.trim()}"`); process.exit(1); }
  const block = `\`\`\`text\n${text.trimEnd()}`;
  if (doc.slice(open, close) !== block) { doc = doc.slice(0, open) + block + doc.slice(close); changed++; }
}
writeFileSync(file, doc); console.log(`COMMANDS.md: ${changed} block(s) rewritten`);
