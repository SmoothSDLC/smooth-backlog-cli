from base import *
F='user-gaps'
G='Given a repository with a backlog\n'
R('REQ-920','Read one chosen branch (decision AR)','PH-13',[],
 '`backlog list branch <name> [--json]` prints the listing of that branch exactly as `list` prints the current one (JSON: same shape, `branch` = <name>); `backlog next branch <name> [--json]` likewise for `next`. Unknown branch with no items: `ℹ️  no item of branch <name> in this backlog (check the name)` exit 0. Read-only. Help per command; COMMANDS.md; skill reference.',
 'AR = a (owner 2026-11-08); impact rows L12, S06, S87, S88.',
 ['Works from a detached HEAD (no current branch needed).','No write, no commit.'],
 [('list branch shows another branch',G+'  And an item "Here" exists\n  And a branch "other" exists on the origin\n  And I run `backlog move 1 --to-branch other`\nWhen I run `backlog list branch other --json`\nThen the command succeeds\n  And the JSON output has 1 item'),
  ('next branch works from a detached HEAD',G+'  And an item "Here" exists\n  And HEAD is detached\nWhen I run `backlog next branch main`\nThen the command succeeds\n  And the output contains "001-here"')],
 [('user-gaps.test.js','list branch <name> equals list on that branch','two branches','equal'),('user-gaps.test.js','next branch <name>; unknown name info line','fixtures','texts'),('commands-documented.test.js','list branch and next branch documented','-','present')],F)
R('REQ-921','list branches columns','PH-13',[],
 '`backlog list branches` prints per branch: `branch`, `open`, `done`, `archived`, `total` (text columns in that order; JSON keys the same); open/done by the user default words (REQ-908), archived = items under `archive/` of that branch.',
 'Impact L13 (LEAD narrowed Active|Done|Archived|Total to open/done).',
 ['Totals equal open + done + archived.'],
 [('list branches shows archived and total',G+'  And an item "A" exists\n  And an item "B" exists\n  And I run `backlog done 1`\n  And I run `backlog archive 1`\nWhen I run `backlog list branches --json`\nThen the output contains "\\"archived\\": 1"\n  And the output contains "\\"total\\": 2"')],
 [('user-gaps.test.js','list branches columns and totals','fixture','rows')],F)
R('REQ-922','Import every unarchived item','PH-13',[],
 '`backlog import all --branch <source>` moves every item of the source branch that is not archived (open and finished), oldest first, after the queued ones; output `✅ imported <n> item(s) of <source> into <branch>: <slugs>`; user `import --branch` keeps moving open items only. Bound items obey `user_commands.import`.',
 'Impact L43: the first release moved new, open and done items; an option that is not data is a subcommand (`all`).',
 ['Finished items move too; archived ones stay.'],
 [('import all brings finished items too',G+'  And a branch "src" exists on the origin\n  And an item "Open" exists\n  And an item "Done" exists\n  And I run `backlog done 2`\n  And I run `backlog move 1 --to-branch src`\n  And I run `backlog move 2 --to-branch src`\nWhen I run `backlog import all --branch src`\nThen the command succeeds\n  And the output contains "imported 2 item(s)"')],
 [('user-gaps.test.js','import all moves open and finished, not archived','fixture','moved list')],F)
R('REQ-923','Several section lines in one call','PH-13',[],
 '`backlog update <item> --section "<H>" --add-line \'<JSON array of strings>\'` appends each entry in order (with `--top`: inserted first, keeping their order); a value that is not a JSON array stays one line.',
 'Impact L33 (one line per call since the section editor).',
 ['Array of 3 adds 3 lines; text only adds 1.'],
 [('three lines in one call',G+'  And an item "S" exists\nWhen I run `backlog update 1 --section Tasks --add-line \'["a","b","c"]\'`\nThen item 1 body contains "- a\\n- b\\n- c"')],
 [('shared-update.test.js','add-line JSON array, --top order','fixture','body')],F)
