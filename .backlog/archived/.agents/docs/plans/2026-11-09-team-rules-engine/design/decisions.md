# Decisions of the owner (team rules engine design)

Context: the owner's rulings R1 to R25 settle almost everything in this design. Two reviews of the round-4 design (`review-c.md`,
`review-d.md`) raised seven points, labelled "2026-11-09 round 12, question 1" to "question 7". All seven are closed (2026-11-09): four by
the owner's answer when asked, one by the owner's statement that it is outside the CLI's scope, and two by rulings that already decided
them, which the lead had not applied. The design follows the answers below; nothing here is open. Each entry keeps the scenario, the
problem and the options that were considered, then the answer and where the design states it.

## 2026-11-09 round 12, question 1: what the repository input of a team command means

Scenario: an agent works in a checkout of `acme/app`, but its session names another repository, and it runs
`backlog team new --team web --agent lead-1 --repository acme/lib --name "Parse the header"` (the same happens with the variable
SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY set to `acme/lib`).

The problem. Every team command takes a repository input, and today it decides which repository folder of the backlog the command reads
and writes. The rulings make team behaviour belong to one repository (R22: its team file and its SHA live in that repository's
configuration) and say that no command may act on another repository's folder (R24). With an input that names `acme/lib` while the
checkout is `acme/app`, the round-4 design loaded the rules of `acme/app` and wrote the items, numbers and index of `acme/lib`: one
repository's rules acting on another repository's items.

