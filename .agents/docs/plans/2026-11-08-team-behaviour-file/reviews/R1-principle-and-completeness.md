# R1 — Principle conformance and inventory completeness

Reviewer: R1 (lens: gaps against the owner principle of 2026-11-08 and completeness of the enforcement inventory).
Spec reviewed: this folder at plans commit `09ad81d96` (00-README .. 09, `inventory.tsv`, `07-traceability.tsv`, `schema/`, `templates/`).
Code reviewed: smooth-backlog-cli `174c76d`, read in a detached worktree (`<local path>`, removed after the review).
Topology consumers: `the topology repository` on `pr2/topology-after-pr1` (read-only `git grep`).
Owner rulings read: `the owner decision log` (AG, AJ, AM, AO in the plans README, AP, AR, AS–AV) and the plans README section
"Owner principle 2026-11-08".

Nothing in the spec was edited. Each finding states the location, what is wrong, a severity and the exact change that fixes it.

## Sampling method (part 1 of the brief)

Besides reading every hand-written section (§1–§9 of `03-spec.md`, 06, 08, 09) and the requirement texts, I grepped the code at
`174c76d` for enforcement-shaped lines that `tools/scan.py` cannot see: identifier-based field reads (`fm.claimed_by`, `fm.reviewer`,
`fm.refiner`, `fm.work_commit`, `fm.reviews`, `fm.handoffs`, `fm.completed`, `fm.severity`, `owned_since`), calls of the status helpers
(`isOpen`, `isFinished`, `isUnstarted`, `normalise`, `workflowOpen`, `lifted`, `stageOfStatus`), the injected team hooks (`team?.x`,
`team ? … :`, `if (team)`, `seam.x`), every `process.env` read, exit codes, numeric caps, default values and the `bin/` bootstrap. Every
hit was compared with the `site` column of `inventory.tsv`. Result: **104 such sites in `src/shared/` + `bin/`, 73 of them absent
from the inventory** (dependencies 2, fields 1, frontmatter 7, index 5, move 1, new 11, plain-step 1, query 14, repair 1, router 1,
sequence 1, status 9, store 3, update 16), plus 10 relevant absent sites in `src/team/`, 7 environment/bootstrap sites and 2 topology
consumers. More than 60 sampled sites are cited by file:line in the findings below (R1-001, R1-002, R1-004, R1-007, R1-015, R1-016, R1-019,
R1-024..R1-033); 35 inventory rows are reported as wrongly classified (R1-004).

## Severity counts

BLOCKER 3 · MAJOR 16 · MINOR 14 (33 findings).

---

### R1-001 | BLOCKER | `03-spec.md` §7, REQ-901, REQ-902, REQ-905; `06` PH-9/PH-10; code `src/shared/update.js`, `new.js`, `query.js`, `router.js`, `status.js`, `store.js`, `wip-limits.js`, `seam.js`

**What is wrong.** At `174c76d` the team commands do not have their own write path: `backlog team update`, `team new` and
`team query` call the plain modules and pass them a `team` hook object, and `backlog team` installs callbacks into
`src/shared/seam.js`. The plain modules therefore host the whole team pipeline. None of these call sites is in the inventory (only
`seam.js:8`, PC-SEAM, and a handful of lines that happen to contain a trigger word), and the spec never says where the team write path
lives after the change. §7 assumes the only team-aware call of the plain tree is `binding.check`, and the guard of REQ-905 only checks
imports and string literals, so an injected hook object passes it. Absent sites (all at `174c76d`):

- `src/shared/update.js:57` (team flags, choices and verdicts merged into the plain parser), `:76` (verdict synonyms), `:199`, `:226`
  (`team?.refuseOutside`), `:255` (`team?.begin`), `:278` (`team.fieldsAfter`), `:280` (`team ? team.step(...) : plainStep(...)`),
  `:287` (`team.after`), `:336` (`team?.notice`), `:338` (`team?.ender`), `:343` (prints "the team lead re-evaluates the order").
- `src/shared/new.js:104` and `:142` (`parseArgs(argv, team?.options)`), `:109` (`TEAM_QUESTIONS` in plain `new --ask`), `:128`
  (`seam.scope()`), `:146` (`team?.begin`), `:162` (`team?.outside`), `:187` (`team?.mark`, writes the refiner key), `:189`
  (`team?.reviewRefs`), `:191` (writes `claimed_by`, `claimed_at`, `review_state: 'none'`, `reviewer` on every item).
- `src/shared/query.js:28` (team flags in the plain parser), `:146` (`team?.early`), `:154` (`team?.afterPull`, the `--wip` view),
  `:163` (`seam.scope().branch`), `:186` (`team?.view`), `:236` and `:247` (`team.missing`, the S92 key).
- `src/shared/router.js:25` (team help routing), `src/shared/status.js:139` (`seam.entry` decides the review rule of every read item),
  `src/shared/store.js:320` (`seam.inScope` limits the index reorder, see R1-007), `src/shared/wip-limits.js:28` (`seam.alsoActive`).

**Change to the spec.**
1. Add to §2 a decision **D-17 "Team commands own their path"**: `backlog team update|new|query|pop` are implemented in `src/engine/`
   (or `src/team/`) end to end. They call only storage primitives (item codec, index, lock, publication, numbering) exported by a
   module that has no item semantics. `src/shared/update.js`, `new.js`, `query.js` and `router.js` take no `team` parameter, and
   `src/shared/seam.js` and every consumer of it are deleted.
2. Add an inventory group **PC-HOOKS** (CODE, plain-tree flag set, terminal DELETED, REQ-901/REQ-902/D-17, phase PH-9) holding the
   sites listed above, and regenerate `07-traceability.tsv`.