R('REQ-924','Skill copies refreshed after a version change','PH-13',[],
 'When a command (other than `--help`, `--version`, `upgrade`, `setup`) runs with a CLI version different from `skill_version` in `.backlog/config.json`, it redeploys the skill copies exactly as `backlog setup` does, records the version, and prints `ℹ️  backlog: skill copies refreshed for <version>` on stderr; output and exit code of the command are unchanged; a failed refresh prints a warning and the command still runs.',
 'Impact L52 (LEAD removed the refresh without a ruling).',
 ['Second command prints nothing; no refresh when versions match.'],
 [('the skill copy follows the CLI version',G+'  And the configuration key skill_version is `"0.0.1"`\nWhen I run `backlog list`\nThen the command succeeds\n  And the output contains "skill copies refreshed for"')],
 [('user-gaps.test.js','refresh on version change only; failure warns','fixtures','stderr and files')],F)
R('REQ-925','Exit-code contract','PH-13',['DI-ERR'],
 'Exit codes: 0 success (and idle answers that are not team pop); 1 refusal or failure of a valid request (refusal line on stdout; storage failures on stderr), including "not found" and a missing required value of a valid command (`new` without `--name`); 2 invalid input (unknown command, option or word, malformed value, invalid configuration); 3 publication failure, and `team pop` idle; 5 stale view. An uncaught program error exits 1 with `❌ backlog: internal error: <message>` (today it exits 2: main.js `error.exitCode || 2`). Documented in `backlog --help` and COMMANDS.md.',
 'Impact L55 (NONE): re-tested 2026-11-08 in a throwaway clone: `show 999999` exit 1, `list bogusword` exit 2, `update 999 --name x` exit 1, `new` without --name exit 1, detached `list` exit 2.',
 ['A table test runs each class once.'],
 [('not found is a refusal',G+'When I run `backlog show 999999`\nThen the command fails with exit code 1'),('an unknown word is invalid input',G+'When I run `backlog list bogusword`\nThen the command fails with exit code 2')],
 [('router.test.js','exit-code table (one case per class)','fixtures','codes'),('router.test.js','uncaught error exits 1 with internal error','thrown TypeError','1')],F)
R('REQ-926','Detached HEAD','PH-13',[],
 'Reads of a chosen branch use `list branch <name>` / `next branch <name>` (REQ-920) and work on a detached HEAD; every other command on a detached HEAD is refused with `❌ backlog: HEAD is detached: check out a branch (git switch <branch>), or read one with backlog list branch <name>` (exit 2). No `--branch` fallback option (owner rule: the current branch by default; a wider read is a subcommand).',
 'Impact L56 (NONE): the first release accepted --branch as fallback everywhere.',
 ['Text names both ways out.'],
 [('a write on a detached HEAD',G+'  And HEAD is detached\nWhen I run `backlog new --name x --objective o --summary s`\nThen the command fails with exit code 2\n  And the output contains "HEAD is detached: check out a branch"')],
 [('user-gaps.test.js','detached: reads via branch subcommands, others refused','fixture','codes/text')],F)
R('REQ-927','Items waiting on dependencies','PH-13',[],
 '`backlog list blocked [--json]` lists the items of the current branch with at least one dependency that is not finished (user default words for unbound targets, the target\'s definition for bound ones), each with the waits as `next` prints them; no team needed; read-only.',
 'Impact S101: dependencies are a shared feature (AM), their waits were shown nowhere for unbound items.',
 ['An item depending on an open item is listed; on a finished one it is not.'],
 [('list blocked shows dependency waits',G+'  And an item "A" exists\n  And an item "B" exists\n  And I run `backlog update 2 --set-depends-on 1`\nWhen I run `backlog list blocked`\nThen the output contains "002-b"\n  And the output contains "waits on"')],
 [('user-gaps.test.js','list blocked','fixture','rows')],F)
R('REQ-940','Interactive creation and the update notice stay','-',[],
 '`backlog new --ask` / `backlog team new --ask` (owner AP) and the update notice (owner AI), restored in 7c-2c (b6a2852, 174c76d), keep their tests; impact rows L27 and L51 are resolved by them.',
 'Already restored after the impact snapshot C.',
 ['Existing tests green.'],
 [('new --ask needs a terminal',G+'When I run `backlog new --ask`\nThen the command fails with exit code 2\n  And the output contains "--ask needs a terminal"')],
 [('new-ask.test.js','existing 9 tests','-','green'),('update-notice.test.js','existing 8 tests','-','green')],F)