The implementation pattern. The repository input is resolved first (flag, then variable, then the checkout's own repository). The
resolution of the team file (chapter 01 section 1.1), the place of the SHA and of the per-user record (chapter 01 section 4), the folder the
command reads and writes, and `$session.repository` all follow from it. The working copy's `.backlog/config.json` carries the keys
`teams_file`, `teams_file_sha`, `migrated_at` and `migrated_by_version` for the working copy's repository only.

- **Option A: the input defines the repository the command acts on.** The command acts on `acme/lib` with the rules of `acme/lib`: its
  team file is `acme/lib`'s folder file in the backlog, `<backlog repository>/acme/lib/teams.json`, and the SHA is kept in the per-user
  record, never in the working copy's `.backlog/config.json`, which belongs to `acme/app`. A session can keep handing work to teams of other
  repositories, as it does today, and every command still acts on exactly one repository's folder with that repository's rules. A
  repository whose team file lives inside its own code (`.backlog/teams.json`) cannot be served from another checkout this way.
- **Option B: remove the input.** A team command always acts on the repository of the checkout it runs in; a session that works for
  `acme/lib` runs in a checkout of `acme/lib`. The scope is then simple and the same for every command, and no rule of one repository can
  meet the items of another. Sessions that today set the variable to another repository than their checkout must change where they run.

**Answer (owner, 2026-11-09): option A.** The input defines the repository the command acts on. The ruling carried forward from the earlier
rounds already kept the repository input as an input and a flag of every team command. Design: `01-team-file.md` sections 1.1 and 5,
`04-team-commands.md` section 9, case R22-07.

## 2026-11-09 round 12, question 2: what a team command publishes when another agent published first

Scenario: a person keeps the backlog inside the code repository (`.backlog`) and has two code commits that are not pushed yet. An agent of
the team runs `backlog team update 42 claim --team web --agent member-1` in that checkout, and the push is refused because another agent
claimed item 41 a moment earlier.

The problem. A team command whose push is refused runs the whole step again on the latest version, so that the team's rules decide on
fresh items (chapter 04 section 6). The round-4 design reset the branch to the upstream version first, which would have thrown away the
person's two unpushed commits. Today's code, in a backlog inside the code repository, pushes the person's unpushed commits together with
every backlog change (`src/shared/sync.js:53-62` sets the target to the code branch, and `:412` says "the user's own repository has its
own unpushed commits: they are pushed with the change"; the push at `:499` is `HEAD:refs/heads/<branch>`). Stopping whenever such commits
exist was considered and rejected: in a backlog inside the code repository it would block nearly every team command.

The implementation pattern. The command's own commit is always HEAD when it is published (today's `mine` in `src/shared/sync.js`). The
choice is only in what the re-run drops and what the push sends; the rules, the numbers and the index do not change between the options.

- **Option A: drop only the command's own commit, then pull and push as today.** The re-run runs `git reset --keep HEAD~1`, today's
  `git pull --rebase --autostash`, the step again, and today's push of the branch. No commit or change of the person is ever lost, and the
  code stays as close to today as it can. The person's unpushed commits are published with the change, exactly as every backlog change
  in that mode publishes them today.
- **Option B: publish only the command's own commit.** The command builds its commit on top of the upstream branch and pushes that commit
  alone (`git push origin <commit>:refs/heads/<branch>`), and the person's commits stay local. Nothing of the person's is published
  without their action. This needs new publication code for team commands only, so team commands and user commands would publish
  differently in the same checkout, and the person's local branch must then be rebased onto what the command pushed.

**Answer (owner, 2026-11-09): option B.** A team command publishes only its own commit; a person's unpushed commits stay local. This
replaces the lead's earlier recommendation of option A. Design: `04-team-commands.md` sections 6 and 9, `05-numbering-and-index.md`
section 3, spike `numbers.mjs` (`publishByRerun`) and its two tests.

## 2026-11-09 round 12, question 3: a duplicate item number after two code branches are merged

Scenario: a repository keeps its backlog inside the code (`.backlog`). On branch `feature` a lead creates item 57 with
`backlog team new --team web --agent lead-1 --name "Cache the parser"`; on `main` a person creates another item 57 with
`backlog new --name "Fix the login page"`. A person then runs `git merge feature` on `main`, and an agent runs
`backlog team update 57 claim --team web --agent member-1`.

The problem. Numbers are never reused (R12), but two code branches that never saw each other can both hand out the next number, and a merge
made with git outside the CLI brings both items together. Today's code renumbers the newer item. A team item's number may be named in the
team's own fields of other items (a parent, a dependency), whose meaning only the team knows, so renumbering a team item would leave those
references pointing at the wrong item or force the CLI to guess which fields hold item numbers.

The implementation pattern. The duplicate is found when a command loads the folder (chapter 05 section 2) and by `backlog team validate`
(chapter 08 section 7). Items without a team are renumbered by today's renumbering (`src/shared/sync.js:203`, which rewrites the file
name, `seq`, the slug, the heading and the references of items without a team).

- **Option A: renumber only items without a team.** When both items have no team, the newer one is renumbered as today. When either has
  a team, nothing is renumbered: validate reports the duplicate as an error and every team command of that folder stops with exit 2 until
  a person gives one item a free number (`backlog update <slug> --show-all --seq <n>`). No reference is ever changed behind a team's back;
  the cost is a stop of that folder's team commands until a person acts.
- **Option B: renumber the newer item either way.** The CLI renumbers the newer item even when it has a team, and also rewrites every
  field of the team's definition whose type is `item` or `items` that names the old number. Team commands never stop, but a reference
  that meant the older item (the merge cannot tell which one was meant) is changed too, so a link can silently move to the wrong item.
- **Option C: never renumber; stop every command.** Any duplicate stops every command of the folder, user and team, until a person
  renumbers one item. Nothing is ever changed automatically, but user commands lose today's automatic repair.

**Answer (owner, 2026-11-09), in the owner's words: "The behavior of merging is outside the scope of the CLI. The user will have to
figure it out."** None of the three options is taken: the CLI renumbers nothing after such a merge, stops no folder because of it and
validate does not look for it. The lead's consequence, kept as small as possible: a command given a number that two items hold cannot
tell which is meant, names both slugs and stops, changing nothing. Design: `05-numbering-and-index.md` section 2; the row is removed from
`08-validate.md` section 7.

