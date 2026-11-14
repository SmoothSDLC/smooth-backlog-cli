# Review A — correctness and ruling conformance of the team rules engine design

Context: this is an independent review of the design in this folder (chapters 01 to 08, `decisions.md`, `examples/`, `rule-cases.json`,
`coverage/`, `evaluator-spike/`) at commit 74da886. The binding requirements are the owner rulings R1 to R13 and the carried-forward items
in `../00-owner-rulings.md`, and the command matrix in `../01-command-behaviour-matrix.md`. The reviewer's angle is correctness and
conformance to those rulings. Paths below are relative to this `design/` folder unless they start with `../` or `src/`. Every claim
that something fails was run; the commands and outputs are quoted.

Severity scale: **High** = a ruling is broken or a team file can silently do the opposite of what it says; **Medium** = a real defect
or contradiction the implementation would inherit; **Low** = an inconsistency, a missing test, or wording.

## 1. Verdict per ruling

| ruling | verdict | evidence and reason |
|---|---|---|
| R1 (CLI is a rules evaluator; no team behaviour, status word, stage or role in code) | **Partially met** | The language holds every flow decision (`03-rule-language.md` sections 2 to 9). Coded team policy remains: the agent must be a key of `people` (`01-team-file.md:59-60`), teamless items may be changed only through a binding rule (`03-rule-language.md:148-151`), and `final` on `status` drives what "open" means for the index and the queue (`02-item-definition-and-json-item.md:110`, `05-numbering-and-index.md:43`). See findings M4, M5, L1. |
| R2 (split, parent, children, dependencies, limits, queue, rounds, caps, notes are rules over fields) | **Met in the language; partially shown** | `03-rule-language.md:153-158` and `examples/parallel.json:22-38`. The example gates `close` on children but not on dependencies (`examples/parallel.json:36,38`, `claim-dependencies` names only `claim`), and `abandon` closes a parent whose children are open (`examples/parallel.json:65`). The ruling's own sentence ("cannot be worked on or closed unless its children and dependencies are closed") is therefore not demonstrated for closing. A self-dependency is accepted (case A7) and deadlocks the item. |
| R3 (user commands enforce nothing; ignore the team file; user identity from the operating system) | **Met, with one literal tension** | `04-team-commands.md:100-114`. The identity chain is BACKLOG_AGENT, the configuration's user, the git user name, then the login name (`04-team-commands.md:107`); R3 says "from the operating system user". The command matrix row says "Same" as today, so the design follows the matrix; the owner may want to know the literal text of R3 differs. |
| R3a (user commands ignore team items completely) | **Partially met** | The filter is stated (`04-team-commands.md:108`, case COD-06). Not specified: what `backlog new --depends-on 90` or `--split-from 90` answers when 90 is a team item (an existence check that sees team items reveals them, one that does not must answer "no item 90"). A team's `adopt` rule makes a user's own item disappear from every user command without the user acting (finding M5). |
| R3b (team and agent inputs; never the user identity; three-ways error) | **Met** | `01-team-file.md:76-93`, `04-team-commands.md:73-74`, cases COD-01, COD-05, COD-13. Decision 1 (`decisions.md:7-35`) about `validate` and `migrate` is a real conflict between R3b and R11/R4 and is correctly raised. |
| R4 (items are JSON; every item migrates; migrate or fail) | **Partially met** | Mapping and failures: `02-item-definition-and-json-item.md:153-177`, `06-migration.md:84-97`. Contradiction: `06-migration.md:27-28` treats a missing or unreadable `teams.json` as "no team has an entry" and unbinds every team item, while `01-team-file.md:66-68` removes exactly that silent empty default (finding H4). |
| R5 (the CLI only reads the team file; no template) | **Met** | `01-team-file.md:8-17`, `04-team-commands.md:25-26`, `06-migration.md:4`. |
| R6 (template is a starting copy; owner's team gets the default) | **Met by deferral** | Left to entry plan Task 6 (`07-skills.md:5-7`); examples are documentation never read by the CLI (`07-skills.md:56`). |
| R7 (item definition is data only) | **Partially met** | Field keys are `type`, `description`, `default`, `values` and `final` (`02-item-definition-and-json-item.md:104-110`). `final` is not in R7's list and carries behaviour (open versus finished for the index order, the team queue and `$team.items`), see finding L1. |
| R8 (rule set readable without the evaluator; skills use it directly) | **Met** | `03-rule-language.md:56-57`, `07-skills.md:9-22`. The readability claim is weakened by H1/H2 (a typo changes meaning without any feedback). |
| R9 (each rule verified independently, with test cases) | **Met for rules; partially for the language** | 131 verification entries and 191 cases; the spike test checks every rule, pop entry and filter has both (`evaluator-spike/evaluator.test.mjs:48-58`). The effects `delete`, `branch`, unbinding (`"team": ""`) and the function `length` appear in no example and no case (grep counts in section 5). |
| R10 (ordered table with defined precedence: order, specificity, default) | **Met with defects** | `03-rule-language.md:38-57`. Order and default are well defined. Specificity is enforced only syntactically (case A11 shows a shadowed rule validate does not report; the chapter admits the limit). Findings H1 and H2 show conditions and rules whose meaning silently changes. |
| R11 (`backlog team validate` gives per-rule feedback over the whole file) | **Partially met** | The finding form is good (`08-validate.md:17-32`). Missing checks: exactly one key per condition, unknown keys of a rule / pop entry / filter, names under `$session`, `$caller`, `$team`, field-name syntax, effects inside `related`; and one check contradicts the language (`$it` inside `related`). Findings H1, H2, M3, M7, L4. |
| R12 (numbers unique, never reused, any size) | **Not met** | The counter closes the deleted-newest gap, but two reuse paths remain and were reproduced with git: a clean rebase where the other clone published and then deleted the same number (H3a), and `git revert` of a creation (H3b). The design's statement that "the rebase of the second push stops on numbers.json" (`05-numbering-and-index.md:25-29`) is false when both clones write the same value. |
| R13 (priority separate, index structure unchanged) | **Met** | `05-numbering-and-index.md:39-44` keeps `{seq, slug, name, status}` per branch in priority order, matching `src/shared/index.js:22` and `:40`. Team and user entries share the lists; reordering keeps the other side's positions (`05-numbering-and-index.md:56-60`). |
| Carried: lifecycle, four review stages, hand-off note, deploy not a stage | **Met generically; team itself deferred** | `03-rule-language.md:210-213`; the owner's team is Task 6. |
| Carried: session inputs and a flag for every input on every team command | **Met** | `01-team-file.md:81-87`. |
| Carried: archived items take no rule; split items linked not bound; dead-team items unbound with a timestamped record | **Partially met** | `06-migration.md:46-75`. After the migration an item whose team entry is removed is stranded: user commands ignore it (it has a team) and no team command may touch it (another team's item is refused, `04-team-commands.md:79`), yet validate's fix text says "unbind the item with a rule of another team" (`08-validate.md:95`), which the language forbids (finding M6). |
| Carried: no review stage named after a team; public repo shows nothing internal | **Partially met** | `design/` is clean. The entry plan `../../2026-11-09-team-rules-engine.md:21-22` names the internal team, and `../reference/consumers.tsv` describes internal scripts (finding H5). |
| Carried: commands described with scenario and full command line | **Mostly met** | `04-team-commands.md:10-23`; the rows for `backlog team query`, `query <item>`, `query rules` and `query steps` give no example command line. |
| Lead decisions (archived migrate; no code in the team file) | **Met, with a denial-of-service gap** | The `regex` test lets the file hang every agent's command (finding H6). |

## 2. Findings, ranked

### High

**H1. A condition with two keys is accepted and its second key is silently ignored.** Chapter 03 says a condition is "a JSON object with
one key" (`03-rule-language.md:61`), but chapter 08 only checks that "every key of a condition is a test" (`08-validate.md:71`), which
`{"is": [...], "in": [...]}` satisfies. The spike reads only the first entry (`evaluator-spike/evaluator.mjs:47`,
`const [[op, a]] = Object.entries(c)`). Case A1: a guard written as `{"is": ["$item.status","open"], "in": ["lead","$caller.roles"]}` lets
the member `b` close the item, and validate reports 0 findings. A rule author who writes a role guard this way gets no role guard.
Fix: validate error "a condition has exactly one key (found is, in); wrap them in all"; the evaluator refuses such a condition at run
time as well. The same applies to function objects (`value`, `evaluator.mjs:33`) and to `{"text": ...}`.

**H2. An unknown key of a rule is accepted, so a misspelled `when` turns a guarded rule into an unconditional one.** Chapter 08 checks
`id`, `step` and the outcome of a rule (`08-validate.md:68-70`) but not that a rule has no other keys. Case A2: the last rule
`{"id":"close","step":"close","wehn":{"in":["lead","$caller.roles"]},"do":{...}}` allows any person to close, and validate reports 0
findings; the shadowing check cannot see it because nothing follows the rule. Fix: a rule has exactly the keys `id`, `step`, `when`,
`deny` or `do`; a pop entry `id`, `step`, `when`; a filter `description`, `when`; an effect `related` entry `items`, `set`, `add`,
`remove`; any other key is an error naming the closest valid key.

**H3. R12 is not guaranteed: two paths hand out a published number again.** Context: chapter 05 keeps `numbers.json` (`{"last": n}`) per
repository folder and allocates `1 + max(last, highest present)`.
- (a) **Two clones, the other one deleted its new item before this one pushed.** Clone A creates 101 (`last` 101), pushes, then deletes
  101 (for example `backlog clean`) and pushes. Clone B created its own 101 from the old `last` 100. B's rebase is clean, because both
  sides changed `numbers.json` from 100 to 101 identically and the item files have different names, and no present file holds 101, so
  no renumbering happens. Reproduced in a scratch repository: `git pull --rebase` exit 0, `f/phases` ends with `101-beta.json`, the
  number 101 that A published is now another item's. The design's sentence "the rebase of the second push stops on numbers.json"
  (`05-numbering-and-index.md:25-29`) is false for identical values; even the ordinary case (A's 101 still present) relies on today's
  post-rebase `renumber` in `src/shared/sync.js:203-216`, which the chapter does not name, and not on `repairConflicts`.
  Fix: after every pull, renumber every local unpublished item whose number is at or below the upstream `last` of the base it was
  created from, whether or not a file holds the number now (allocate from the upstream `last`), and state this in chapter 05.
- (b) **`git revert` of a creation.** Reverting the commit that created item 102 restores `"last": 101` and removes the file; the next
  allocation is 102 again. Reproduced: after `git revert`, `numbers.json` reads `{"last": 101}` and only `100-base.json` remains. The
  same holds for a hand-resolved conflict that keeps the lower value, or a deleted `numbers.json` (the fallback is then the highest
  present item, `05-numbering-and-index.md:36-37`). Fix: allocation also reads the highest `last` ever committed for the file
  (`git log -p --format= -- <folder>/numbers.json`, one small file, bounded by the number of creations) or the counter is made
  monotonic by a check on pull that refuses a lowered `last` and restores the maximum; and validate reports a `last` below a value in
  its own history.
- (c) **Migration seeding** (`05-numbering-and-index.md:34-37`) reads `git log --all` of the local clone: a shallow clone or a clone
  without every branch fetched seeds too low. Fix: the migration refuses to run on a shallow clone and fetches every branch first, or
  says in the dry run which history it read.

**H4. The migration unbinds every team item when `teams.json` is missing or unreadable.** `06-migration.md:27-28`: "A missing or
unreadable file means no team has an entry (every bound item is then unbound)", and the command then commits and pushes. This is the
silent empty default that `01-team-file.md:66-68` removes (finding F7), and it contradicts "migrate or fail" (R4): a JSON syntax error in
`teams.json` on migration day would strip the team from every team item of the backlog, each with a misleading record that the team "has
no entry". Fix: an unreadable or missing `teams.json` is a migration failure in the table of `06-migration.md:84-93` (exit 2, nothing
written), with the text "teams.json cannot be read (<reason>); fix it, or create it as {} to unbind every team item on purpose".

**H5. The public repository names the internal team and describes internal scripts.** Context: the CLI repository is public
(`origin` is `github.com/SmoothSDLC/smooth-backlog-cli`) and the carried-forward ruling says it shows nothing of the owner's internal
factory. The design chapters are clean (section 6), but the same plan's entry file `../../2026-11-09-team-rules-engine.md:21-22` names the
(Finding H5 named internal team and tooling names in the entry plan and reference files; fixed in 3190a7c, details removed here.)
(Finding H5 named internal team and tooling names in the entry plan and reference files; fixed in 3190a7c, details removed here.)
branch name (header and rows CON-01 to CON-22). Chapter 07 section 6 and `02-item-definition-and-json-item.md:156-158` and
`06-migration.md:59,67` also publish statistics of a real backlog (882 files, 20 files naming 7 teams, 378 archived). Fix: rename
Tasks 6 and 7 to "the owner's team (backlog repo)", move `consumers.tsv` and the real-backlog counts to the backlog repo, and keep only
"consumer rows exist in the backlog repo" here.

**H6. A `regex` in the team file can hang every agent's command.** `01-team-file.md:106-108` caps the pattern at 200 characters and the
text at 10 000 and concludes "the risk that remains is a slow command". Case A9: the valid 8-character pattern `^(a+)+$` on a 28-character
argument takes 3.7 seconds in the spike (Node's backtracking engine doubles the time per character), so a 40-character argument runs for
hours; validate reports 0 findings. Anyone who can push `teams.json` can thus stop every team command of every agent, which is the threat
`01-team-file.md:98-100` names. Fix: run `regex` with a linear-time engine (for example the `re2`-compatible subset: no backreferences,
no lookaround, checked by validate), or drop `regex` and offer `starts`/`ends`/`contains` tests; a time limit is not available for
`RegExp` in Node.

### Medium

**M1. Pop can offer a step that then fails, and keeps offering it.** `03-rule-language.md:176-178` says "pop never offers what the step
would refuse", but pop tests only the table decision (`evaluator.mjs:171`), not the coded checks and effect checks that run after it
(related items live and of the team, types, references). Case A10: pop offers `start` on item 1; the step fails because its `related`
parent is archived; nothing changes, so pop's retry (`04-team-commands.md:55-56`, at most three times) chooses the same item every time and
the whole team gets exit 1 instead of the next item. Fix: pop evaluates the full step without writing (as `query check` does) and skips
an item whose step would fail, and the retry excludes items already tried.

**M2. Arguments are text, fields are typed, and `is`/`in` compare them strictly.** `$arg.<name>` is text (`03-rule-language.md:89`),
while `items` and `number` fields hold numbers; `is` and `in` compare by JSON value (`evaluator.mjs:53-54`). Case A3:
`{"in": ["$arg.dep", "$item.deps"]}` with `--dep 2` and `deps` `[2]` never holds, and validate is silent. A rule author has no way to know
this from chapter 03, whose table says "lists and numbers compared as values". Fix: compare an `$arg` against a typed operand after
converting it to that operand's type (number for a number, item number for an item list), and state it in section 4; or add a
`{"number": v}` function and make validate warn when `$arg` meets a number or item operand.

**M3. Number parsing accepts values a team would not.** `num` is `Number(v)` (`evaluator.mjs:13`): `" "` is 0, `"0x3C"` is 60, `"-500"`
and `"60.9"` are numbers. Cases A4 to A6 on the shipped parallel example: `--estimate " "` passes `new-needs-estimate` (the `empty` test
treats only `""` as empty) and stores 0; `--estimate 60.9` passes the 60-minute cap (`>= 61` rule); `0x3C` and `-500` are stored. Fix:
the `number` type accepts only a decimal literal (`^-?\d+(\.\d+)?$`), `empty` trims text, and the example caps use `> 60` written as
`{"not": {"<=": [..., 60]}}`.

**M4. The coded check "the agent must be a person of the team" is team policy, not requested by a ruling.** `01-team-file.md:59-60`,
`04-team-commands.md:76`. R5 puts the people in the file and R1 keeps roles out of code; no ruling says an agent outside `people` may not
act. A team that wants observers or a shared bot cannot have them, and the check is expressible as an ordinary rule
(`{"id": "members-only", "step": "*", "when": {"empty": "$caller.roles"}, "deny": "..."}`). **Unrequested scope**: either ask the owner or
move it to a pattern rule. (It is reasonable machinery for typo safety, but that is a design choice, not a ruling.)

**M5. Team commands may change items without a team through a binding rule: unrequested scope with a user-visible side effect.**
`03-rule-language.md:148-151`, `04-team-commands.md:80`, example rule `adopt`. The rulings describe a team update only as "an update of
an item of team X" (`../00-owner-rulings.md:60`) and say split items are "not bound to its team"; no ruling gives a team command access to
a user item. The binding check is a second coded mechanism that exists only because of this extra capability, and its effect is that a
team agent can make a person's own item vanish from every user command (R3a) with no action of that person. **Unrequested scope**: the
simpler conforming design is a coded refusal of every team command on an item without a team, mirroring R3a; if adoption is wanted, it
is an owner decision with the scenario above.

**M6. An item of a team whose entry is later removed is stranded, and validate's fix is impossible.** After the migration, validate
reports `team <t> has no entry in teams.json (add the entry, or unbind the item with a rule of another team)` (`08-validate.md:95`). A
rule of another team cannot touch it (`04-team-commands.md:79`, case PAR-46), and user commands ignore it (R3a). The only exits are adding
the entry back or hand-editing the JSON. Fix: say so in the fix text ("add the entry back, or run backlog team migrate, which unbinds
items of teams without an entry"), that is, let `migrate` (or a dedicated `backlog team unbind-orphans`) apply the carried-forward rule
again after the first run.

**M7. Chapter 08 forbids what chapter 03 allows, and leaves `related` unchecked.** `08-validate.md:74` makes `$it` outside `every`,
`some`, `count` an error, but `03-rule-language.md:140` makes `$it` the related item inside a `related` effect. Neither chapter says the
`set`/`add`/`remove` checks of `08-validate.md:81-82` also apply inside `related`. Case A13: `related: [{"items": "$item.seq", "set":
{"nosuch": 1}}]` passes the spike's validate and crashes at run time with a TypeError (exit 1, uncaught); case A16: legitimate `$it` in
`related` is not looked at by the spike's validate at all. Fix: list `related` as a context where `$it` is valid, and apply every effect
check to `related` entries.

**M8. Deleting an item (the `delete` effect, or `backlog clean` of a user item) makes every item that names it unwritable.** The
reference check runs on every write of every `item`/`items` field (`02-item-definition-and-json-item.md:124-126`,
`evaluator.mjs:146-147`). Case A15: after deleting item 1, any step on item 2 (whose `deps` holds 1) is refused with exit 2
"field deps of item 2: no item 1", including steps that do not touch `deps`. A team item may reference a user item, which a user's
`backlog clean` then deletes. Fix: check references only for the fields the step writes, and have validate report dangling references
(it already lists them, `08-validate.md:98`); or refuse `delete` of a referenced item with a text naming the referrers.

**M9. Self-references are accepted.** The reference check exempts the item itself (`s !== it.seq`, `evaluator.mjs:147`). Case A7: on the
shipped parallel example, `backlog team new --parent 30 --after 31` where 31 is the new item's own number is allowed by `new-child` and
the child depends on itself, so `claim-dependencies` refuses it for ever. Case A8: a `parent` equal to the item's own number is
accepted. Fix: a coded type check "an item field cannot name its own item" (type machinery, like existence).

### Low

**L1. `final` is behaviour in the item definition (R7).** The key decides the index order, the team queue and `$team.items`
(`02-item-definition-and-json-item.md:110`, `05-numbering-and-index.md:43`, `:53-55`). R7 lists names, types, descriptions,
defaults and allowed values only. Either the owner accepts `final` as part of "allowed values", or it moves to the rule set (for example
`rules.final`). Related inconsistency: chapter 03 defines `$team.items` as "not archived" (`03-rule-language.md:94`) and chapter 05 the
queue as "not final" (`05-numbering-and-index.md:53-55`); the spike's pop filters only archived (`evaluator.mjs:167`). Define "open"
once.

**L2. Shadowing is detected only syntactically** (`03-rule-language.md:47-51`). Case A11: an earlier `{"in": ["$item.status", ["open",
"done"]]}` covers a later `{"is": ["$item.status", "open"]}`; validate reports nothing. Stated as a limit; add the `is`-inside-`in` and
key-order-insensitive comparisons, which cover most real cases cheaply.

**L3. References under a valid root are not checked.** Case A12: `$session.brnach` is valid to chapter 08 (only roots are checked,
`08-validate.md:77`), reads as empty, and silently switches off the `scope-branch` guard. `$caller.<anything>` reads as the caller
(`evaluator.mjs:21`). Fix: a closed list of names per root (`$session.id|repository|branch|commit`, `$caller`, `$caller.roles`,
`$team.name|items`, `$now`).

**L4. No syntax for field, step and argument names.** Chapter 08 checks team names and person names but not field names (a field named
`a.b` breaks the reference syntax; `f2` is not filled in a placeholder because the placeholder pattern is `[a-z_.]+`, case A20), and the
check that a step name does not look like a number or a flag (`decisions.md:60`) is not in chapter 08. Fix: one name pattern for fields,
steps and arguments, and `help` and `version` added to the reserved argument names.

**L5. A boolean field turns any typo into false** (`02-item-definition-and-json-item.md:122`; case A14: `--v ture` stores false).
Refuse anything other than `true` and `false`.

**L6. The spike reads a missing field as undefined, not the default (decision D-32).** Case A17: an item without `rounds` never matches
`{"is": ["$item.rounds", 0]}`. The test harness fills defaults (`evaluator.test.mjs:13-16`), so the 191 cases do not see it. Spike only;
the implementation must apply D-32 in `get`.

**L7. Language constructs without a case** (R9). No example or case uses the effects `delete` and `branch`, the unbinding effect
`"team": ""`, or the function `length` (grep counts in section 5). Add one case each.

**L8. Coverage text names a command that does not exist.** `coverage.tsv:76,81,82` (group DI-FIELDS) say "backlog team query definition";
chapter 04 has `backlog team query rules`.

**L9. The spike's `create` crashes on a large folder** (case A18: 200 000 items, `Math.max(...items)` exceeds the call stack). Spike only,
but R12 says tens of thousands of items are normal; the implementation should use a loop. Related cost note: a `count` over `$team.items`
inside a pop entry's step is evaluated for every queue item, so pop is quadratic in the team's open items; `related` over `$team.items`
with a `count` in its values is also quadratic and is not caught by the one-hop rule.

## 3. The coded checks beyond the rulings (task item 3)

| coded check | where | justified by a ruling? |
|---|---|---|
| the agent must be a key of `people` | `01-team-file.md:59-60` | **No — unrequested scope** (M4); expressible as a rule |
| a teamless item is changed only through a rule that binds it | `03-rule-language.md:148-151` | **No — unrequested scope** (M5); exists only because team commands were given access to teamless items |
| related items must be live items of the command's team | `03-rule-language.md:140` | Partly: archived items take no rule (carried forward); the same-team part follows from the other-team refusal below |
| an item of another team is refused | `04-team-commands.md:79` | Not stated by a ruling, but the only reading of "an update of an item of team X"; acceptable |
| a `person` field takes only a name of `people` | `02-item-definition-and-json-item.md:124` | Type machinery; not requested; low impact |
| every definition declares `status` with `values` and `final` | `02-item-definition-and-json-item.md:112-114` | `status` yes (R13 index carries status); `final` no (L1) |
| a step accepts only the `$arg` names its rules read | `03-rule-language.md:97-100` | Machinery chosen with decision 2; acceptable |
| default refusal when no rule matches | `03-rule-language.md:52-54` | Yes, R10 asks the design to define the default |
| `backlog update --seq` refused unless above `last` | `05-numbering-and-index.md:30-32` | Yes, R12 |
| pop retries three times; `query plan` gives an item to one person only | `04-team-commands.md:55-60` | Machinery; acceptable (but see M1) |

## 4. Adversarial cases (task item 4)

The spike's own suite was run first: `cd design/evaluator-spike && node --test` gives `# tests 192`, `# pass 192`, `# fail 0`
(Node v22.22.1). The cases below were written by this reviewer in a scratch script outside the worktree that imports
`evaluator-spike/evaluator.mjs` unchanged; "validate" is the spike's `validate()` finding count. Each row says what should happen.

| id | case | result | should be |
|---|---|---|---|
| A1 | condition `{"is": [...], "in": ["lead", "$caller.roles"]}`; member `b` closes | allowed by `guard`; validate 0 | validate error; refusal |
| A2 | last rule with `"wehn"` instead of `"when"`; member `b` closes | allowed by `close`; validate 0 | validate error |
| A3 | `{"in": ["$arg.dep", "$item.deps"]}`, `--dep 2`, deps `[2]` | default refusal (exit 1) | allowed |
| A4 | parallel `team new --estimate " "` | allowed by `new`, estimate 0 | refused by `new-needs-estimate` |
| A5 | parallel `team new --estimate 60.9` | allowed, estimate 60.9 | refused by the 60-minute cap |
| A6 | parallel `team new --estimate 0x3C` / `-500` | stored 60 / -500 | exit 2 (not a number) / a team rule may refuse |
| A7 | parallel `team new --parent 30 --after 31`, 31 = own number | allowed by `new-child`, depends_on `[31]` | refused (self-reference) |
| A8 | `set parent` to the item's own number | stored 5 | refused |
| A9 | `regex ^(a+)+$` on 27 × `a` + `!` | 3 685 ms; validate 0 | linear time, or pattern refused |
| A10 | pop with a step whose `related` parent is archived | pop offers item 1; the step then fails exit 1 | pop skips item 1 |
| A11 | `in [open, done]` above `is open` for the same step | validate 0 | shadowing error |
| A12 | `scope-branch` guard written with `$session.brnach` | item on another branch stepped; validate 0 | validate error |
| A13 | `related` sets an undeclared field | validate 0; run time TypeError (uncaught) | validate error |
| A14 | boolean field set from `--v ture` | stored false | exit 2 |
| A15 | delete item 1, then any step on item 2 whose deps hold 1 | exit 2 "no item 1" on an unrelated step | step allowed; validate reports the dangling reference |
| A16 | `$it` inside `related` | spike validate 0; chapter 08 text says error | one consistent answer (allowed) |
| A17 | item lacking `rounds`, rule `is [$item.rounds, 0]` | default refusal | allowed (D-32 default 0) |
| A18 | `create` with 200 000 items present | RangeError (call stack) | number 200 001 |
| A19 | parallel `team new --parent 30`, 30 of another team in `splitting` | the guard reads the other team's item, then the related effect refuses (exit 1) | acceptable; a clearer refusal would come from the coded other-team check before the table |
| A20 | deny text `{$item.f2}` | printed literally | filled, or `f2` refused as a field name |

Git reproductions for H3 (scratch bare repository and two clones, same tool):
- identical counter change: `git pull --rebase` exit 0, log `B101, clean 101, A101, base`, folder holds `100-base.json 101-beta.json`,
  `numbers.json` `{"last": 101}`.
- revert: after `git revert` of the commit creating `102-gamma.json`, `numbers.json` is `{"last": 101}` and only `100-base.json` remains.

## 5. Coverage recount (task item 6)

`node coverage/make-coverage.mjs` (run from `design/`) exits 0 and regenerates `coverage.tsv` and `coverage-counts.tsv` byte-identical to the
committed files (`diff` empty for both). Independent count of the inputs:

| source | rows counted | unique ids | rows in coverage.tsv |
|---|---|---|---|
| `../reference/inventory.tsv` | 1033 | 1033 | 1033 |
| `../reference/tests.tsv` | 819 | 819 | 819 |
| `../reference/consumers.tsv` | 22 | 22 | 22 |
| `../reference/gaps.tsv` | 47 | 47 | 47 |
| `../reference/08-owner-questions.md` part 2 (Q-04 to Q-20) | 17 | 17 | 17 |
| `../reference/08-owner-questions.md` part 1 (D-17 to D-33) | 17 | 17 | 17 |
| `../reference/13-format-gaps.md` (G headings) | 17 | 17 | 17 |
| `../reference/01-inventory.md` (findings) | 14 | 14 | 14 |
| total | 1986 | | 1986 |

Every reference id of the four TSV files appears exactly once in `coverage.tsv` (`comm -3` empty), no `source|id` pair is doubled, and
the state totals are BAKE-IN 1412, LAZY-LOAD 245, SKIP 281, DEFERRED-WITH-EXPLICIT-BLOCKER 48, matching `coverage-counts.tsv`. The counts
reconcile. Construct usage counts behind L7 (`grep -c` over `examples/*.json` / `rule-cases.json`): `"length"` 0/0, `"delete"` 0/0,
a `"branch":` effect 0 (the one hit in the cases is item data), the unbinding effect `"team": ""` 0 in examples (the three hits in the
cases are item data).

## 6. Public-repository grep (task item 7)





## 7. Not checked

The BDD-only scenarios of chapters 05 and 06 (files and git) beyond the two reproductions above; the content of `rule-cases.json`
verification entries against `src/` line by line; chapter 07 against the real skills (they live in the backlog repo).
