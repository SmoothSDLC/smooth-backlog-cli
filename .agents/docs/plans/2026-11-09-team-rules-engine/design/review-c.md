# Review C: correctness and ruling conformance (second round, rulings R14 to R25)

Context: this is the third independent review of the rules-engine design in this folder, and the first after the owner's rulings of
rounds 5 to 11 (R14 to R25 and the scope note in `../00-owner-rulings.md`). Reviews A and B and their answers (`review-response.md`) are
not repeated; a finding of theirs appears here only where its fix is wrong or incomplete. Reviewed at commit 0128400 in a separate
worktree. Paths are relative to this `design/` folder unless they start with `../` or `src/`.

What was run:
- `cd evaluator-spike && node --test` (Node 22.22.1): 283 tests, 283 pass, 0 fail.
- `node coverage/make-coverage.mjs`: regenerated `coverage.tsv` and `coverage-counts.tsv` byte for byte (git status clean afterwards).
- 23 new adversarial tests against the spike modules, kept outside the worktree (`/tmp/review-c-adv/adv.test.mjs` on the review host).
  23 of 23 fail, that is, each shows a gap; details in section 4.
- `grep` of the whole plan folder for the internal names of the review brief (section 8).

Totals: 5 High, 11 Medium, 11 Low.

## 1. Verdict per ruling

