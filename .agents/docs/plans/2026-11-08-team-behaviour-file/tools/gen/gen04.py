import json,collections
OUT=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','..')+'/'
R=json.load(open('reqs.json'))
L=['# 04 — BDD specification','',
'The scenarios are in `features/*.feature` (15 files). Every scenario carries two tags: `@REQ-nnn` (the requirement of `03-spec.md`) and `@S-nnn-k` (its id); conditional scenarios also carry `@conditional @Q-nn`. The validator inputs are two Scenario Outlines in `features/validator-keys.feature` whose Examples rows are the ids `S-013-1..S-013-<n>` (n in §6) (one row per structural message form, per semantic rule V-01..V-30 and per entry rule E-01..E-08).','',
'## 1. Style','',
'The files follow the repository style (`features/*.feature`, runner `features/support/gherkin.js`, steps `features/steps/cli.js`): every check goes through the CLI (`backlog show --json`, `backlog list --json`), a scenario is a user sequence of commands, and each scenario sets up what it needs (no Background, so that a scenario can be read alone). Both locations run them (local `.backlog` and a backlog repository), as `features.test.js` does today.','',
'## 2. Changes to the runner (`features/support/gherkin.js`), test-first in PH-0','',
'1. **Tags**: a line of `@word` tokens before `Scenario:`/`Scenario Outline:` is attached to the next scenario (today: an unreadable line).',
'2. **Scenario Outline + Examples**: the outline is expanded once per Examples row, `<column>` replaced in every step; the scenario name gets the row\'s `id` column.',
'3. **Conditional scenarios**: a scenario tagged `@conditional @Q-nn` runs only when `features/answers.json` maps `Q-nn` to the option the scenario is written for (the scenario name starts with `A:`, `B:` or `C:`); otherwise it is reported as skipped with its reason. `answers.json` starts empty and is filled when the owner answers.',
'4. **Template token**: inside `I run \\`...\\``, `<template:name>` is replaced by the absolute path of `templates/team-behaviour/<name>` of the checkout.','',
'Tests for the runner: `.agents/test/features.test.js` gains three cases (tags kept, outline expanded with ids, conditional skipped/run by answers.json).','',
'## 3. Steps reused unchanged','',
'`a repository with a backlog`; `the environment <VAR> is "<value>"`; `I act as agent "<name>"`; `I run \\`...\\``; `I run \\`...\\` and answer "<text>"`; `an item "<name>" exists`; `I have read item <n>`; `the team configuration is a committed file`; `I define the team from the JSON \\`...\\``; `a branch "<b>" exists on the origin`; `the command succeeds`; `the command fails with exit code <n>`; `the output contains "<text>"`; `the output does not contain "<text>"`; `the JSON output has <n> item(s)`; `item <n> has <field> "<value>"`; `item <n> body contains "<text>"`; `item <n> does not exist`; `the queue is empty`.','',
'## 4. Steps changed','',
'- `a team "<t>" with lead "<l>" and members "<m>"` (old form, used by `team.feature`, `team-flow.feature`): from PH-3a it writes the schema 2 entry `{"workflow": "team", "people": {"lead": ...}, "lists": {"members": [...]}}` and, when `workflows.json` has no `team`, first registers `templates/team-behaviour/team.json` through `backlog team workflow --file` (so the existing features keep running after the switch).',
'- `team "<t>" work needs <n> pass(es) by "<x>"...`, `team "<t>" reviews in the stages "..."`, `team "<t>" has the external reviewers "..."`, `team "<t>" refinements are reviewed by "..."`: write the schema 2 entry keys (`review` with `team`, `review`, `external_reviewers`, `refinement_review`).','',
'## 5. New steps (exact text; implement in `features/steps/cli.js`)','',
'| step | does |','|---|---|',
'| `the backlog registers the workflow "<w>" from the template "<file>"` | runs `backlog team workflow --file` on a copy of `templates/team-behaviour/<file>` whose `workflow` is set to `<w>`; asserts exit 0 |',
'| `the backlog registers the workflow "<w>" from the template "<file>" with \\`<patch>\\`` | as above after applying the patch: `path = json` pairs separated by ` ; `, `path` dotted (array index as a number, a key with spaces written as is), value `<delete>` removes the key |',
'| `a team "<t>" with lead "<l>" and members "<m>" using the workflow "<w>"` | adds the schema 2 entry `{workflow, people: {lead}, lists: {members}}` to `teams.json` in the home (committed and pushed in the backlog-repository location) |',
'| `team "<t>" has the entry key <key> set to \\`<json>\\`` | sets that key of the entry (committed) |',
'| `the file "<name>" of the backlog home is \\`<text>\\`` | writes the raw text (may be invalid JSON) and commits it |',
'| `the file "<name>" of the backlog home has the JSON value "<v>" at "<path>"` | reads the file from the home after a pull; the dotted path\'s value (strings compared as text, numbers as numbers) equals `<v>` |',
'| `item <n> has the front-matter fields \\`<json>\\`` | test setup: merges the fields into the item file\'s front matter in the repository that holds the items, commits and pushes (as the existing "damaged status" step does) |',
'| `item <n> has a definition of done in its body` | appends `## Definition of done\\n- [ ] it works` to the body the same way |',
'| `I take a snapshot of the backlog repository` / `the backlog repository is unchanged since the snapshot` | records every file and the HEAD and origin refs of the repository that holds the items / compares them |',
'| `a definition file "<path>" from the template "<file>" with \\`<patch>\\`` | writes the patched template to `<path>` in the test\'s temporary folder (outside the backlog); an empty patch copies it |',
'| `a file "<path>" outside the backlog contains \\`<json>\\`` | writes the text to `<path>` in the temporary folder |',
'| `HEAD is detached` | `git checkout --detach` in the consumer repository |',
'| `the configuration key <key> is \\`<json>\\`` | sets the key in `.backlog/config.json` of the consumer repository and commits it |',
'| `item <n> has no recorded events` | removes the item\'s history section from its file (setup) |',
'| `item <n> body does not contain "<text>"` | negation of the existing body step |',
'| `team "<t>" has the entry list <k> set to \\`<json>\\`` | sets `lists.<k>` of the entry (committed); revision 4, generic entry (D-21) |',
'| `team "<t>" has the entry rule <k> set to \\`<json>\\`` | sets `rules.<k>` of the entry (committed) |',
'| `item <n> has <field> containing "<text>"` | the field (a list or text) contains the text |',
'| `the item "<x>" of repository "<owner>/<repo>" is bound to team "<t>" with the front-matter fields \\`<json>\\`` | creates the item in that repository folder of the home with `team` and the fields (setup) |',
'| `a file "<path>" outside the backlog is the fixture "<name>"` | copies `.agents/test/fixtures/team-behaviour/<name>` to `<path>` |',
'| `the backlog registers the workflow "<w>" from the template "<file>" with \\`<patch>\\`` | (exists above) also used with `minimal.json` |','',
'## 6. Coverage: requirement → scenarios','',
'| REQ | title | scenarios | covered without a scenario |','|---|---|---|---|']
for r in R:
  sids=[s for s in r['sids'] if s]
  sc=(f"S-013-1..S-013-{len(sids)}" if r['id']=='REQ-013' else ', '.join(sids)) or '—'
  L.append(f"| {r['id']} | {r['title']}{' (CONDITIONAL '+r['cond']+')' if r['cond'] else ''} | {sc} | {'' if sids else 'tests ' + ', '.join(r['tids'])} |")