3. REQ-905: add a check *"No file under `src/shared/` declares a parameter, property or variable named `team` or `seam`, and none
   imports `seam.js`"*, plus a mutation test that adds `team?.step(...)` to a copy of `update.js` and expects a failure.
4. `06` PH-9: add the files above to Scope/Files, and add the step "team update/new/query/pop switched to the engine path; shared
   modules lose the hook parameter".

### R1-002 | BLOCKER | `01-inventory.md` §1–§2, §4; `tools/scan.py`; `07-traceability.tsv`

**What is wrong.** The inventory claims to cover "where every rule lives today" and to count 105 PLAIN-TREE-ENFORCES-FLOW sites. Its
triggers only match string literals of the shipped vocabulary, a fixed list of function names and `process.env.(TEAM_|BACKLOG_)`.
They miss (a) field reads by identifier (`fm.claimed_by`, `fm.reviewer`, `fm.refiner`, `fm.work_commit`, `fm.reviews`, `fm.handoffs`,
`fm.completed`, `fm.severity`, `owned_since`); (b) calls of the status helpers (`isOpen`, `isFinished`, `isUnstarted`, `normalise`,
`workflowOpen`, `lifted`); (c) the hook seams of R1-001; (d) every file outside `src/` (`bin/backlog.js` reads `BACKLOG_RUN_HOOK` and
prints a JSON error object, see R1-024 and R1-025); and (e) the second rule on a line that already matched (for example
`new.js:183` holds both the team's initial word `'new'` and the plain default `'pending'`, but has one row: PC-DEFAULT,
OWNER-QUESTION). Sampled plain-tree flow sites absent from the inventory, beyond R1-001:

- `src/shared/update.js:229` `normalise(a.status)`: plain `update --status done` stores `closed`, and a known word typed in another
  case or spelling is rewritten. F9 says plain update stores the word as typed; that holds only for words outside the shipped
  vocabulary.
- `update.js:298` stamps `completed`; `:325`–`:332` move the item into or out of the queue by `isOpen`.
- `query.js:193` (`list branches` open/done), `:277` (finished-last sort), `:280` (`isOpen` for gone branches), `:79`, `:214`, `:305`
  (critical markers), `:293` (plain `list --json` emits `claimed_by` and the derived `review_state`).
- `index.js:21`, `:58`, `:214` (queue = open items first, by `workflowOpen`), `:56` (default priority 50).
- `move.js:90` (`--all-open-of-branch` uses `isOpen`), `sequence.js:45` (import moves `isOpen` items only).
- `dependencies.js:92` (the actual finished filter of `undoneDependencies`; only `:80`, `:85` and `:90` have rows).
- `status.js:24`, `:25` (`isFinished`, `isOpen`), `:58` (eligibility: `rule.stage === 'peer'` and `seam.isMember`), `:63`–`:67`
  (`passCount`: the `reviews` "<reviewer> <commit>" format and `work_commit`).
- `plain-step.js:50` (literal `--by owner`), `:52` (closer falls back to `actor()`).
- `frontmatter.js:271`–`:277`, `:285`–`:287` (holder semantics `claimed_by` ↔ `owner`/`owned_since`, see R1-015).
- `fields.js:21`, `:24`, `:28` (the plain field table describes team semantics, see R1-030).

So the 105-row count, the CODE total of 448 and the claim "every PLAIN-TREE-ENFORCES-FLOW row has its phase" are all understated.

**Change to the spec.** In `tools/scan.py` add the triggers `FIELD` (regex
`\bfm\.(claimed_by|reviewer|refiner|review_state|stage|work_commit|reviews|review_history|handoffs|completed|severity|wait_on|owned_since|chunk)\b|owned_since|'claimed_by'`),
`STATUSFN` (`\b(isOpen|isFinished|isUnstarted|normalise|workflowOpen|stageOfStatus|lifted|statusOf)\(`), `SEAM`
(`team\?\.|team \?|\bif \(team\)|seam\.`) and `ENVANY` (`process\.env\.[A-Za-z_]+`); scan `bin/` as well; and emit one row per rule,
not per line (split a line that matches two groups). Re-run `tools/run.sh`, regenerate `inventory.tsv`, §2 to §4 of `01-inventory.md`
and `07-traceability.tsv`, and correct F9 to say: "plain `update --status` stores a word outside the shipped vocabulary as typed, and
canonicalises the words of the shipped vocabulary (`done` becomes `closed`)".

### R1-003 | BLOCKER | `08-owner-questions.md` Q-01, Q-02, Q-03 and the "Inconsistency" section; REQ-908, REQ-909, REQ-910; `06` PH-6, PH-7, PH-10