| ruling | verdict | evidence (and finding) |
|---|---|---|
| R1 rules evaluator, no team behaviour in code | Met | spike code holds no status, stage or role word: `grep` of quoted words in `evaluator-spike/*.mjs` finds only the field name `'status'` (`evaluator.mjs:197`, needed for the index, R13) and the envelope key `'archived'` |
| R2 split, parents, limits as rules over fields | Met | `03-rule-language.md:179-184`; parallel example |
| R3 user commands enforce nothing, never read the team file | Met | `04-team-commands.md:161-169` |
| R3a (as amended by R16, R19) | Met | `04:165`; cases COD-06, R16-01 to R16-03, R19-01 |
| R3b team and agent inputs, never the user identity | Met | `01-team-file.md:201-213`; `evaluator.mjs:215-226` |
| R4 JSON items, migrate or fail | Met, per folder | `06-migration.md:34-44` (see R14 for `--team`) |
| R5 the CLI only reads the team file | Met, one tension | `--help` reads `teams.json` (M11); the per-user validated copy is a cache of the file, justified in `review-response.md` R2-2 |
| R6 template as starting copy | Met | `01:77-88` |
| R7 item definition is data | Met | `final` was settled in round 1 (A-L1) |
| R8 skills use the rule set | Met | `07-skills.md` |
| R9 rules verified one by one | Not re-audited (round 1 scope) | |
| R10 routing-table precedence | Met | `03:39-58`; shadowing limit stated (`08:186`) |
| R11 validate gives per-rule feedback over the whole file | Met in the design; the spike's validate misses 11 of the chapter 08 checks (M6) | ADV-05 to ADV-13, ADV-16, ADV-17 |
| R12 numbers never reused | Partially met | M1, M2, M3 |
| R13 index structure unchanged | Met | `05:89` matches `src/shared/index.js:40` (`{seq, slug, name, status}` per branch) |
| R14 a specific team; `--show-all` per command | Partially met | the ruling text still marks the per-command reading "pending the owner's confirmation", while `decisions.md:3` says nothing is open (M5); `backlog team migrate --team web` converts and unbinds every team's items of the folder (`06:34-41`), which is acting over every team without `--show-all`; justified there by R4, but it is a lead decision the owner has not seen as one; `--show-all` together with `--team` is a new refusal (section 3) |
| R15 flag, then variable, then configuration; no refusal | Met | cases R15-01 to R15-03; `evaluator.mjs:216-224` |
| R16 user commands hide team items unless `--show-all` | Met | `04:174-182` covers all 16 user commands of `../01-command-behaviour-matrix.md:7-10`; `clean` and `import` of team items go beyond "set values" (L7) |
| R17 migrate reports fields; `--ask` on a terminal | Met | `06:84-112`; cases R17-01, R17-02 |
| R18 no compatibility; a failed load takes no action | Contradicted in part | a refused load writes `.backlog/config.json` (H1); per-team validity departs from "the file fails validation" without an owner answer (M5); validation coverage in the spike (M6) |
| R19 user command with `--show-all` may set values | Met | `04:178`; adds the flag `--set` (section 3); `backlog done` writes the CLI's word into a team item (L7) |
| R19a blanket failure when the team variable is set | Met, two gaps | exact text `04:156` matches the ruling; help and version unblocked (`04:156-157`); the help of a single user command was "pending confirmation" and is decided without a recorded question (M5); an empty variable does not block (L4) |
| R20 prefix `SMOOTH_BACKLOG_CLI_` | Met | grep of chapters, examples, spike, cases: the only unprefixed names are in the "not read" row `06:226` |
| R21 SHA, 24-hour record, update only when valid | Partially met | H1 (record and SHA written for a refused team); L1 (a future-dated record is fresh for ever) |
| R22 location of `teams.json`, SHA in configuration | Met with deviations | L6 (`SMOOTH_BACKLOG_CLI_HOME` and `backlog_origin_url` also switch the default; the ruling says "the configuration"); M10 (a corrupt configuration is overwritten); L2, L3 (spike path checks) |
| R23 setup copies generic templates | Met | `01:71-90`; spike `setup.mjs:79-85` |
| R24 nothing affects the entire backlog | Contradicted in part | H2 (the repository input reaches another folder), H3 (reset drops, push publishes, other folders' local commits), M4 (case R24-01 contradicts its own text), L8 (lock timeout) |
| R25 setup recommends migrating; configuration records it | Contradicted | H4 (setup is refused on a markdown backlog, the one state R25 is about); M9 (`migrated_at` overwritten by every run) |
| Carried: session inputs as flags on every team command | Met | `04:29` |
| Carried: archived items take no rule; split items; unbinding with record | Met | `03:252`, `06:135-168` |
| Carried: no stage named after a team; public repo shows nothing internal | Partially met | H5 |
| Carried: commands with scenario and full command line | Met | `04:10-23` |
| Scope note: several teams | Met | `04:125-147`, measured with `contention.mjs` |

## 2. Findings, ranked

### High

**H1. A refused team command writes the configuration and the record (R18, R21 decision c).** Context: `loadTeams` validates the
whole file and writes the SHA, the copy and the record whenever at least one team is valid, before it decides whether the command's own
team is valid. Evidence: `evaluator-spike/teams-load.mjs:55-66` (write at 55-62, refusal at 64-66); the design says the same,
`01-team-file.md:161-164` ("When at least one team is valid, it writes ... `teams_file_sha`"). ADV-01: with teams `solo` (valid) and
`other` (invalid), `backlog team update ... --team other` is refused and `.backlog/config.json` gains `teams_file_sha`. R18 says such a
command "changes no item, no file"; R21 c says the SHA is updated "only when it is valid". The spike's own test (`teams-load.test.mjs:95-101`)
checks the refusal but not that nothing was written. Fix: write the SHA and the record only when the command's team (every team for
`--show-all`) passed, and only before a command that proceeds; `backlog team validate` keeps its own rule (decision b).

**H2. The repository input lets a team command act in another repository's folder, under this repository's team file (R24, R22).**
Context: every team command takes `--repository <owner/name>` / SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY, which "select[s] which repository folder
new items go to" (`01:232`) and is the folder of `$team.items`, of item lookup and of `related` (`03:109`, `04:47`, `04:198`;
`evaluator.mjs:49,146-166`). Nothing ties it to the actionable repository whose `.backlog/config.json` and team file were loaded. So
`backlog team new --repository acme/other ...` run in `acme/app` reads and writes `acme/other`'s items, numbers and index with
`acme/app`'s rules. R24: "No command reads, writes ... another repository's folder"; R22: team behaviour is repository-specific. The
R24 audit (`04:186-208`) does not list this input. Fix: a repository input that differs from the actionable repository is refused (exit
2), or the input is removed; state which in chapter 01 section 5 and the R24 table.

