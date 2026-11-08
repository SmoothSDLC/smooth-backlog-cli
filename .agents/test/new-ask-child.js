// Runs backlog new or backlog team new in this process with a reader in place of the terminal (the `io` seam of src/shared/new.js).
// usage: node new-ask-child.js new|team <arguments>; ASK_ANSWERS is the JSON list of the answers (the end of the input once it is empty).
// The prompts it was asked go to standard error, one JSON string per line, after the command's own output.
const [kind, ...argv] = process.argv.slice(2);
const answers = JSON.parse(process.env.ASK_ANSWERS);
const prompts = [];
const io = { isTerminal: () => true, open: () => ({ ask: prompt => { prompts.push(prompt); return Promise.resolve(answers.length ? answers.shift() : null); }, close() {} }) };
let code;
if (kind === 'team') {
  (await import('../../src/shared/seen.js')).setActor('lead');
  code = await (await import('../../src/team/new.js')).run([...argv, '--team', 't1'], { io });
} else code = await (await import('../../src/shared/new.js')).run(argv, { io });
process.stderr.write(prompts.map(p => `ASKED ${JSON.stringify(p)}\n`).join(''));
process.exitCode = code;