## 2026-11-09 round 12, question 4: when one team's entry in the team file is broken

Scenario: one team file holds the teams `web` and `ops`. A lead of `ops` pushes an edit with a typo in one of its rules. A member of `web`
then runs `backlog team pop --team web --agent member-1`.

The problem. R18 says that when a team command loads the team file "and the file fails validation", the command takes no action. Read
for the whole file, one team's typo stops every team that shares the file. R21 records "the valid teams as a comma separated list", which
only makes sense if some teams can be valid while others are not.

The implementation pattern. Validation always checks the whole file (chapter 08). The per-user record lists the valid teams; the SHA
covers the whole file, so any edit makes every team's next command validate again (chapter 01 section 4). The choice is only which
findings stop a command.

- **Option B: per team.** Only the command's own team entry (and the file's shape) must be valid; `web` keeps working while `ops` is
  refused until its lead fixes the typo. A team is never stopped by another team's edit, and the record of R21 is used as written. The
  migration still needs every entry valid, because it converts every team's items.
- **Option A: the whole file.** Any finding in any entry stops every team command of every team in that file. The reading of R18 is the
  literal one, and a broken file is noticed by everyone at once; one team's mistake stops all the others until it is fixed.

**Answer (owner, 2026-11-09): option A, the whole file.** This is the wording of R18; the lead's earlier per-team recommendation departed
from it. Any finding in any entry stops every team command of every team of that file. Design: `01-team-file.md` section 4,
`08-validate.md` section 1, spike `teams-load.mjs` (`loadTeams`) and its tests.

## 2026-11-09 round 12, question 5: which team commands take `--show-all`

Scenario: the owner checks every team's open work with `backlog team query --show-all`, then a script that also sets
SMOOTH_BACKLOG_CLI_TEAM_NAME runs `backlog team query --team web --show-all`, and an agent tries `backlog team pop --show-all`.

The problem. R14 says a team command needs one specific team and that `--show-all` makes it act over every team, and leaves which team
commands accept the flag to the design, "pending the owner's confirmation". Some team commands look at one team's rules to decide (`new`,
`update`, `pop`, and the query forms `plan`, `check`, `filter` and `steps`), so "every team" has no meaning for them.

The implementation pattern. The input resolution of chapter 01 section 5 checks the flag before anything is read; the refusals are exit 2
with a text that names the right flag. The spike's `resolveInputs` holds the list.

- **Option A: accepted by the commands that read over teams, refused elsewhere, and an error with `--team`.** `--show-all` is accepted
  by `backlog team query` (its list form, `query <item>` and `query rules`), `backlog team validate` and `backlog team migrate`; it is
  refused by `new`, `update`, `pop` and the one-team query forms; given together with `--team` it is an error. Each command does exactly
  one thing, and a contradictory command line is caught, at the cost of one more refusal text.
- **Option B: the same commands, but `--team` wins.** Given together, `--team` decides and `--show-all` is ignored. No command line is
  refused for the combination, but a person who typed `--show-all` silently sees one team only.

**Answer (owner, 2026-11-09): option B.** The same commands accept `--show-all`; given together with `--team`, `--team` decides and
`--show-all` is ignored. Design: `01-team-file.md` section 5, `04-team-commands.md` sections 1 and 5, spike `resolveInputs`, case R14-07.

## 2026-11-09 round 12, question 6: where the team file is when the repository has no backlog configuration

Scenario: a repository has no `.backlog/config.json`; its backlog folder lives in a separate backlog repository that the CLI finds through
SMOOTH_BACKLOG_CLI_ORIGIN_URL or through the per-user record that `backlog setup` wrote earlier. A lead runs
`backlog team validate --team web` in a checkout of that repository.