F='team-conditional'
T=BG_TEAM+'\n  And the environment TEAM_NAME is "t1"\n  And an item "W" exists\n'
R('REQ-930','A lead-only deletion door for team items','PH-14',[],
 'CONDITIONAL on Q-06. Option A (recommended): step `delete` (flag `--delete`, `actor: by`, value = reason) defined by the template for the lead from any unfinished word with a required reason; the machinery removes the item file and its index entry in one published change and appends nothing (the commit message carries the reason); dependents block it (DATA-INTEGRITY: stranded dependency refusal). `user_commands.clean` stays refused. Option B: no door; team items are never deleted (today). Option C: `user_commands.clean.allow: true` in the template (user clean deletes team items).',
 'Withdrawn AT re-derived: the principle puts the choice in the file; whether a team door exists is a design choice.',
 ['A: lead deletes with reason; member refused; dependents refuse.'],
 [('A: the lead deletes a team item with a reason',T+'  And item 1 has the front-matter fields `{"team":"t1","status":"new","refiner":""}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --delete "duplicate of 7"`\nThen the command succeeds\n  And item 1 does not exist')],
 [('team-conditional.test.js','Q-06 delete step','fixtures','results')],F,cond='Q-06')
R('REQ-931','Moving team items','PH-14',[],
 'CONDITIONAL on Q-07. Option A (recommended): keep user `move` for bound items (`user_commands.move-branch/move-repository: allow` in the template, today); Option B: template refuses user move and defines step `move` (`--move <branch>`, lead only) that changes the branch of a bound item inside the team\'s repository; `--to-repository` stays user-only and refused for bound items.',
 'Withdrawn AU re-derived: a move changes the scope a team session is bound to.',
 ['A: today. B: user move refused with text; team move by the lead.'],
 [('A: user move of a team item stays allowed','See S-901-3')],
 [('team-conditional.test.js','Q-07 option B move step','fixtures','results')],F,cond='Q-07')
R('REQ-932','Abandoning an unfinished team item','PH-14',[],
 'CONDITIONAL on Q-08. Option A (recommended): step `abandon` (`--abandon "<reason>"`, lead only, from any unfinished word, to `closed`, records `## Abandoned by <actor> at <now>\\n\\n<reason>`, skips review rules, keeps the close gate) — the item can then be archived by user archive. Option B: no step; `close --by owner --reason` is the only way (today).',
 'Withdrawn AT (archive --force of unfinished team items) re-derived.',
 ['A: lead abandons a refining item; it becomes closed.'],
 [('A: the lead abandons a refining item',T+'  And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann","handoffs":"none"}`\n  And I act as agent "lead"\n  And I have read item 1\nWhen I run `backlog team update 1 --team t1 --abandon "out of scope"`\nThen item 1 has status "closed"')],
 [('team-conditional.test.js','Q-08 abandon step','fixtures','results')],F,cond='Q-08')
F='user-flow'
R('REQ-933','Interactive value of update','PH-14',[],
 'CONDITIONAL on Q-09. Option A: `backlog update <item> --ask` asks on a terminal for name, objective, summary and an appended note (empty answer: unchanged), refused without a terminal (exit 2). Option B (recommended): not provided; `--ask` stays on `new` and `team new` only (owner AP named them).',
 'Impact L32 (LEAD).',
 ['A: prompts in order; B: unknown option exit 2.'],
 [('B: update --ask is unknown','Given a repository with a backlog\n  And an item "P" exists\nWhen I run `backlog update 1 --ask`\nThen the command fails with exit code 2')],
 [('user-flow.test.js','Q-09','fixture','result')],F,cond='Q-09')
R('REQ-934','JSON envelope','PH-14',[],
 'CONDITIONAL on Q-10. Option A: every `--json` output is `{"ok":true,"data":<today\'s payload>}`; consumers migrate first (additive phase with `--json=v2` is not allowed: no aliases, so a coordinated switch). Option B (recommended): raw payloads stay (consumers parse them today); documented per command.',
 'Impact L53 (LEAD removed it).',
 ['B: payload shapes documented and tested per command.'],
 [('B: list --json is the raw payload','Given a repository with a backlog\nWhen I run `backlog list --json`\nThen the output does not contain "\\"ok\\""')],
 [('user-flow.test.js','Q-10','fixture','shape')],F,cond='Q-10')
