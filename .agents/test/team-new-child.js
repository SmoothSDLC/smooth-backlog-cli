// Runs the function of src/team/new.js with the arguments given: `backlog team new` is not wired yet, and the tests create a team's items with it.
import { run } from '../../src/team/new.js';

process.exitCode = await run(process.argv.slice(2));