**What is wrong.** The principle is binding and later than AM. It already answers part of these questions ("plain commands enforce
nothing about flow, status words or team behaviour; the user manages plain items freely"). README rule (5) asks reviewers to flag owner
questions that the principle already answers. Offering the owner options that contradict the principle leaves plain-tree enforcement
possible:
- Q-02 option C / REQ-909 option C keep the plain claim/release/close refusals.
- REQ-909 option A still refuses (`close` needs `--summary`) and still writes status words ("the convention's in-progress-like word",
  "the done word").
- Q-03 option B / REQ-910 option B keep plain limits and the plain dependency gate (PC-WIP, PC-DEPGATE, and the plain claim recheck
  `plain-step.js:17`–`:21`).
- Q-01 bundles display conventions (what `list open` shows, queue order) with enforcement: `archive` refuses a non-`closed` item
  without `--force` (`archive.js:100`), `normalise` rewrites typed words (`update.js:229`, `new.js:183`), and `done` writes
  `closed`.

**Change to the spec.**
1. Delete Q-02 option C, Q-03 option B and REQ-909/REQ-910 option B and C. State Q-03 as decided by the principle (new decision
   D-18: "plain commands apply no limit and no dependency gate; `wip-limits.json` is migrated into team entries"), and move REQ-910
   option A into an unconditional requirement.
2. Rewrite REQ-909 option A as "plain `--claim <who>` writes `claimed_by`/`claimed_at`, `--release` clears them, `--close` writes the
   `--summary` text as body record if given; none of them refuses for any reason other than syntax, and none writes `status`".
   Option B (remove the flags) stays as the only alternative.
3. Split Q-01 into Q-01a (display only: which words `list new|open|done`, `next`, `archive done` and the open-first order treat as
   open or finished) and a decided rule D-19: "plain `archive` never refuses because of the status; `update --status` and
   `new --status` store the word exactly as typed (no `normalise`); `done` is either removed or writes the word Q-01a names".
   REQ-908 acceptance gains: "`update 1 --status Done` stores `Done`; `archive` of an item with any word succeeds without `--force`".
4. Rewrite the "Inconsistency" section of 08 to say AM's dependency data and display stay, and that the principle settles the gate and
   the limits.

### R1-004 | MAJOR | `inventory.tsv` / `07-traceability.tsv` part A — rows labelled STAYS or DATA-INTEGRITY (or given a team key) that are flow, team or legacy rules (part 2 of the brief)

**What is wrong.** Each of these rows is classified as machinery or storage, but the line enforces, defaults or special-cases a status
word, a role, a team scope or legacy data:

| row | site | labelled | what the line really does | correct state |
|---|---|---|---|---|
| INV-036 | `shared/archive.js:45` | DI-SYNTAX STAYS | plain `archive` takes its repository from the team session scope (`seam.scope()`) | PC-HOOKS DELETED (R1-001) |
| INV-037 | `shared/archive.js:81` | DI-SYNTAX STAYS | `archive done` = every *finished* item (plain convention) | PC-FINISHED, Q-01a |
| INV-046 | `shared/archive.js:114` | DI-ARCHIVE STAYS | writes the status word `archived` into every item | R1-005 |
| INV-060 | `shared/dependencies.js:45` | DI-REF STAYS | default status `'pending'` for a foreign item | PC-DEFAULT, Q-01a |
| INV-134 | `shared/new.js:192` | CFG-OWNER STAYS | plain `new` branches on `fm.team`, and REQ-902 lists CFG-OWNER under "Replaces" while the row says STAYS | PC-HOOKS; REQ-902: plain new always writes `owner` |
| INV-164 | `shared/query.js:36` | DI-SYNTAX STAYS | team choices validated in the plain parser | PC-HOOKS DELETED |
| INV-170 | `shared/query.js:145` | DI-SYNTAX STAYS | `parse(argv, team)` | PC-HOOKS DELETED |
| INV-226 | `shared/seen.js:156` | DI-STALE STAYS | "held" = `claimed_by`, `reviewer` or `refiner` (team role fields) | R1-019 |
| INV-233 | `shared/sequence.js:47` | DI-SYNTAX STAYS | "no open items": plain convention | PC-FINISHED, Q-01a |
| INV-303 | `shared/store.js:220` | DI-STORE STAYS | `LEGACY_KEYS = ['stage','review_state']`: legacy suppression | ST-LEGACY DELETED (REQ-011) |
| INV-355 | `shared/update.js:222` | DI-SYNTAX STAYS | plain claim publication recheck, keyed on `'in progress'`, plus the `team.claims` hook | PC-STEP / PC-DEPGATE (R1-003) + PC-HOOKS |
| INV-367 | `shared/update.js:256` | DI-SYNTAX STAYS | `team.fieldsBefore` returns the team's edit refusals | RF-EDITS MOVED-TO-FILE (`edit_rules`) + PC-HOOKS |
| INV-377 | `shared/update.js:297` | DI-SYNTAX STAYS | `completing = a.status === 'closed' \|\| event === 'closed'`: completion stamp and re-densify by a status word | PC-FINISHED, Q-01a; team side R1-010 |
| INV-411, INV-420, INV-774 | `team/cli.js:148`, `:185`, `team/team.js:245` | DI-DEFINE-INUSE STAYS | "open items" computed with the shipped vocabulary (`isOpenWord`) | keep the rule, but REQ-015 must say "open = status not in the item's definition's `finished`" |
| INV-414, INV-419 | `team/cli.js:155`, `:183` | DI-DEFINE-IO / DI-DEFINE-INUSE STAYS | default workflow `'team'` when an entry names none | DELETED: D-01 and REQ-010 make `workflow` required |
| INV-457, INV-462 | `team/handoff.js:102`, `:137` | DI-HANDOFF STAYS | default status `'pending'`; a record's review field defaults to `'pending'` | status default DELETED (definition `initial`); record default listed in §8 or made a required argument |
| INV-598 | `team/lifecycle.js:450` | DI-SYNTAX STAYS | "one team-work step at a time": the `one_step` refusal and its text are in the file (REQ-110) | MOVED-TO-FILE `refusals.one_step` + `combinable` |
| INV-621, INV-622 | `team/lifecycle.js:541`, `:542` | DI-MACHINE STAYS | accept/reject-handoff pass `lead: teamLead()`: the lead-only rule | HO-RECEIPT MOVED-TO-FILE (`steps.accept-handoff.by`) |
| INV-631, INV-662 | `team/pop.js:25`, `team/queue.js:24` | DI-SYNTAX STAYS | declare the `--lead` option that REQ-206 removes | ENV-LEAD DELETED |
| INV-640 | `team/pop.js:60` | DI-SYNTAX STAYS | `lead = agent === teamLead()` decides the pop branch | Q-LEADWORK MOVED-TO-FILE (`queue.roles`) |
| INV-641, INV-721, INV-724 | `team/pop.js:62`, `team/queue.js:338`, `:348` | DI-SYNTAX STAYS | repository/branch taken from `TEAM_REPOSITORY`/`TEAM_BRANCH` | ENV-INPUT, Q-04 |
| INV-644 | `team/pop.js:109` | DI-CONCURRENCY STAYS | maps action names `claim/review/refine` to fields `claimed_by/reviewer/refiner` | MOVED-TO-FILE: offer `holder_field` (new key, see R1-010) |
| INV-785 | `team/update.js:48` | DI-MACHINE STAYS | `begin` computes `missingFields` and the legacy `stage` | RF-COMPLETE + ST-LEGACY |
| INV-800 | `team/views.js:19` | DI-MACHINE STAYS | team view JSON keys include the deleted `review_state` | R1-016 |
| INV-140 | `shared/plain-step.js:19` | STEP-RECHECK MOVED-TO-FILE `steps.claim.recheck_at_publication` | this is the *plain* claim's recheck, not the team step | PC-DEPGATE/PC-WIP, decided by D-18 (R1-003) |
| INV-434 | `team/handoff-commands.js:43` | HO-RECORD MOVED-TO-FILE | the line reads `BACKLOG_SESSION` into the record's session field | ENV-INPUT (Q-04) + DI-HANDOFF-FORMAT |
| INV-629 | `team/pop.js:20` | DI-SYNTAX STAYS | `BACKLOG_TEST_SELF` test seam in production code | R1-025 |

**Change to the spec.** Reclassify these 35 rows as in the last column (add the groups PC-HOOKS and, for D-18/D-19, the new decisions),
regenerate `07-traceability.tsv` part A and the counts of `01-inventory.md` §2, and add one sentence to `01-inventory.md` §1.3:
"a row that reads, writes or compares a status word, a role field or a team scope is never DATA-INTEGRITY, whatever its trigger".

### R1-005 | MAJOR | `03-spec.md` §4.1 `finished` (V-03), REQ-101, §8 row "reserved word `archived`"; code `shared/archive.js:114`

**What is wrong.** Plain `archive` writes `status: 'archived'` into every item it moves (a status word written by the plain tree, for
plain and bound items alike). V-03 then forces every team definition to list `archived` among its finished words "because backlog
archive writes it". That is a behaviour pattern the CLI imposes on every definition. The archive folder already marks an archived item
(`archive/` path; the readers already have the path).

**Change to the spec.** Replace the §8 row by "the archive folder `archive/` and read-only archived items", delete V-03 and the
sentence of REQ-101 about `archived`, and add to REQ-101: "`backlog archive` moves the file and does not change `status`; readers
recognise an archived item by its path only". If the owner wants a stamp, add a definition key `archive.sets` (value sources, applied
to bound items through the port) and leave plain items unchanged. Fixture: a definition whose `finished` is `["shipped"]` validates
and archives.