R('REQ-935','JSON error object','PH-14',[],
 'CONDITIONAL on Q-11. Option A (recommended): with `--json`, a failure prints `{"ok":false,"error":{"code":"<CODE>","message":"<text>"}}` on stdout (codes: INVALID_INPUT, REFUSED, NOT_FOUND, STORAGE_ERROR, SYNC_FAILED, STALE, TEAM_CONFIG) with the same exit code; without `--json` unchanged. Option B: text only (today).',
 'Impact L54 (LEAD).',
 ['A: each code once.'],
 [('A: a refusal as a JSON error','Given a repository with a backlog\nWhen I run `backlog show 999999 --json`\nThen the command fails with exit code 1\n  And the output contains "\\"code\\": \\"NOT_FOUND\\""')],
 [('user-flow.test.js','Q-11','fixtures','objects')],F,cond='Q-11')
R('REQ-936','User environment fallbacks','PH-14',[],
 'CONDITIONAL on Q-12. Option A (recommended): `BACKLOG_CLI_BRANCH` and `BACKLOG_CLI_REPONAME` are not read (owner rule 2026-11-07: configuration only; REQ-926 covers detached reads). Option B: `BACKLOG_CLI_BRANCH` names the branch when git names none (detached HEAD), and `BACKLOG_CLI_REPONAME` is exported to child processes the CLI starts.',
 'Impact L57, L58 (NONE).',
 ['A: a set variable has no effect.'],
 [('A: BACKLOG_CLI_BRANCH has no effect','Given a repository with a backlog\n  And HEAD is detached\n  And the environment BACKLOG_CLI_BRANCH is "main"\nWhen I run `backlog list`\nThen the command fails with exit code 2')],
 [('user-flow.test.js','Q-12','env','result')],F,cond='Q-12')
R('REQ-937','Selecting an item by its queue position','PH-14',[],
 'CONDITIONAL on Q-13. Option A (recommended): an item selector `P<n>` (the item at rank n of the current branch\'s queue) is accepted wherever an item is named; numbers stay seq and words stay slugs. Option B: not provided (today).',
 'Impact L59 (NONE).',
 ['A: `update P0 --name x` changes the queue head.'],
 [('A: P0 names the next item','Given a repository with a backlog\n  And an item "A" exists\n  And an item "B" exists\n  And I run `backlog update 2 --priority 0`\nWhen I run `backlog show P0 --json`\nThen the output contains "002-b"')],
 [('user-flow.test.js','Q-13 selector','fixture','item')],F,cond='Q-13')
R('REQ-938','History of items written before the event move','PH-14',[],
 'CONDITIONAL on Q-14. Option A: `backlog setup` (one-time, when `backlog.db` exists) copies each item\'s events from `backlog.db` into the item files and removes the database in one commit. Option B (recommended): `backlog history <item>` with no recorded event prints `ℹ️  no history recorded for <slug> (events before the item-file history were not carried over; they stay in the repository history)` exit 0.',
 'Impact S95 (NONE): history prints nothing for such items.',
 ['B: the info line.'],
 [('B: an item without events says so','Given a repository with a backlog\n  And an item "A" exists\n  And item 1 has no recorded events\nWhen I run `backlog history 1`\nThen the output contains "no history recorded for 001-a"')],
 [('user-flow.test.js','Q-14','fixture','text')],F,cond='Q-14')
R('REQ-939','Update notice timing','PH-14',[],
 'CONDITIONAL on Q-15. Option A (recommended): wait at most 3000 ms; print the failure warning only for a real error (registry answer, network error), never for a timeout or a development checkout. Option B: 1500 ms and every failure warned (today).',
 'Withdrawn AV re-derived: a user feature, not flow.',
 ['A: timeout silent; error warned.'],
 [('A: a timed-out check is silent','No scenario (needs a slow registry stub): see T-939-1')],
 [('update-notice.test.js','Q-15 timeout and warnings','stubbed registry','stderr')],F,cond='Q-15')