**H3. Publication drops or publishes local commits of other folders (R24).** Context: a team command's re-run resets the clone's branch
to upstream (`git reset --keep @{u}`), and its rebase path pushes the whole branch. Evidence: `numbers.mjs:39-46`;
`04-team-commands.md:102` ("paths outside the folder keep any local change"), `:204-205`. `reset --keep` keeps uncommitted changes but
removes every unpushed commit from the branch, including a person's commit in another folder and the commit an earlier command "keeps
local" after a conflict (`04:205`): ADV-22 shows the person's commit gone from `HEAD`. When only other folders changed upstream, the
rebase and push publish everything local: ADV-23 shows a person's unpushed draft in another folder pushed by the team command. Today's
push is `HEAD:refs/heads/<branch>` (`src/shared/sync.js:499`), so user commands share the second half. Fix: before publishing, if
`@{u}..HEAD` holds a commit the command did not make, stop with nothing published (exit 3, a text naming the commit); or build the
command's own commit on top of upstream and push that commit alone.

**H4. `backlog setup` is refused in the one state R25 is about (R25).** Evidence: `06-migration.md:32` "Only `backlog team validate`,
`backlog team migrate`, `backlog --help`, `backlog --version` and `backlog upgrade` run on a markdown backlog", while `06:68-71` and case
R25-01 make setup print "has not been migrated ... run backlog team migrate" exactly when the backlog is still markdown. Setup cannot both
be refused and print the advice. Fix: add `backlog setup` to the list at `06:32` (it reads no item).

**H5. The public repository still describes how the internal factory behaves (carried-forward ruling; round 1 A-H5 fix incomplete).**
Evidence: `../reference/consumers.tsv` (22 rows) describes, row by row, the scripts of the internal consuming repository: what its lead
runner exports, which statuses its wake hook treats as finished, what its scheduled job writes into a roster, which views its tools read,
the stage names of the internal team's workflow (row CON-13), and the rules its skills state (row CON-14); names are redacted to
placeholders but the behaviour is intact. `../reference/01-inventory.md:319-325` repeats the consumer paths. `../00-owner-rulings.md:63-64`
states the internal team's card lifecycle has four review stages and a stage hand-off note, and `:119` that the factory runs up to three
teams at once. Outside this plan folder, ten files under `.agents/docs/` at HEAD (analysis, handoffs, dependency-handoffs,
`backlog-impacts.md`) still contain the internal names of the review brief, and `../00-owner-rulings.md:5` sends readers to commit the commit of the removed analysis,
which holds more. Fix: move `consumers.tsv`, the consumer section of `01-inventory.md` and the internal specifics of the rulings to the
backlog repo, leaving a generic line ("22 consumer call sites in a private repository change with entry plan Task 6"); scrub or move the
ten `.agents/docs/` files; drop the pointer to the commit of the removed analysis.

### Medium

**M1. Renumbering after a code-branch merge contradicts "a team item is never renumbered" (R12, R3a).** `05:56-57` and `08:200` say the
next writing command renumbers the newer of two items holding one number; `05:74-75` says a team item is never renumbered and no
team-defined reference follows a renumbering. If the newer item is a team item, either rule breaks: its published number changes and
references in team fields point at the wrong item. "The next writing command" may also be a user command, which must not change a team
item without `--show-all`. Fix: renumber only items without a team; a duplicate that involves a team item stops that folder's team
commands with a validate error until a person renumbers it with a team step or the migration.

**M2. A number that existed only in a merge commit can be handed out again (R12).** `numbers.mjs:18-19` runs `git log --name-only` and
`git log -p`, which show no diff for merge commits. ADV-21: a person resolving a merge gives an item number 5 inside the merge commit, the
item is later cleaned; the high-water mark is 3, so number 5 will be handed out again. Fix: `--diff-merges=separate` (or `-m`) on both
scans; add the case to `numbers.test.mjs`.