The problem. R22 puts the team file at `<backlog repository>/<owner>/<name>/teams.json` "when the configuration defines a backlog
repository folder", and at `.backlog/teams.json` otherwise. Here the backlog lives outside the repository, but no configuration says so.
Read literally, the team file would be `.backlog/teams.json` inside the code repository, and the first team command would create
`.backlog/config.json` there to hold the SHA, so a public repository could commit and publish its team's rules by accident.

The implementation pattern. The CLI already resolves the backlog folder (`src/shared/store.js:32-44`: the variable, the configuration, the
per-user record). The resolution of chapter 01 section 1.1 compares that folder with the repository; the SHA goes into the configuration
when one exists, else into the per-user record.

- **Option A: a backlog found any way counts as defined.** When the backlog folder lies outside the repository, however the CLI found
  it, the team file defaults to `<backlog repository>/<owner>/<name>/teams.json`, and the CLI never creates `.backlog/config.json` just to
  hold the SHA (it is kept in the per-user record). The team file then follows the backlog the commands actually use, and nothing new
  appears in the code repository.
- **Option B: only an explicit `backlog_repository` key counts.** Without the key, the default is `.backlog/teams.json` in the repository,
  and the CLI writes the SHA into a new `.backlog/config.json`. The rule is the literal reading of R22 and needs no knowledge of how the
  backlog was found; repositories without a configuration keep their team's rules in the code and get a new committed file.

**Answer: already decided by ruling R22 and the owner rule of 2026-11-07, which correspond to option B.** The owner said on 2026-11-09 that this had
been answered before; the lead's earlier recommendation of option A contradicted the ruling. Only the repository's `.backlog/config.json`
defines the location: the `teams_file` key, else the repository's folder of a `backlog_repository` outside the repository, else
`.backlog/teams.json`; the SHA is written into `.backlog/config.json`. A public repository names a private location in its configuration;
the design adds no mechanism (R22). Design: `01-team-file.md` section 1.1, spike `teamsFile`, case R22-08.

## 2026-11-09 round 12, question 7: protecting a migrated folder from older releases of the CLI

Scenario: after the migration of `acme/app`, a second machine still has a release from before the cut-over (its self-update does not
cross a schema change on its own), and a person there runs `backlog new --name "Fix login"` in a checkout of `acme/app`.

The problem. A release from before the cut-over reads only markdown item files (`src/shared/store.js:285`). On a migrated folder it sees
no item at all, so it hands out number 1 again (`nextSeq`, `src/shared/store.js:299`) and its index reconcile drops every entry of the
queue, then publishes the result. The self-update refuses a release whose `backlogSchemaVersion` differs (`src/upgrade.js:140`), so older
installations stay old until someone updates them by hand, and a rollback of an installation is the same case.

The implementation pattern. Today's reader stops every command of a folder with exit 2 when a file in `phases/` has a header it cannot
parse (`src/shared/store.js:257-266`). The migration can use that: it writes one such file per migrated folder,
`phases/000-migrated-to-json.md`, which the new release ignores by name, and the cut-over sets `backlogSchemaVersion` to 2 in
`package.json`.

- **Option A: the stop file and schema version 2.** Every older release stops on a migrated folder before it reads or writes anything,
  with a text that names the release needed, and the self-update tells older installations that a manual update is required. The cost is
  one extra file per folder and one exception in the new reader.
- **Option B: nothing.** The migration writes no extra file and the schema number stays. The folder holds only items, but an older
  release on any machine can reuse numbers and wipe the queue order of a migrated folder until every installation is updated.

**Answer: already decided by ruling R18 and the owner rule of 2026-11-07 (no backwards compatibility anywhere; upgrade and migrate or
fail), which correspond to option B.** This is the lead's reading of those rulings, taken after the owner said on 2026-11-09 that the open points had
been answered before; it is reversible on the owner's word. Nothing is built for older releases; every installation is upgraded before a
folder is migrated. Design: `06-migration.md` sections 3 and 6.