n=sum(len([s for s in r['sids'] if s]) for r in R)
L+=['',f'Totals: {n} scenario ids ({n-len(R[[r["id"] for r in R].index("REQ-013")]["sids"])} scenarios and {len(R[[r["id"] for r in R].index("REQ-013")]["sids"])} outline rows) for {len(R)} requirements; {sum(1 for r in R if r["cond"])} requirements are conditional on owner questions; requirements without a scenario are proved by unit tests only (named in the last column).','',
'## 7. The user-command guarantee as behaviour','',
'`features/user-guarantee.feature` proves from the outside what the guard tests prove in the source: user `update --status` stores any word (S-902-2), user `new` writes no team key and no definition-of-done placeholder (S-902-1), a user command meets a bound item only through the file (S-901-1..4), and invalid team files never affect unbound items (S-005-2, S-006-2 for the bound case).','',
'## 8. Upgrade (migrate-or-fail) as behaviour','',
'`features/team-migrate.feature` (S-011-1..3) and the schema-1 scenarios of `team-file.feature` (S-002-1, S-002-2) prove that an old backlog fails with the migrate message and that `backlog team migrate` converts it once, idempotently, without touching unbound items.']
open(OUT+'04-bdd.md','w').write('\n'.join(L)+'\n'); print(n)