**M3. A file-name number beyond 2^53 makes allocations repeat (R12).** `numbers.mjs:17` converts with `Number`. ADV-20: after a file
`9007199254740993-odd.json` is committed, two allocations both return 9007199254740992. Anyone who can push to the backlog can plant
it. Fix: a file name whose number exceeds a sane bound (for example 10^9) is an unreadable item (exit 2), never part of the mark.

**M4. Case R24-01 contradicts the text that cites it.** `04:198` says an unresolved foreign reference "reads as a missing item and stops
nothing (case R24-01)"; case R24-01 (`rule-cases.json`) expects the claim refused, exit 1, because `acme/lib#7` is unresolved. So a
folder still in markdown does stop a claim, for as long as it stays markdown. Fix: change the text to "reads as a missing item; whether a
step is refused is the team's rule (the parallel example treats it as open)", and say whether a rule can tell "unresolved" from "open".

**M5. Rulings marked pending are treated as decided; one deviation from R18 has no owner answer.** `../00-owner-rulings.md:78-80` (R14:
which team commands accept `--show-all` is "pending the owner's confirmation") and `:107` (R19a: help of a single user command "pending
confirmation") are still pending in the rulings file; round 8 confirmed only R19. `review-response.md` R2-3 makes validity per team
although R18 says "the file fails validation". `decisions.md:3` says no decision is open. Fix: list the three as "2026-11-09 round 12,
question 1 to 3" with problem, options and the implementation pattern, or record the owner's answers if they were given elsewhere.

**M6. The spike's validate misses 11 checks that chapter 08 promises; four lead to unsafe run-time behaviour (R11, R18).** ADV-05 to
ADV-13, ADV-16, ADV-17 (section 4) all validate clean. The unsafe ones: a rule `"do": {"team": "other"}` moves the team's item to
another team (ADV-06; `03:253` says "no writes to another team's items", and the coded binding check `evaluator.mjs:154` only covers items
without a team); `{"plus": "$item.estimate"}` crashes with a TypeError, not a refusal (ADV-12); `"delete": "no"` deletes and
`"archive": "false"` archives (ADV-16); a malformed `{"is": "$item.status"}` makes pop answer idle silently (ADV-11). The coverage row
for R18 is BAKE-IN on case VAL-21 alone. Fix: implement the chapter 08 rows in the spike with one case each, and add a coded run-time
check that a `team` effect writes only `$team.name` or empty (defence in depth, like the binding check).

**M7. Reserved argument names omit `show-all` and `ask` (R14, R17).** `03:114-115`, `08:177`, `evaluator.mjs:21`. ADV-05: a rule
reading `$arg.show-all` validates clean, yet `backlog team update` refuses `--show-all` (`04:30`), so the step can never receive it;
`--ask` of `migrate` is the same kind of CLI flag. Fix: add both to the list (and any future CLI flag).

**M8. An own-folder reference written in foreign form escapes the reference checks.** `02:130` checks a foreign `owner/name#seq` only
for form; `evaluator.mjs:175` skips every foreign-form entry. ADV-14: on item 1 of `acme/app`, `acme/app#1` (itself) and `acme/app#999`
(no such item) are both accepted. Fix: normalise `<own owner/name>#n` to `n` before the checks.

**M9. `migrated_at` records the last run, not when the backlog was migrated (R25).** `06:64-66`, `setup.mjs:88`: written by "every
successful run that is not a dry run", which includes a run on a JSON folder that converts nothing and every `--ask` run (`06:40-41`).
R25 asks for "when the backlog was migrated". Fix: write `migrated_at` only when the run converted at least one file;
`migrated_by_version` on every run.

**M10. An unparsable `.backlog/config.json` is replaced (data loss).** `teams-load.mjs:15,26-30`: `readConfig` turns a parse error into
`{}` and `writeSha` then writes `{"teams_file_sha": ...}` over the file. ADV-02: a configuration with a trailing comma loses
`backlog_repository` and `team`. The same `{}` also hides a `teams_file` key, so the wrong team file is loaded. Fix: an unreadable
configuration stops every command with exit 2 and writes nothing.

**M11. `--help` reads the team file, against the command matrix (R5, matrix).** `04:31` and `02:111` print a team's steps and field
descriptions in `backlog team update --help` / `backlog team new --help`; `../01-command-behaviour-matrix.md:42` says every `--help`
"read[s] nothing, write[s] nothing". Through chapter 01 section 4 the load may also write the SHA. Fix: keep help generic and point to
`backlog team query steps`, or raise it as an owner question.

### Low

- **L1** (R21) A record dated in the future (clock skew) stays fresh for ever: `teams-load.mjs:41` accepts a negative age. ADV-04. Fix:
  age outside 0 to 24 hours is stale.
- **L2** (R22 path safety) `01:49-51` refuses a symbolic-link folder between the repository root and the team file; the spike checks
  only the file (`teams-load.mjs:46`). ADV-03 loads a file through `.backlog/link/`.
- **L3** (R22) `teams-load.mjs:20` decides "outside the repository" by a `..` prefix, so a backlog folder named `..backlog` inside the
  repository counts as outside. ADV-19. Fix: compare path segments.
- **L4** (R19a) `SMOOTH_BACKLOG_CLI_TEAM_NAME=` (set, empty) does not block user commands (`evaluator.mjs:234`). ADV-15. State the
  reading ("set and not empty") or block on presence.
- **L5** `"step": []` validates clean and matches nothing (ADV-17); the regex compiler accepts a reversed class `[z-a]`, which matches
  nothing (ADV-18; the size limit on `(a{100}){100}` does work).
- **L6** (R22) `01:42-44` also switches the default location on `backlog_origin_url` and on SMOOTH_BACKLOG_CLI_HOME; R22 says "when the
  configuration defines a backlog repository folder". An environment variable then changes which team file a command reads.
- **L7** (R19, R1) with `--show-all`, `backlog done` writes the CLI's word `closed` into a team item (`04:179`), a word the team may not
  have, so the item stays open in the team's queue with an invalid status; `clean` deletes and `import` moves team items (`04:180`),
  more than R19's "set values" (archiving is named, deleting is not). State the reading or limit them.
- **L8** (R24) the clone lock's time budget (`04:107`, `04:203`) ends a command because another folder's command holds the lock: a stop
  caused by another folder. State it as the accepted limit.
- **L9** Stale texts: `review-response.md` R2-5 ("the whole backlog") and R3-4 ("stops with a text") were superseded by R3-4 and R4-1;
  its totals and B-H1 cite decisions 2 to 4 and DEFERRED rows that no longer exist; `setup.mjs:1` cites "chapter 06 section 8" (it is
  2.0); `03:267` "three modules" then lists five; `06:5` says the migration "may write the file's SHA", `06:118-119` says it does not use
  the record; say which.
- **L10** `coverage.tsv` has rows for R14 to R25, R19a and the scope note only (14 rows, `make-coverage.mjs:229` matches
  `R1[4-9]a?|R2[0-5]`); R1 to R13, R3a, R3b and the five carried-forward bullets have no row of their own. Fix: one row each, so the
  checklist covers every ruling.
- **L11** (R22) with the team file in a separate backlog repository and its SHA in the actionable repository, a SHA committed before
  the backlog clone has pulled the matching file is overwritten in the working tree with the old file's SHA (`01:161-164`): the two
  repositories flip the value. Stated in part as R3-3; add this case.

## 3. Scope the rulings did not ask for

| addition | justification given | assessment |
|---|---|---|
| `backlog update <item> --show-all --set <field>=<value>` (`04:178`) | R19 lets a user command set values; no user flag names a team field (`review-response.md` R2-7) | justified; the restriction "only on a team item" is unrequested but harmless |
| refusal of `--show-all` together with `--team` (`01:218-219`, case R14-07) | none stated | new coded refusal; R15 forbids refusing a flag against a variable, not this; name it in a round 12 question or drop it (the flag could simply win) |
| `--show-all` refused by `query plan/check/filter/steps` (`01:220-221`) | they evaluate one team's rules | reasonable, but the spike cannot express it (`resolveInputs` sees only `query`) |
| validated copy of `teams.json` in the per-user state (`01:146-151`) | R21 "proceeds without reading the file" needs the content (R2-2) | justified; it is a second copy of the team file on disk |
| `.backlog/team-templates/` removed and recopied on every setup, deleting files a person added (`01:82-85`) | R23 "the way it already deploys the skill copy" | justified by the ruling's words; the deletion should be in the setup message |
| setup advice for "migrated by an older version" (`06:72-74`) | none | unrequested; R25 asks for a recommendation when a backlog folder is defined; harmless |
| shallow-clone refusal, `--seq` floor, `numbers.json` and the history scan cache (`05:44-50`, `05:79-81`) | R12 | justified |
| removal of `backlog move` to another repository, of the foreign cycle walk and of cross-folder chunk work (`04:200-202`) | R24 | justified; a removal of today's behaviour, worth a line in the release notes |
| `backlog team query rules`, `query steps`, `query check`, `query plan` (`04:17-21`) | R8 (skills read the rule set) | justified (round 1 scope) |
| exit 2 stop for the root file `.smooth-backlog.json` (`06:224`) | R18 | justified |
| random growing wait and the lock budget for re-runs (`04:105-108`) | scope note, measured | justified |
| `--help` listing a team's steps (`04:31`) | none | unrequested and against the matrix (M11) |

## 4. Rule language and the new adversarial cases

Precedence (first match decides, deny by default), defaults (definition default for a missing field), and termination (no loops, one
hop, linear regex, quadratic pop worst case stated) are as chapter 03 says; the spike agrees (`evaluator.mjs:100-108`). The gaps are in
what validate catches before evaluation (M6) and in references (M8). Each case below asserts what the design or a ruling requires; all
23 fail on the spike at 0128400.

| id | attack | required | result on the spike |
|---|---|---|---|
| ADV-01 | load for an invalid team while another team is valid | nothing written | `teams_file_sha` written into `.backlog/config.json` (H1) |
| ADV-02 | `.backlog/config.json` with a trailing comma, valid team file | configuration untouched | replaced by `{"teams_file_sha": ...}` (M10) |
| ADV-03 | `teams_file` through a symbolic-link folder inside the repository | refused (`01:49-51`) | loaded (L2) |
| ADV-04 | record written with the clock at 2030, then read in 2026 after the file broke | stale, file read, refused | record used, no refusal (L1) |
| ADV-05 | rule reads `$arg.show-all` | validate error | clean (M7) |
| ADV-06 | rule `"do": {"team": "other"}` on the team's own item | validate error; never a move | clean; step allowed, item 1 now of team `other` (M6) |
| ADV-07 | team key `"Bad Team"` | validate error (`08:134`) | clean (M6) |
| ADV-08 | `people: {"agent-1": "worker"}` (text, not list) | validate error (`08:143`) | clean (M6) |
| ADV-09 | number field with default `"abc"` | validate error (`08:152`) | clean (M6) |
| ADV-10 | `final: ["gone"]`; `status` without `final` | validate errors (`08:154`) | both clean (M6) |
| ADV-11 | condition `{"is": "$item.status"}` | validate error (`08:171`) | clean; `update` exits 2 "unknown reference $", `pop` answers idle (M6) |
| ADV-12 | `{"plus": "$item.estimate"}` | validate error; never a crash | clean; TypeError at run time (M6) |
| ADV-13 | deny text `{$item.kids}` | validate error (`08:185`) | clean; prints an empty text (M6) |
| ADV-14 | `acme/app#1` on item 1 and `acme/app#999` | refused as self and as missing | both accepted (M8) |
| ADV-15 | team variable set to the empty text | user command blocked (R19a) | not blocked (L4) |
| ADV-16 | `"delete": "no", "archive": "false"` | validate error; nothing deleted | clean; `delete=true`, `archived=true` (M6) |
| ADV-17 | `"step": []` | validate error | clean (L5) |
| ADV-18 | regex `[z-a]`; `(a{100}){100}` | both refused | `[z-a]` accepted; the second refused, "the pattern is too large" (L5) |
| ADV-19 | backlog folder `/x/app/..backlog`, repository `/x/app` | default `.backlog/teams.json` rule | treated as a separate backlog repository (L3) |
| ADV-20 | committed file `9007199254740993-odd.json`, then two allocations | two numbers | both 9007199254740992 (M3) |
| ADV-21 | number 5 exists only in a merge commit, then deleted | mark at least 5 | mark 3 (M2) |
| ADV-22 | person's unpushed commit in another folder; upstream changed the own folder; team re-run | person's commit kept | dropped from the branch (H3) |
| ADV-23 | person's unpushed draft in another folder; upstream changed only another folder | only the command's commit published | the draft is pushed (H3) |

## 5. Numbering (R12) and the index (R13)

Paths by which a number could be reused or duplicated, with the per-folder high-water mark of chapter 05:

| path | status |
|---|---|
| delete, clean, archive of the newest item | closed (history clause; spike test 1) |
| `git revert` of a creation; counter lowered or deleted | closed (spike test 2) |
| two clones create at once (team re-run; user renumber after rebase) | closed (spike tests) |
| another clone published and deleted the number before this push | closed (upstream mark) |
| shallow clone | refused |
| migration | seeded from the folder's whole history |
| a number present only in a merge commit | open (M2, ADV-21) |
| a file-name number beyond 2^53 | open (M3, ADV-20) |
| code branches of an in-repository backlog merged by git | stated limit; its repair contradicts "a team item is never renumbered" (M1) |
| history rewritten by a force push; refs the clone never fetched | stated limits (`05:52-53`, `06:116-117`) |
| a JSON `seq` that differs from its file name (hand edit) | the mark reads file names only; validate should report the mismatch (add a row to chapter 08 section 7) |
| a re-run's `reset --keep` dropping an unpushed allocation of another command | no reuse (never published) but data loss (H3) |

Index: the structure `{"branches": {"<branch>": [{seq, slug, name, status}]}}` (`05:89`) is today's (`src/shared/index.js:2,40`);
unchanged as R13 requires. The user and team queues are filters over it (`05:101-109`).

## 6. R24, command by command

The chapter 04 section 9 audit is complete for items, numbers, index, migrate, validate, clean, move, import and foreign references.
Missing or wrong: the repository input (H2); `reset --keep` and the whole-branch push (H3); the "stops nothing" claim of case R24-01
(M4); the lock timeout (L8). `git pull --rebase` of the whole clone is harmless as stated (`04:204`) only while the clone holds no
unpushed commit outside the folder; today's pull also uses `--autostash` (`src/shared/sync.js:22`), whose conflict in another folder's
file would stop the command, so the implementation should say how a conflicting autostash outside the folder is reported. Staging is
limited to the folder in the spike (`numbers.mjs:69`) and in today's code (`src/shared/sync.js:446,490`).

## 7. Coverage counts

`node coverage/make-coverage.mjs` reproduces both files unchanged. Independent counts of `../reference/*.tsv` data rows (non-empty lines
after the header): inventory 1033, tests 819, consumers 22, gaps 47; each equals its row in `coverage-counts.tsv`, and the state columns
add up (all: 2021 = 1428 + 253 + 291 + 49). The rulings file has 28 numbered rulings (R1 to R25, R3a, R3b, R19a), 5 carried-forward
bullets, 2 lead decisions and the scope note; `coverage.tsv` holds 14 rows from it (R14 to R25, R19a, the scope note). The counts
reconcile for what the script reads; the ruling rows are incomplete (L10).

## 8. Public-repository check

`grep -rniE` of the plan folder for the internal team, host, tool and job names of the review brief: no hit in `design/` (chapters,
examples, cases, spike, coverage) or `../01-command-behaviour-matrix.md`. Hits on behaviour, not names: `../reference/consumers.tsv`,
`../reference/01-inventory.md:319-325`, `../00-owner-rulings.md:63-64,119` (H5). Outside the plan folder: ten files under `.agents/docs/`
at HEAD contain internal names (H5); the names are not repeated here because this file is in the public repository.