### R1-006 | MAJOR | REQ-927, REQ-921, §5.2 `dependencies_finished`, §7, D-11; code `shared/query.js:209`, `shared/dependencies.js:85`, `:90`, `:92`

**What is wrong.** REQ-927 (`list blocked`) and `next`'s waits judge a bound target "by the target's definition". That makes a plain
command read and evaluate a team definition, but §7/D-11 allow the plain tree only `binding.check(operation, items) → allow|refuse`.
REQ-921 (`list branches`) counts bound items by the plain convention only, so the two plain commands disagree about the same item.
§5.2 makes the team predicate read the plain convention for unbound targets, a dependency in the other direction that §3 does not
list as an input file.

**Change to the spec.** Pick one rule and write it in §7: either (a) the port gets a second documented function
`binding.finished(item) → true|false|null` (null for unbound items, which then use Q-01a), used by every plain reader that needs
finished (`list`, `next`, `list blocked`, `list branches`, import, re-densify), and REQ-921/REQ-927 say so; or (b) plain readers never
evaluate a definition and show a bound item's dependency as "team item: see `backlog team query --blocked`". Add `.backlog/config.json`
(`plain` key) to the input table of §3 as an input of the engine when Q-01a = A.

### R1-007 | MAJOR | no key in §4; code `shared/store.js:317`–`:320` (`inScope = i => seam.inScope(i.fm)`), `team/team.js:184`

**What is wrong.** When a team session reorders the queue (`--priority`, `--replan`, re-densify), only the team's own items move and
the other items keep their places. This is a team ordering rule, absent from the inventory and from the definition schema.

**Change to the spec.** Add the key `queue.reorder_scope`: `all` | `command_team` (default `all`; template `command_team` = today) to
§4.7 with type, default, validation and effect ("a rank change and a re-densify by a `backlog team` command re-order only items bound
to the command team; other items keep their positions"). Add a requirement REQ-807 with a passing and an overriding scenario, and an
inventory row (group Q-REORDER, CODE, MOVED-TO-FILE).

### R1-008 | MAJOR | §4.7 `queue.roles` ("lead before member when both"), REQ-802, §4.7 `queue.plan.passes[].assign` (`holder`, `lead`, `idle_member_not_author`, `least_loaded_free_member`), REQ-804

**What is wrong.** The generic engine names the roles `lead`, `member` and `author` and fixes their precedence. A definition whose
roles are `captain`/`crew`, or which has a third role that pops, cannot be expressed. This is a behaviour pattern in code, contrary to
"the CLI hard-codes no behaviour pattern".

**Change to the spec.** Replace "lead before member when both" with a required key `queue.role_order: [role, ...]` (V-09; an actor
holding several roles is served by the first listed role that has an offer). Replace the `assign` enum by an object
`{pick: "holder" | "role" | "first_idle" | "least_loaded", role?: <role>, exclude_role?: <role>, within_limits?: [levels]}`
(V-09 for the roles). The template writes today's behaviour as `{"pick":"role","role":"lead"}`,
`{"pick":"first_idle","role":"member","exclude_role":"author"}` and
`{"pick":"least_loaded","role":"member","within_limits":["team","member"]}`. Update REQ-802/REQ-804 acceptance with one fixture whose
roles are not called lead/member.

### R1-009 | MAJOR | §4.8 team entry keys, §5.4 role sources (`entry: lead` only, `entry_list: members|review_only|external_reviewers`, `entry_rule_teams: refinement_review`), REQ-209, E-02

**What is wrong.** The team entry has a fixed shape: one lead, a member list, a review-only subset, external reviewers, refinement
review rules. The role sources can only point at these keys, so a team with, for example, a `qa` list needs a CLI change. E-02 ("the
lead is not one of the members", `team.js:201` today) is a rule about team composition enforced by the validator, not by the
definition.

**Change to the spec.** Make the entry generic: `people: {<key>: name}`, `lists: {<key>: [names]}`, `rules: {<key>: [{team?, stage?,
count}]}` beside `workflow`, `review`, `limits` and `chunk_scope`. The role sources become `entry_person: <key>`,
`entry_list: <key>`, `entry_rule_teams: <key>`, and V-09 checks that the keys a definition names exist in every entry that uses it
(new E-rule E-09 `teams.<t>: workflow <w> needs entry key <k>`). Move E-02 into the definition as `entry_constraints`, for example
`[{"disjoint":["lead","members"]}]` (template = today's rule), or drop it. The migration maps today's keys to `people.lead`,
`lists.members`, `lists.review_only`, `lists.external_reviewers`, `rules.refinement_review`.

### R1-010 | MAJOR | §5.1, §5.2, §5.3, §6 step 14, §4.2 `scope.foreign_items`, REQ-114 — fixed field names inside the primitives

**What is wrong.** The catalogue primitives read and write fixed item fields, so the field model of today's team is code:
- `review_passes_met`, `head_unless_covered`: `reviews` ("<reviewer> <commit>") and `work_commit`.
- `no_later_own_work`: `work_commit`.
- `last_review_rejected`: `review_history` and the verdict `reject`.
- `review.reject_clears_passes`: `reviews` and the verdict `reject`.
- `dependents_handoffs_accepted`: writes `handoffs: none`.
- `effect: handoff_*`: `handoffs`.
- §6 step 14: stamps `completed` when the new status is finished.
- REQ-114: `ended_sessions`.
- `scope.foreign_items: chunk_only`: `field_true: chunk`.
- §5.2 `stale: {field}` is the only primitive that takes its field as a parameter.

**Change to the spec.** Give every such primitive explicit parameters with no default:
- `review_passes_met: {passes_field, commit_field}`, `head_unless_covered: {passes_field, commit_field}`,
  `no_later_own_work: {commit_field, subject_item_pattern}`;
- `last_review_rejected: {history_field, verdict}`; `review.reject_clears: {verdict, field}`;
- `dependents_handoffs_accepted: {records_field, none_value}`; `effect` gets `records_field`;
- `session.block_after_end: {field}`; `scope.foreign_items: {when: <predicate>}`.

The template supplies today's names. Replace §6 step 14's `completed` stamp by a definition key `on_finish.sets` (value sources;
template `{"completed": "now_if_empty"}`, which needs a new value source `now_if_empty`). List the record *format* (JSON strings,
digest) as the only fixed part in §8.

### R1-011 | MAJOR | §4.6 `notice: close_now_or_next`, §4.3 `create.ask[].flag` enum (`review-refs` only), §5.5 qualifier `matches=estimate_or_dod`, §5.1 fixed `<reviewers_text>` values, `scope.foreign_items` enum, `queue…when_team: no_other_open_items`

**What is wrong.** These are single-purpose tokens that encode one team's pattern in the engine:
- `close_now_or_next` computes four fixed instruction keys from built-in logic.
- `create.ask` can only ask for review documents.
- `matches=estimate_or_dod` names a completeness rule called `estimate_min` and the section test.
- `<reviewers_text>` produces fixed English phrases ("members of team <x>", "members of the team", "its <role> reviewers") that are
  not in `refusals`.
- `when_team: no_other_open_items` is a one-off predicate.

**Change to the spec.**
- Replace `notice` by `notice_rules: [{when, instruction}]` using the existing predicates (template reproduces the four cases).
- Widen `create.ask[].flag` to any field flag of §5.5 plus `review-refs`, with a `field` target.
- Replace `matches=estimate_or_dod` by `matches_rule=<completeness rule name>[,<name>]`.
- Make `<reviewers_text>` a template text with keys `reviewers_rule_team`, `reviewers_members`, `reviewers_role` in `refusals`.
- Express `when_team` as a predicate over the team (`team_count: {select, at_most}`).

### R1-012 | MAJOR | V-27, §6 step 9, D-03, REQ-110, REQ-113

**What is wrong.** The engine special-cases step names:
- only `wip-override` and `set-team` may be `combinable`, and they run in the fixed order "wip-override, then set-team";
- only `set-team` may `bind`;
- only the three hand-off steps may have an `effect`;
- `set-status` exists only as the `--status` flag.

A definition cannot, for example, make `--note` combinable or let `claim` bind an unbound item.

**Change to the spec.** Delete the step-name restrictions of V-27 (keep only "`binds` steps must define `to`"), make the order of
combinable steps the order of `steps` in the file (or a key `combinable_order: [steps]`), and state in D-03 that the step catalogue
fixes flag *spelling* only, never which step may carry which key.

### R1-013 | MAJOR | `05-tdd-plan.md` §5 guards 1 and 5, REQ-905, REQ-904

**What is wrong.**
- Guard 5 ("every string literal of `src/engine/` … allow-list: none") cannot pass with the spec's own catalogue. The engine must
  contain the role-shaped and field-shaped literals of R1-008..R1-011 unless they are parameterised, plus `archived` (§8) and the edge
  states `accepted|rejected|legacy|…`.
- Guard 1 checks string literals only, so identifier reads (`fm.claimed_by`, `fm.reviewer`, `fm.refiner` in `seen.js:156`,
  `plain-step.js`, `frontmatter.js`) and hook parameters (R1-001) pass it.
- Its allow-list grants `owner` in `new.js` only, while `plain-step.js:50` compares `a.by === 'owner'`.

**Change to the spec.** Guard 5 gets an explicit allow-list equal to §8 (one entry per literal with its §8 row), generated from §8 so
the two cannot drift. Guard 1 also scans identifiers: the word list applies to property names in `x.<word>` and `x['<word>']`
expressions. Add the hook check of R1-001 item 3. Add `plain-step.js` to the allow-list only if Q-02 keeps an owner close; otherwise
the literal goes.

### R1-014 | MAJOR | `03-spec.md` §8 (hard-code allow-list) vs. what the spec itself fixes

**What is wrong.** §8 says "everything else comes from the files", but the spec fixes behaviour in code that §8 does not list:
- the first five slugs then "and <n> more" (§7);
- up to 8 holders then ", ..." (§5.1 `within_limits`);
- the English `<reviewers_text>` (R1-011);
- the item field `team` as the binding marker (§1);
- the `completed` stamp (§6 step 14);
- `handoffs: none` and the `legacy` edge state;
- the default `actor: by` filled from `--agent`;
- an idle `team pop` answering exit 3 while `team query` idle answers 0;
- the bootstrap's `RUNTIME_ERROR` JSON (R1-024).

REQ-904 ("only the items of §8 stay in code") is therefore violated by the spec.

**Change to the spec.** Either add a §8 row with its reason for each item, or move the item to the file: `texts.list_cap: n` (template
5), `limits.held_shown: n` (template 8), R1-010 for `completed`/`handoffs`, R1-011 for `<reviewers_text>`. The item field `team`
belongs in §8 ("binding marker, the only team word the plain tree reads").

### R1-015 | MAJOR | `inventory.tsv` DI-FM/DI-STORE rows; REQ-011; code `shared/frontmatter.js:259`–`:298`, `shared/store.js:220`, `team/handoff.js:44`–`:75`

**What is wrong.** Three backward-compatibility readers are classified as storage integrity and stay. This contradicts the standing
ruling "no backward compatibility (migrate or fail)" and D-10:
1. The item codec reads the earlier keys `name`, `updated`, `updated_by`, `claimed_by`, `claimed_at` "forever" (comment at
   `frontmatter.js:261`) and encodes the holder semantics (`owner` is the holder while `owned_since` is set) in storage
   (`:271`–`:277`, `:285`–`:287`), a claim concept inside the codec.
2. `store.js:220` `LEGACY_KEYS = ['stage','review_state']` keeps a legacy-suppression rule.
3. `handoff.js:62` treats a `closed` producer without a `handoffs` key as the edge state `legacy`, which satisfies the dependency. It
   uses the literal `closed` (`normalise(...) === 'closed'`; likewise `dependencies.js:85`, `:90`), and §5.2 says "the target is
   `closed`-like", a term never defined. The schema keeps `legacy` among `handoff_states`.

**Change to the spec.**
1. REQ-011 migrates every item, bound or not, to the stored keys (`title`, `last_updated`, `last_updated_by`, `owner`/`owned_since`)
   once. The codec then reads only the stored keys and maps no key; a file with an earlier key fails with the migrate message.
2. Delete `LEGACY_KEYS` with ST-LEGACY.
3. In §5.2 replace "`closed`-like" by "a finished word of the target's definition", and rename the edge state `legacy` to `unrecorded`
   with the permanent meaning "the producer has no records field", with no reference to earlier builds. Or migrate: REQ-011 writes the
   records field on every finished bound item that has none, and `legacy` is removed from the enum. Add the codec rows to the inventory
   as ST-LEGACY (DELETED).

### R1-016 | MAJOR | REQ-805 ("Output formats unchanged"), D-09, D-16, REQ-902; code `shared/query.js:291`–`:295`, `team/views.js:19`, `:125`–`:126`

**What is wrong.**
- Plain `list --json` adds `claimed_by` and the derived `review_state` to every row "so no caller reads the item files" (topology
  CON-02 reads them).
- The team views' JSON key list includes `review_state`, and the text view prints `review=<review_state>`.

D-09 deletes the derived fields, and REQ-902 forbids team words in plain output, so "Output formats unchanged" cannot hold, and no
requirement states the new plain `list --json` row shape.

**Change to the spec.** Add a requirement REQ-928 "plain `list --json` rows carry the stored front-matter fields of the item and no
derived field; `review_state` is removed (CHANGELOG)", with consumer CON-02 ordered before it. Amend REQ-805: "text and JSON views
print the status word in place of `review=`; the JSON keys are listed in `views.<v>.fields` (new key, template = today's list without
`review_state`)". Add `views.<v>.fields` to §4.7.

### R1-017 | MAJOR | `06-migration-plan.md` "Bridges", PH-0 ("old input still accepted until PH-11"), PH-1..PH-10; vs D-01, REQ-003 and the rulings "no aliases, no backward compatibility" (owner 2026-11-07, AG)

**What is wrong.** For ten phases, each deployed live through `commit.sh`, the engine reads the shipped template in memory and maps
`wip-limits.json` and `backlog.scope` into entries in memory (`src/engine/bridge.js`), and `team define`/`team workflow --file`
accept both input shapes. That is a run-time shipped fallback (D-01 forbids it) and a dual input format (backward compatibility),
live on the owner's backlog.

**Change to the spec.** Reorder 06:
1. A new PH-0b lands the schema-2 reader, `backlog team migrate` and `--dry-run` right after PH-0.
2. The live backlog is migrated (owner-approved, reviewed dry run) before PH-1.
3. From PH-1 on the engine reads only registered schema-2 files, and old files fail with the migrate message.
4. PH-0 accepts only schema-2 input.
5. `bridge.js` and its guard are deleted from the plan.

If a transition window is unavoidable, it must be an owner question (a new Q-16 with the cost of each option), not an analyst
decision.

### R1-018 | MAJOR | REQ-011 (3) and AC2 "unbound items are never changed", D-07, D-10, REQ-703; code `shared/new.js:191`

**What is wrong.** Plain `new` has written `claimed_by`, `claimed_at`, `review_state: 'none'` and `reviewer` on every item
(F10). REQ-011 migrates only bound items, so every unbound item keeps the legacy `review_state` key. When such an item is later bound by
`set-team`, it is a bound item carrying a legacy key: per D-10 every command then fails with the migrate message, which migrate cannot
fix because it already ran, or the engine silently ignores the key. Neither outcome is specified.

**Change to the spec.** Either REQ-011 also removes `stage` and `review_state` from unbound items (they were written by the CLI, not
by the user; AC2 then reads "unbound items keep their status and every user field"), or REQ-703 states "`set-team` removes `stage` and
`review_state` before applying the step", with a scenario that binds an item created before the migration.

### R1-019 | MAJOR | REQ-902; code `shared/seen.js:121`, `:156`, `shared/query.js:120`–`:125` (the changes report of `backlog list changes`)

**What is wrong.** The plain changes report sorts changed items into "held" and "others", where held means
`claimed_by === agent || reviewer === agent || refiner === agent`. These are team role fields in a plain read. The row is classified
DI-STALE STAYS (INV-226) and no requirement covers it.

**Change to the spec.** Add to REQ-902: "the plain changes report counts an item as held when the agent is in its holder field (the
field plain `--claim` writes, Q-02); team roles are not consulted", with a test. If the owner wants team-aware held lists, add
`backlog team query --changes`, driven by `limits.holder`.

### R1-020 | MINOR | REQ-113 vs §4.6 `to` and §6 step 13

**What is wrong.** REQ-113 lets `steps.set-status.to` be the token `flag_value`, but neither the `to` row of §4.6 nor §6 step 13 lists
that token, and V-07 would reject it.

**Change to the spec.** Add `flag_value` to the `to` token list of §4.6 and §6 step 13 ("the flag value, which must be a status of the
definition: else `wrong_status`"), and add a V-07 exception for it.

### R1-021 | MINOR | REQ-932 option A, Q-08 option A

**What is wrong.** The requirement fixes the target word `closed` and a record heading in the CLI's requirement text, while every
other step's `to` and `records` come from the file.

**Change to the spec.** Write "step `abandon` defined by the template with `to` = a finished word of the definition (template:
`closed`) and `records` = the template text"; the acceptance criterion checks the template, not a literal.

### R1-022 | MINOR | REQ-207 statement ("`update --replan` in a bound session")

**What is wrong.** As written, a plain command (`update --replan`) is subject to a team session scope, which contradicts REQ-902. In
the code the refusal runs only on the team path (`update.js:199`, `team?.refuseOutside`).

**Change to the spec.** Write "`team update --replan`".

### R1-023 | MINOR | REQ-701, §5.2 `dependencies_finished`

**What is wrong.** An unbound target is finished "per Q-01". If Q-01 = B (no convention), the predicate is undefined and no
acceptance criterion covers that case.

**Change to the spec.** Add the criterion: "Q-01 = B: an unbound target counts as finished only when archived (path under
`archive/`)", or "never finished", chosen with the answer to Q-01.

### R1-024 | MINOR | `08` Q-11 problem statement; code `bin/backlog.js:27`–`:29`

**What is wrong.** Q-11 says "today a failure is a text line even with `--json`". The bootstrap already prints
`{"ok":false,"error":{"code":"RUNTIME_ERROR","message":...}}` on stdout under `--json` for a runtime error (exit 1). This site is not
in the inventory, because `bin/` was not scanned.

**Change to the spec.** Correct Q-11's problem statement ("one error path, the bootstrap's runtime error, already prints the object"),
add the site to the inventory (DI-ERR), and make REQ-935 option A reuse that shape and option B remove it (one behaviour per
command).

### R1-025 | MINOR | `inventory.tsv` environment coverage; §3 "no environment variable"; owner rule 2026-11-07 / AG ("the backlog source comes only from the repository's backlog config")

**What is wrong.**
- `bin/backlog.js:10` (`BACKLOG_RUN_HOOK` spawns a process on every exit) is not in the inventory.
- `team/pop.js:20` (`BACKLOG_TEST_SELF`, a test seam that replaces the binary in production code) is labelled DI-SYNTAX.
- `shared/store.js:107` (`BACKLOG_LOCK_WAIT_MS`, default 120000) is labelled DI-STORE.
- `shared/store.js:23` and `upgrade.js:39` (`XDG_CONFIG_HOME`, `APPDATA`) are absent.
- `shared/store.js:35` and `setup.js:89` (`BACKLOG_HOME`) and `setup.js:51` (`BACKLOG_ORIGIN_URL`) override the configured backlog
  source, against AG. They are deferred to 7c-4 without an owner question.

**Change to the spec.** Add the absent rows. Classify `BACKLOG_TEST_SELF` as a test seam with terminal "DELETED: inject through the
test harness, not the environment". Classify `BACKLOG_HOME`/`BACKLOG_ORIGIN_URL` as OWNER-QUESTION, folded into Q-12 (plain
environment fallbacks), so the plan does not silently keep an environment override that AG ruled out. List
`BACKLOG_RUN_HOOK`/`BACKLOG_LOCK_WAIT_MS` in §8 as documented operator inputs.

### R1-026 | MINOR | REQ-802, §6 ("a mark runs the named step"); code `team/queue.js:4`, `:23`, `:168`–`:172`, `team/pop.js:71`

**What is wrong.** `team pop` marks a claim by calling the queue engine with the internal flag `--claim-now`. When the item has no team
and the session names none, the engine spawns the *plain* `backlog update <item> --claim <me>` (`queue.js:171`). Neither the flag nor
the plain fallback appears in the inventory or in the spec.

**Change to the spec.** Add to REQ-802: "a mark runs only a team step of the item's definition through §6; `team pop` never runs a
plain command; `--claim-now` is removed (the mark is internal)". Add inventory rows (Q-POP).

### R1-027 | MINOR | REQ-909, `05` §5 guard 1 allow-list; code `shared/plain-step.js:50`–`:54`

**What is wrong.** Plain `--close --by owner --reason` is an owner-close variant: a role literal and a refusal ("only the claimer
closes it") in the plain tree. It is not in the inventory and no REQ-909 option mentions it.

**Change to the spec.** REQ-909 option A: "`--by` is recorded as the closer; no name is special"; option B removes it together with
the flags. Add the rows to PC-STEP.

### R1-028 | MINOR | REQ-802 / §4.7 `mark`; code `team/pop.js:84`–`:85`

**What is wrong.** Today the pop decides whether to run `--start-review` or `--refine-start` by testing the *instruction text*
(`startsWith('continue your review')`, `startsWith('refine it before anyone works on it')`). Under the spec the texts move into the
file, so changing a text would change behaviour.

**Change to the spec.** Add the acceptance criterion: "whether a mark runs is decided only by the offer's `mark` key; a test changes
every instruction text of the template and the pop results stay equal". Add the rows (Q-POP).

### R1-029 | MINOR | `consumers.tsv` (14 rows)

**What is wrong.** Two topology dependencies on CODE rules are missing:
1. `<agent-skills>/team-member/tests/test_review_refs.py:34` treats `("closed","done","archived")` as finished on `list all-branches
   --json` rows (ST-FINISHED / PC-FINISHED).
2. `<agent-skills>/team-lead/scripts/<runner-script>:13`, `:196`–`:247` write and read the hand-off marker
   `<team>/handoff/<agent>.json` "written by backlog team update at --request-review and --close", a CLI behaviour removed with S82.
   REQ-114 makes it a file switch that the template leaves off.

**Change to the spec.** Add CON-15 (finished words from the definition, PH-11) and CON-16 (the marker stays the team runner's own; with
`session.block_after_end` on, the team runner may drop it; PH-4), and update `01-inventory.md` §7.

### R1-030 | MINOR | REQ-906, DI-FIELDS; code `shared/fields.js:21`, `:24`, `:28`

**What is wrong.** The plain field table describes team semantics: `owner` "the agent working on the item … team update --claim",
`review_refs` "for team work", `chunk` "small pieces of work any member does". This is team vocabulary in the plain tree's
documentation, which REQ-906 says to regenerate but REQ-902 does not cover.

**Change to the spec.** Add to REQ-902: "the plain field table documents each field as data only; team meanings are documented in
`docs/team-behaviour.md` from the definition". Add the three rows to the inventory.

### R1-031 | MINOR | `03-spec.md` §4.5 vs `schema/team-behaviour.schema.json`

**What is wrong.** The schema defines `waiting.record` and `waiting.cleared_by_note`; §4.5 mentions them only in passing (no row with
type, default, validation and error). REQ-906 requires every key to be documented.

**Change to the spec.** Add the two rows to §4.5:
- `waiting.record`: text template, required when `cleared_by_steps` is non-empty, V-12.
- `waiting.cleared_by_note`: boolean, default `false`.

### R1-032 | MINOR | Q-04, REQ-911; code `team/cli.js:39`–`:40`

**What is wrong.** The command team and the agent fall back, after the environment, to the `team` and `user` keys of
`.backlog/config.json`. Q-04 lists only the environment variables, so the configuration fallback is neither asked about nor specified.

**Change to the spec.** Add to Q-04 and REQ-911: "after `--team`/`--agent` and (option A) the variables, the keys `team` and `user` of
`.backlog/config.json`", or state that option B also drops the configuration fallback. Add the configuration keys to §3's input
table.

### R1-033 | MINOR | `08` Q-15, REQ-939; code `upgrade.js:46`, `:205`

**What is wrong.** Besides the 1500 ms wait (`:205`), the release check runs again after 1 hour following a failure, after 24 hours
with `auto`, and after 7 days otherwise (`:46`). These numbers are part of the same plain feature, but they are not inventoried and
Q-15 does not mention them.

**Change to the spec.** Add the row (DI-UPGRADE), and state in REQ-939 that the intervals stay as they are under both options (or
include them in option A).

---

## The five most important findings

1. R1-001: the team pipeline lives inside the plain modules through injected hooks and `seam.js`; the spec has no place for the team
   write path, and the guard cannot see the hooks.
2. R1-002: the inventory misses 73 plain-tree flow sites (field reads, status helpers, hooks, `bin/`), so its counts and the claim of
   completeness do not hold.
3. R1-003: owner questions Q-02 C and Q-03 B, and parts of Q-01 (archive refusal, `normalise`), contradict the binding principle,
   which already answers them.
4. R1-008 to R1-012: the "generic" engine still fixes role names, entry keys, field names, verdict names and step-name special cases,
   which is a behaviour pattern in code.
5. R1-005, R1-015, R1-017: `archived` is forced into every definition and written by plain archive; legacy readers (codec,
   `legacy` edge state) and the ten-phase run-time bridge keep backward compatibility the rulings forbid.
