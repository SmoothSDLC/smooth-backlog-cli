# R2 — Explicitness and testability of every input (review log)

Reviewer: R2 (lens: every key of the team behaviour file fully defined; every acceptance criterion mechanically testable).
Spec reviewed: this folder as of `4bd01104d` (last change of 03-spec.md; main at `09ad81d96`). Code reference: smooth-backlog-cli `174c76d` (read-only worktree).
Companion file: `R2-key-table.tsv` (286 keys, one row each, ten attributes marked Y / PARTIAL / N / CONTRADICTS, with notes).

## Method

1. Flattened the four schema files into 286 key paths (242 of `team-behaviour`, 21 of `teams`, 21 of `team-definition`, 2 of
   `workflows`, including the 49 predicate/condition keys of `$defs`), parsed the §4 tables of `03-spec.md`, and checked ten
   attributes per key: type, allowed values, default or required, validation, exact error text, commands that read it, effect,
   interplay, valid example, invalid example (with its exact message).
2. Read every acceptance criterion of REQ-001..REQ-940 (106) for input → action → observable result.
3. Script over `03-spec.md`, `04-bdd.md`, `features/*.feature`, `05-tdd-plan.md` and `07-traceability.tsv`: dangling ids,
   duplicates, REQs without scenario or test, tag/owner mismatches. Read 95 scenarios against their REQs (all of `team-file`,
   `team-statuses`, `team-roles`, `team-claims-handoffs`, `team-review`, `team-limits`, `team-queue`, `team-creation-dependencies`,
   `team-refinement`, `team-migrate`, `plain-guarantee`, `plain-gaps`, both conditional files, and the 48 validator rows).
4. Validated the templates with python `jsonschema` 4.19.2 (`Draft202012Validator`, metaschema check, `referencing` registry),
   independent of `tools/validate_subset.py`; checked keywords against the REQ-012 subset and the `additionalProperties` policy.
5. Compared refusal texts and exit codes with each other, with `COMMANDS.md`, `src/help.js`, `src/errors.js`,
   `src/shared/store.js` and `src/team/cli.js` of the CLI.

## Results in numbers

- Keys checked: 286. Fully defined (all ten attributes present, no contradiction): **12** (`schema`, `description`, `statuses`,
  `initial`, `finished`, `scope.session_team_only`, `scope.foreign_items`, `create.sets`, `create.missing_section`, `create.ask`,
  `limits.count_scope`, `steps.<s>.actor`). Keys with their own
  §4 row: 116; keys described only inside a parent row: 57; keys with no row at all: 64; catalogue keys of §5 (prose only, no
  per-key error or example): 49. Contradictions between schema, template and spec: 17 keys.
- Schemas: all four pass the 2020-12 metaschema; all use only the REQ-012 keywords; every object has `additionalProperties`
  (unknown keys always fail with `not a key of this object`). `team.full.json` and `minimal.json` validate against
  `team-behaviour.schema.json` with 0 errors; `teams.example.json` against `teams.schema.json` with 0 errors; both of its entries
  as define inputs with 0 errors. `workflows.schema.json` cannot be used by a standard validator (R2-013);
  `workflows.example.json` is invalid (R2-013).
- Traceability script: 106 REQs, 188 scenario ids, 184 tests; no dangling id, no duplicate, no tag/owner mismatch, `04-bdd.md`
  coverage equals the spec; every REQ has at least one test; 11 REQs have no scenario, each with a stated reason (REQ-208's
  reason is wrong, R2-029).
- Findings: 2 BLOCKER, 23 MAJOR, 17 MINOR.

## Findings

### R2-001 | BLOCKER | §4.8 `review` + §4.4 `defaults.review` + E-07 + REQ-010; scenarios S-001-1, S-010-1, S-405-1 and every scenario that uses the step "a team … using the workflow"

What is wrong: the template's `defaults.review` is `[{peer,1},{external,1}]`. REQ-010 makes `team define` write it into an entry
that gives no `review`; E-07 refuses a stage whose reviewer role is empty (`external` with no `external_reviewers`); REQ-004
validates the whole `teams.json` on every command. So `team define` of a team without external reviewers (S-001-1, S-010-1)
either fails E-07 or writes an entry that fails E-07 on the next command. The step "a team … using the workflow" writes an entry
without `review`; S-405-1 expects "1 pass(es) by members of the team … needed", which only holds if an absent `review` reads as
`defaults.review` — which again includes `external` and trips E-07 (exit 2, not the expected exit 1). The scenario suite cannot
pass as specified. Today's CLI (`src/team/team.js` 209-217) checks the external-stage rule only on a `review` the input gives
explicitly and reads an absent `review` as the default (`src/shared/status.js` 47); the spec dropped both qualifications.

Fix (exact change to the spec):
- §4.8 `review`, column default: replace "the workflow's `defaults.review` (written by `team define`)" with "absent: read as the
  workflow's `defaults.review` at every read; `team define` stores the entry without `review` when the input gives none".
- §4.8 `review`, column validation, E-07: append "E-07 applies only to a `review` list written in the entry or the define input;
  a list taken from `defaults.review` is not checked, and a stage of it whose reviewer role resolves to nobody can never be
  passed (today's behaviour)".
- REQ-010 statement: replace "filling `review` from the workflow `defaults.review` when absent" with "leaving `review` absent when
  the input gives none (read as `defaults.review`, §4.8)"; add acceptance criterion 3: "define of `{lead:"a",members:["b"]}` on the
  template workflow succeeds; `teams.json` has no `teams.<t>.review`; `team validate` passes; a close needs 1 peer pass".

### R2-002 | BLOCKER | §4.7 `refusals` / `instructions`, §5.1, §5.2, §6, REQ-903; `templates/minimal.json`

What is wrong: the machinery prints 45 text keys of `team.full.json` that no step, condition or offer names (it picks them by
itself). 9 are the required keys of §4.7; the other 36 are not inputs anyone can reason about. 13 of them are not mentioned anywhere
in the spec, the features or the TDD plan: `dep_foreign`, `dep_handoff_missing`,
`dep_handoff_rejected`, `dep_handoff_stale`, `dep_handoff_unaccepted`, `dep_missing`, `dep_status` (the parts of the
`dependencies_finished` refusal — S-701-1 expects "dependencies not done: 001-work (done, hand-off missing", built from them),
`completion_ender`, `continue_passed_rules_pending`, `handoff_accept_needs_by`, `lead_close_work_item_review`, `pop_session_team`,
and `claimed` (plus `team_not_configured`, present only in `minimal.json`). The other 23 (`caller_not_actor`, `edit_exclusive`, `outside_scope`, `session_branch`,
`session_ended`, `limit_hint`, `create_status_flag`, `close_now`, `close_now_unheld`, `next_rules_pending`, `next_status`,
`close_gate_edge`, `close_gate_none_record`, `close_gate_missing_hint`, `review_rule_not_met`, `review_no_work_commit`,
`review_lookup_failed`, `review_later_work`, `pop_caller`, `claim_first`, `dod`, `refs_note`, `stale_hint`) are named in prose
but not as an input: no statement of when the key is required, which placeholders it receives, or what happens when it is
missing. `minimal.json` has none of the 36 (for example `create_status_flag`, needed by `team new --status` on every team, and the
`dep_*` texts), yet REQ-014 declares it valid. The output of these paths is therefore undefined, and V-11 ("every referenced key present") cannot catch it
because the reference is implicit.

Fix: add §4.7a "Machinery text keys" as a table with one row per implicit key: key, when it is printed (command, step, check),
the placeholders it receives with their values, required-when condition (for example "`create_status_flag`: always required";
"`edit_exclusive`: required when any step has `exclusive: true`"; "`caller_not_actor`, `pop_caller`: required when
`identity.caller_acts_only_as_itself` is an object"; "`outside_scope`, `session_branch`: required when `scope.bind_session` is
true"; "`session_ended`: required when `session.block_after_end` is true"; "`dep_*`: required when any `dependencies_finished` is
used"), and the composition rule of the `dependencies_finished` refusal (`<list>` = one `dep_status`/`dep_foreign`/`dep_missing`
text per unfinished dependency, plus the `dep_handoff_<state>` text for a finished one whose edge state is not allowed, joined by
`; `). Add V-31 `refusals: missing key <k> (required by <feature path>)` enforcing the required-when column, add its Examples row to
`validator-keys.feature`, and add the missing keys to `minimal.json`. Delete `team_not_configured` from `minimal.json` (D-09 makes it
machinery text; see R2-040).

### R2-003 | MAJOR | §4.8 `lead`, E-02; S-013-41, S-209-1; `teams.example.json`

What is wrong: E-02 fires when the lead **is** listed in `members` (S-209-1 "the lead cannot be a member"; S-013-41 lead "b",
members ["b"]; the example teams have the lead outside `members`), but its text says "the lead is not one of the members", the
opposite meaning. The §4.8 cell "(lead in members)" does not say whether that is the trigger or the requirement. The text is
today's (`src/team/team.js` 201), but the spec is the place to fix a misleading exact message.

Fix: §4.8 `lead`, validation: "E-02 `teams.<t>.lead: the lead must not also be listed in members` (triggered when `lead` is an
entry of `members`)"; update S-013-41 and S-209-1 to the new text; list the text change in D-09.

### R2-004 | MAJOR | `schema/workflows.schema.json` `propertyNames` vs `$defs.name` and §4.1 `workflow`, §4.8 `workflow`

What is wrong: a definition's `workflow` and a team entry's `workflow` allow `:` (`^[a-z0-9][a-z0-9._:-]{0,63}$`); the registry key
of `workflows.json` does not (`^[a-z0-9][a-z0-9._-]{0,63}$`). Verified: a definition named `example:team` validates, the registry
holding it fails (`'example:team' does not match`). REQ-009 validates only the definition before writing, so registration succeeds and
then every team command fails REQ-006 (exit 2).

Fix: use one pattern for all three: change `workflows.schema.json` `propertyNames.pattern` to `^[a-z0-9][a-z0-9._:-]{0,63}$`, and
state in §4.9 "the key pattern equals §4.1 `workflow`". Add a validator row: registry key with `:` is accepted.

### R2-005 | MAJOR | `$defs.condition` `minProperties: 2` vs §5.1

What is wrong: §5.1 says `review_passes_met` and `no_later_own_work` conditions need no `refusal` (fixed keys). The schema requires at
least two keys in a condition, so `{"review_passes_met": true}` is refused with `must have at least 2 keys`; the template only
passes because it adds `unless`. The minimum also lets `{"field_empty":"x","when":{…}}` (no refusal) through to V-11, so the two
mechanisms disagree on which message a missing refusal produces.

Fix: remove `minProperties` from `$defs.condition`; §5.1: "a condition without `refusal` (other than the two fixed-text tests) is
V-11 `<path>: a condition needs refusal`". Add a validator row for `{"review_passes_met": true}` alone being valid.

### R2-006 | MAJOR | §4.8 default column (all entry keys), §6 step 2

What is wrong: defaults of entry keys are stated as what `team define` writes, not what a reader assumes when the key is absent in
`teams.json` (hand-written, migrated, or written by the test step). `review` is R2-001; `external_reviewers`, `review_only`,
`refinement_review`, `limits`, `chunk_scope` need the same statement. `chunk_scope` default `branch` differs from "absent = no cap",
so the reading matters.

Fix: add to §4.8 the sentence "Defaults are read-time defaults: a reader treats an absent key exactly as the default value; no writer
fills them in", and make each default cell a value (`[]`, `[]`, `[]`, `{}`, `"branch"`, R2-001 for `review`).

### R2-007 | MAJOR | §4.6 `to`, §6 step 13 vs REQ-113, S-113-1

What is wrong: REQ-113 and S-113-1 use `"to": "flag_value"`; the token list of §4.6 and §6 step 13 has no `flag_value`, and V-07 would
refuse it (`flag_value is no status of this workflow`). REQ-113 also says the flag value "must be a status of the definition" but gives
no refusal key, text or exit code; T-113-1 expects "status / wrong word text".

Fix: §4.6 `to`: add token `flag_value` ("the step's flag value; allowed only for `set-status`; V-07 is skipped for it"); §6 step 13: add
the same; REQ-113: "a flag value that is not a word of `statuses` or `side_statuses` is invalid input, exit 2: `argument --status:
invalid choice: '<v>' (choose from <words>)`" with an acceptance criterion and a scenario.

### R2-008 | MAJOR | schema keys with no definition in §4 (or only a name)

What is wrong: these schema keys have no row, no effect, no default and no example (see the key table):
`waiting.cleared_by_note` (required by the schema, not even listed in §4.5), `waiting.record` (default when absent unknown),
`waiting.since_field` (what writes it), `steps.<s>.verdicts.<v>.records_verdict`, `edit_rules[].unless_request_has`,
`steps.<s>.arguments.<a>.order` values `before_from`, `after_from`, `after_gate` (§6 11(b) names `after_gate`, a "gate" is not
defined), `$defs.condition.order` value `after_gate` (absent from §5.1), `queue.roles.<r>.offers[].when_actor`, `.when_team`
(`no_other_open_items`), `.otherwise_instruction`, `.preempts` (template entries such as `continue:plain` have no grammar), `.scope`
(`entry_chunk_scope`), `queue.roles.<r>.busy_when` ("predicate (over the team)"), `queue.plan.passes[].assign` (the four strategies
`holder`, `lead`, `idle_member_not_author`, `least_loaded_free_member`), `.limit`, `.reason` (free string, unlike the text-key
`instruction`), `views.wip` absent (what `team query --wip` does), `queue.plan` absent with `--plan` (error).

Fix: add one §4 row per key with all columns; minimum content: `waiting.cleared_by_note` boolean, required in `waiting`, effect "a
`--note` by the holder clears the wait like a step of `cleared_by_steps`"; `waiting.record` text, default absent = no body line;
`waiting.since_field` field set to `now` by the `waiting` step's `sets` only (no machinery effect) or delete it; `records_verdict`
text placed in `<records_verdict>` of the step's `records`; `unless_request_has` "the rule does not apply when the request also has
one of these selectors"; arguments `order` "first: §6 11(b); after_gate: §6 11(b) after the conditions with order first; before_from
and after_from: removed from the argument enum" (or define them); condition `order` "after_gate: removed" (or define); offers:
define each sub-key with its effect on `team pop`, the `preempts` grammar (`<action>` or `<action>:<qualifier>` with the qualifier
list); plan: one sentence per strategy (who receives the entry, tie-break order, interplay with limits); `views.wip` absent →
`❌ backlog: view wip is not defined by workflow <w>` exit 2; `--plan` without `queue.plan` → `❌ backlog: team query --plan: workflow
<w> defines no queue.plan` exit 2.

### R2-009 | MAJOR | `steps.<s>.notice` and `steps.<s>.verdicts.<v>.notice` vs §4.6 row `notice (verdict)`

What is wrong: the schema has a step-level `notice` that the spec does not define, and types both as free strings; §4.6 allows only
`close_now_or_next`. An unknown value passes validation with undefined output.

Fix: schema: delete `steps.<*>.notice` (unused by the template) or define it; set `verdicts.<*>.notice` to `{"enum":
["close_now_or_next"]}`; §4.6: give the four outputs exactly (which instruction key in which state, printed after the update line).

### R2-010 | MAJOR | §4.7 `queue.roles.<role>.offers` and REQ-802: "lead before member when both"

What is wrong: the evaluation order of queue roles is tied to the role names `lead` and `member`, a team word in code (contradicts §8 and
REQ-905), and is undefined for a definition whose roles have other names or more than two queue roles. The template lists `member`
first, so file order would give the opposite of the stated rule.

Fix: add key `queue.role_order` (array of distinct roles of `queue.roles`, required when `queue.roles` has more than one key; V-09 and
`queue.role_order: <r> is not a key of queue.roles`); effect "for an actor holding several of them, the offers of the first listed role
are tried first"; template `["lead","member"]`; REQ-802 statement: replace "(lead offers before member offers for the lead)" with
"(roles in `queue.role_order`)".

### R2-011 | MAJOR | §4 / REQ-013: cross-reference checks with no semantic rule

What is wrong: these combinations are valid by schema and by V-01..V-30 but break or are undefined at run time: a step with `stages`
or a review predicate while `review` is absent ("required when" has no error); `review.stages` keys not equal to
`review.stages_order`; a step with `ends_session` while `session` is absent; `within_limits*` while `limits` is absent;
`limits.override.lifts` not a subset of `limits.levels`; an entry `limits` level not in the definition's `limits.levels`; implicit
refusal keys (R2-002); `queue` offers whose `mark` step has `by` roles the queue role does not hold.

Fix: add V-31..V-37 to §4 with these texts and one Examples row each: `review: missing (needed by <path>)`;
`review.stages: <st> is not in review.stages_order` / `review.stages: missing stage <st> of review.stages_order`; `session: missing
(needed by <path>.ends_session)`; `limits: missing (needed by <path>)`; `limits.override.lifts: <l> is not in limits.levels`;
E-09 `teams.<t>.limits.<l>: level <l> is not in the limits.levels of workflow <w>`; plus V-31 of R2-002. Renumber T-013-1 to cover
them.

### R2-012 | MAJOR | `$defs.predicate` vs §5.1/§5.2

What is wrong: the predicate schema accepts every condition-only test (`review_passes_met`, `no_later_own_work`,
`dependents_handoffs_accepted`, `dependent_exists`, `handoff_record_exists`, `handoff_record_has_commit`, `not_caller_session_of`,
`within_limits_for_role`, `within_limits_of_target_team`, `flag_value_is_configured_team`, `any_of`, `all_of`). In `views`,
`select`, `limits.active_item` there is no actor, flag value or caller session, so their result is undefined. §5.2 also lists
predicates without type or example (only §5 prose).

Fix: split `$defs.predicate` (only the §5.2 keys) from `$defs.condition` (adds the §5.1 test keys); or add V-38 `<path>: <k> needs
an actor and is not allowed in <views|select|limits|queue.plan>`. In §5.2 add a table: key, value type, passes when, contexts
allowed, one valid and one invalid example with message.

### R2-013 | MAJOR | `schema/*.json` `$id`/`$ref`; `templates/workflows.example.json`

What is wrong: (a) `$id` values are relative references (`backlog-team-behaviour/2`). A standard 2020-12 validator resolves the
`$ref` in `workflows.schema.json` against the base `backlog-workflows/2` to `backlog-workflows/backlog-team-behaviour/2` and fails:
python `jsonschema` 4.19.2 raises `Unresolvable: backlog-team-behaviour/2` even with all four schemas registered by `$id`. Only the
in-house literal lookup of `validate_subset.py` works, so D-04's "standard JSON Schema 2020-12" and REQ-906's documentation promise
do not hold for `workflows.json`. (b) `templates/workflows.example.json` has strings instead of definitions; it fails with
`workflows.team: is not of type 'object'`, and REQ-014 says every template is valid.

Fix: (a) give each schema an absolute `$id`, for example `urn:backlog:team-behaviour:2`, `urn:backlog:workflows:2`,
`urn:backlog:teams:2`, `urn:backlog:team-definition:2`, and `"$ref": "urn:backlog:team-behaviour:2"`; REQ-012: "`$ref` to the
absolute `$id` of a sibling schema". (b) delete `workflows.example.json` (the format is shown by §4.9) or generate it with the two
definitions inlined, and add it to REQ-014's list with a validation test.

### R2-014 | MAJOR | §4.7, §4.8, §4.9 table layout; sub-keys

What is wrong: the owner asks for interplay per key; the §4.7, §4.8 and §4.9 tables have no interplay column (53 rows of the key
table, the team entry and the define input counted separately). 64 schema keys
have no row at all (for example every field of `completeness[]`, `create.ask[]`, `defaults.review[]`, `limits.holder[]`,
`edit_rules[]`, `queue.roles.<r>.offers[]`, `queue.plan.passes[]`, entry `review[]`, `refinement_review[]`, the container keys
`identity`, `scope`, `create`, `review`, `limits`, `waiting`, `queue`, `views`, `session`, `texts`, `plain_commands`, and the define
input's `schema`); 57 keys are only named inside a parent cell, without their own default, error text or example (for example
`side_statuses.<w>.enter`, `roles.<r>.entry_rule_teams`, `steps.<s>.stages.<st>.to`, `steps.<s>.verdicts.<v>.clears`). Container
keys need a row too: whether the object is optional and what its absence means (`identity` absent = both defaults; `queue` absent =
`team pop` answers what?).

Fix: give §4.7–§4.9 the interplay column; add one row per key listed in `R2-key-table.tsv` with spec_row `NO ROW` or `(sub-key)`,
each with type, default/required, validation text, effect, and a valid and an invalid example with its message. For containers state
"optional; absent means …". REQ-906's test should enumerate these rows, not only the page.

### R2-015 | MAJOR | §4.7 placeholder list, 05 §3 filler table

What is wrong: 14 allowed placeholders have no value in 05 §3: `<you> <why> <what> <text> <sha> <outcome> <time> <result> <ids|none>
<minutes> <answer> <the commit> <member> <findings>`; `<reviewer>` is listed twice. Some are literal reader instructions in the
template (`<outcome>` in `close_now`), others look filled (`<member>`), and the spec does not say which, so the exact output of those
texts is undefined. The meaning of every filled placeholder is delegated to the test plan instead of the spec.

Fix: in §4.7 split the list into "filled placeholders" (table: placeholder, value, empty value) moved from 05 §3 into the spec, and
"literal tokens printed as written" (`<outcome> <the commit> <ids|none> <minutes> …`); V-12: "a single lowercase word that is
neither filled nor literal is unknown"; drop the duplicate.

### R2-016 | MAJOR | REQ-925, §8 "exit codes 0/1/2/3/5" vs CLI

What is wrong: exit code 4 exists today ("the configured backlog repository is not cloned (run backlog setup)":
`src/shared/store.js` 69, `src/help.js` 85, COMMANDS.md "Output and exit codes"); the spec's contract omits it, so REQ-925's
table test would either fail or delete a documented code without saying so. REQ-925 also moves storage failures from 2 (COMMANDS.md:
"2 invalid input or a failure", `operation()` in `src/errors.js` already uses 1) — the change must be explicit.

Fix: REQ-925 and §8: "0/1/2/3/4/5", with "4: the configured backlog repository is not cloned (unchanged)"; add a row to T-925-1;
state "storage failures exit 1 (COMMANDS.md changes from '2 … or a failure' to '2 invalid input')".

### R2-017 | MAJOR | REQ-015 "exit 2" vs §1 Refusal and REQ-925

What is wrong: refusing to redefine a team or workflow in use is a refusal of a valid request; §1 and REQ-925 make that exit 1 on
stdout, REQ-015 keeps exit 2 on stderr (today's `refused()` in `src/team/cli.js` 132). S-015-1 expects exit 2. The two rules cannot both
hold.

Fix: either REQ-925 adds the exception "`team define`/`team workflow` refusals: stderr `❌ backlog: <text>`, exit 2 (configuration
commands)", or REQ-015 becomes "stdout `❌ <text>`, exit 1" and S-015-1 expects exit 1. Choose the first (no consumer change) and say so
in REQ-925.

### R2-018 | MINOR | REQ-009 `--show` of an unregistered workflow: exit 2 vs REQ-925 "not found" = 1

Fix: REQ-925: add "`team workflow --show <unknown>` is invalid input (exit 2)" to the exceptions, or REQ-009 exit 1 on stdout.

### R2-019 | MAJOR | REQ-014 AC1 vs REQ-008

What is wrong: REQ-014 requires `backlog team validate --file` to pass each template, including `teams.example.json`; REQ-008 accepts
only `backlog-team-behaviour/2` and `backlog-team-definition/2` and refuses any other `schema` (`teams.example.json` is
`backlog-teams/2`). The criterion cannot pass.

Fix: REQ-008: accept `backlog-teams/2` and `backlog-workflows/2` files too (validated as registries; E-01 against the workflows of the
home), and update its refusal text to list four ids; or REQ-014 AC1: "`team validate --file` passes `team.json` and `minimal.json`;
a unit test validates `teams.example.json` against `teams.schema.json`".

### R2-020 | MAJOR | §10 acceptance criteria that are not mechanically testable

What is wrong: these criteria lack an input, an action or an observable:
REQ-001 AC1 "committed and pushed as today"; REQ-006 AC2 "plain commands on unbound items are unaffected"; REQ-009 AC1 (prefix and exit
of `workflow <name> unchanged` missing), AC2 "the existing refusal (DI-DEFINE-INUSE)" (a group id, not a text); REQ-014 AC2 "the README
names them" (which README, which strings); REQ-015 AC1, REQ-704 AC1, REQ-940 AC1 "existing tests stay green/unchanged" (no test
names); REQ-101 AC1 "works end to end", AC2 "never compared" (no black-box observable); REQ-104 AC1, REQ-108 AC1, REQ-207 AC1,
REQ-304 AC1, REQ-309 AC1, REQ-405 AC1, REQ-603 AC1 "texts verbatim / today's texts" (no key list or old test ids); REQ-104 AC2
"changes the result"; REQ-105 AC1, REQ-201 AC1, REQ-302 AC1, REQ-801 AC1 "each X has a test" (a coverage statement, not a behaviour);
REQ-303 AC1 "the 12 claim tests", REQ-505 AC1 "the 14 cases", REQ-802 AC1 "the 34 pop tests", REQ-804 AC1 "the 10 plan tests" (ids not
in 03); REQ-402 AC1, REQ-404 AC1, REQ-501 AC1, REQ-803 AC1 "scenario re-pointed" (which); REQ-605 AC1 and REQ-805 AC1 "output format
unchanged" (no expected line); REQ-904 AC1 "a review checklist"; REQ-908 AC1 option B "answer 'not a backlog command'/unknown word"
(no exact text); REQ-911 AC1 option A "unchanged consumers"; REQ-934 AC1 "documented and tested per command".

Fix: rewrite each as Given/When/Then with an exact observable, for example REQ-605 AC1: "with entry `limits:{"team":4}` and one item in
progress, `backlog team query --team t1 --wip` prints the line `team t1: 1 of 4` and the line `limits: <home>/teams.json`"; for the
"texts verbatim" criteria, list the template keys and the old test ids (05 §6) they replace; for count-based criteria list the ids.

### R2-021 | MAJOR | REQ-504 AC1 vs its scenarios

What is wrong: AC1 demands one refusing and one passing scenario per template edit rule; the template has 5 rules, the spec lists two
scenarios (S-504-1, S-504-2), both refusing. The plan itself does not meet its criterion.

Fix: add S-504-3..S-504-10 (one refusing and one passing scenario for each of `edit_rules[0..4]`, the passing ones using an `allow`
entry, including `?actor_role=`, `?when_status=` and `?matches=estimate_or_dod`), and list them in REQ-504 and `04-bdd.md`.

### R2-022 | MAJOR | 05 test tables, column "expected"

What is wrong: 79 of 184 tests state an expected result that is not an observable: "same results" (20), "texts" (16), "text" (8),
"results" (6), "words" (3), "rows" (3), "present" (3), "pass/fail" (3), "values", "answers", "offers", "counts", "booleans", "ok",
"objects", "shape", "result", "stderr", "roles". A test written from "texts" cannot be checked for being the right test.

Fix: replace each with the exact text or value (or the template key whose filled text is expected, with the fixture values), for
example T-103-1 "stdout `❌ backlog team update takes no --status: …` exit 1"; for "same results" name the old test file:line it
re-points.

### R2-023 | MAJOR | S-101-2 does not exercise REQ-101

What is wrong: it registers `minimal` with an extra finished word `dropped` and expects a claim of an item depending on a `dropped`
item to succeed — but `minimal.json`'s `claim` has no `dependencies_finished` condition, so the claim succeeds whatever `finished`
says. The scenario passes even if REQ-101 is not implemented.

Fix: patch the condition in: `steps.claim.requires = [{"field_empty_or_actor":"claimed_by","refusal":"claimed_by_other"},
{"dependencies_finished":{"handoff_states":null},"refusal":"dependencies_not_done"}] ; refusals.dependencies_not_done = "<item>:
waits on <list>"`, and add a second scenario where the dependency is `ready` and the claim fails with that text.

### R2-024 | MINOR | §4.7 `views.*` and REQ-805: the undefined-view line

What is wrong: "refused `view <v> is not defined by workflow <w>` (exit 2)" calls exit 2 a refusal and gives neither stream nor
prefix; §1 defines exit 2 as `❌ backlog: <text>` on stderr.

Fix: "invalid input: `❌ backlog: view <v> is not defined by workflow <w>` on stderr, exit 2"; add a scenario.

### R2-025 | MAJOR | S-605-1 has a vacuous Then

What is wrong: it only checks that the output contains "team", which every `team query` output does. REQ-605 is untested by BDD.

Fix: Then the output contains "team t1: 0 of 4" (the exact level line, after R2-020 fixes REQ-605's format), and a second scenario
with `views.wip.stale_hours = 1` and an item updated two hours ago that is listed as stale.

### R2-026 | MINOR | §4.1 `side_statuses` `returns_to` "a status or `previous`" vs V-05

Fix: delete "or `previous`" (V-05 requires a word of `statuses`; `previous` is a `to` token of the `leave` step, §6 step 13).

### R2-027 | MAJOR | REQ-013 and `validator-keys.feature`: rules that are undefined or not triggered

What is wrong: V-29 is not defined in `03-spec.md`; S-013-38 labels a structural `missing key` as V-29. S-013-28 ("V-20") triggers the
schema enum (`must be one of`), never V-20 (a catalogue step not defined in `steps`). V-09 and V-12 have their text only inside an
example. Three rules have no number: "V-23-like" (`actor_active_items_at_most needs active_work`), `workflows.<k>.workflow: must equal
the name it is registered under (<k>)`, and V-07's "`steps.<enter>.to` must be the side word". Second forms of V-10, V-16, V-18, V-19,
V-26 have no row. REQ-013 AC1 ("each rule has one Examples row") is therefore not met.

Fix: add a table "V-01..V-nn and E-01..E-nn" in §4 with number, trigger, exact text; define V-29 or renumber; number the three
unnumbered rules; change S-013-28's patch to `waiting.cleared_by_steps = ["waiting-done"] ; steps.waiting-done = <delete>` with
message `waiting.cleared_by_steps: waiting-done is not defined in steps`; add one row per second form.

### R2-028 | MAJOR | key-level scenarios: defaults and overrides untested

What is wrong: the README asks for valid, invalid, boundary, default and override scenarios per key. These keys have no scenario or
test with a non-template value or with the key absent: `queue.scope_default`, `scope.foreign_items: none`, `limits.count_scope: team`,
`review.reject_clears_passes: false`, `create.priority_by_severity`, `create.ask`, `waiting.since_field`, `waiting.cleared_by_note:
false`, `views.wip.stale_hours`, undefined views, `identity.same_worker_pattern` absent (REQ-205 AC1 second half), `scope.bind_session:
false` (REQ-207 AC2 has only T-207-2), `records_rules`, `sets_rules`, `binds: false`, `combinable` on a third step,
`dependencies_finished.handoff_states: null` (REQ-701 AC1 second half), `texts.*` absent.

Fix: add one scenario per listed key (fixture definition patched from the template, exact observable), tag them with the key's REQ,
and add a column "key" to `04-bdd.md` §6 so the coverage per key is visible.

### R2-029 | MINOR | other scenario/REQ mismatches

- S-012-1 (REQ-012) validates a template; it does not show that the schemas use only the subset or that the JS and Python
  interpreters agree. Fix: Then "T-012-2 passes" is not BDD; drop the scenario and mark REQ-012 "covered without a scenario (T-012-1..3)".
- S-503-1 checks only exit 1. Fix: add `And the output contains "<the request-decision needs a question text>"` with the template text.
- S-505-1 runs `team query --phase` without `--json`, while REQ-505 puts `missing` in `--phase --json`. Fix: add `--json`.
- S-902-1 checks `review_state ""`, a field deleted everywhere. Fix: check `team ""`, `refiner ""`, `claimed_by ""`.
- S-008-2 is the same as S-014-2. Fix: replace by a team-definition file that passes (`backlog-team-definition/2`).
- REQ-208 says "See S-806-1 (same setup)", but S-806-1 tests `chunk_scope: off`, not `foreign_items`. Fix: add S-208-1 (chunk item of
  another repository offered with scope all; plain one not).
- S-009-1 expects "workflow minimal registered", a text REQ-009 does not define (R2-038).

### R2-030 | MINOR | exact error texts that are not exact

- §4.5 `waiting.cleared_by_steps` and §4.6 `arguments` invalid examples end in "…" (`must be one of claim, release, ...`). Fix: write
  the full list, or state "the enum message lists every value in schema order".
- §4.6 `to_rules` and §4.7 `edit_rules` invalid examples say "→ two lines". Fix: write both lines.
- V-17 has no `<path>` (S-013-25 prints `def.json: no chain …`), unlike the §4 form `<file>: <path>: <message>`. Fix: state the form
  `<file>: <message>` for whole-file rules.
- The root path is empty (`missing key statuses` at the root prints `def.json: missing key statuses`; the reference interpreter
  produces `: missing key statuses`). Fix: §4 "at the root the `<path>: ` part is omitted".
- `propertyNames` failures print `<path> (name): …` (S-013-8, §4.6 `arguments`, §4.8 team name); the suffix is not in the §4 list.
  Fix: add "a key that fails its name rule: `<path> (name): <message>`".
- `<file>` is undefined: base name (S-007-1 `teams.json:`), the home path (REQ-002 `<home>/<file>`) or the user's path (`--file`).
  Fix: "registries: `teams.json`/`workflows.json`; `--file`: the path as given".
- REQ-006 prints the header and "the first problem line": is that line prefixed `❌ backlog: `? Fix: give both lines literally.
- REQ-007: `❌ backlog: <file>: <problem>` while a problem already starts with `<file>:`. Fix: "`❌ backlog: <problem>`".

### R2-031 | MINOR | invalid examples without a message, validation cells that contradict the schema

`queue.scope_default` ("world"), `views.wip.stale_hours` (0), `review_only` ("→ E-03" without the filled text); `review.stale_after_seconds` says validation "—" although schema `minimum: 1` and V-30 apply. Fix: give each invalid example
its exact line; set the validation cell to "schema (≥ 1); V-30".

### R2-032 | MINOR | `roles.<r>` with only `when_empty`; predicate `{"exact": true}` alone

Both pass the schema; §4.2 only covers "two keys", V-24 only "exactly one key besides `exact`". Fix: §4.2: "`when_empty` is allowed only
with `entry_rule_teams`: `roles.<r>.when_empty: needs entry_rule_teams`"; V-24: "a predicate with no test key: `<path>: a predicate
has exactly one test key (found none)`".

### R2-033 | MINOR | §4.3 `create.priority_by_severity`

Undefined: severities other than `normal`/`critical`, and whether the number is a 0-based rank that shifts other items. Fix: "an item
whose severity has no number goes to the end; the number is the 0-based queue rank, later items shift by one".

### R2-034 | MINOR | §4.6 `arguments` key `value`; `records_rules`; `sets_rules[].records`

`value` is not explained (the flag value?). `records_rules` says "text template / rules" (first match? required last rule without
`when`?). The precedence of `sets_rules[].records` over `records`/`records_rules` is not given. Fix: "`value`: the step's flag value";
"`records_rules`: first rule whose `when` holds; none holds: no body text"; "`sets_rules[].records`, when the rule is chosen, replaces
the step's `records`".

### R2-035 | MINOR | vague wording in key definitions

`texts.team_step`/`refine_how` "placeholders `<how>` and step hints"; §5.2 `dependencies_finished` "the target is `closed`-like";
REQ-909 "the convention's `in progress`-like word"; §4.5 "V-23-like rule". Fix: name the texts that use `<how>` and the exact
substitution; replace "closed-like" by "the target's status is a finished word"; REQ-909: name the Q-01 key that holds the word (Q-01
has none: add `"in_progress": "<word>"` or drop the status change).

### R2-036 | MINOR | team-name patterns

Team names (`teams` keys, define `name`) are `^[a-z0-9][a-z0-9:_-]{0,63}$`; `review[].team` and `refinement_review[].team` allow `.`
(`^[a-z0-9][a-z0-9._:-]{0,63}$`). Fix: use the team-name pattern in both.

### R2-037 | MINOR | §4.8 `limits` map form

Undefined: the format of map keys (`<owner/name>`, `<owner/name>:<branch>`, `<agent>`) and how a key is matched (exact? case?), the
`default` key, the `minProperties: 1` message (`must have at least 1 keys`), and an entry level the definition does not list (R2-011).
Fix: one row per level with key format, match rule and examples (`{"repository":{}}` → `teams.json: teams.t1.limits.repository:
matches none of the allowed forms`).

### R2-038 | MINOR | output texts the spec leaves open

REQ-009 success text (`✅ workflow <name> registered`, used by S-009-1) and `workflow <name> unchanged` (prefix, exit); REQ-008
`cannot read <path>: <code>` (`<code>` = Node `error.code`?); REQ-306 "the publication text naming the refusal"; the `--json` outputs
of `team define` and `team workflow` (today `{"ok":false,"errors":[…]}` / `{"ok":true,…,"status":"registered"}`, `src/team/cli.js`).
Fix: write each line literally in its REQ.

### R2-039 | MINOR | D-09 vs REQ-603; S-604-2

REQ-603 cites "level names: `member` replaces `agent`, D-09 list", but D-09 lists no such change; S-604-2 still expects "team and agent
work-in-progress limits". Fix: add the `agent` → `member` rename to D-09 with the affected keys (`limit`, `wip_override_lead`, …) and
update S-604-2, or remove the claim from REQ-603.

### R2-040 | MINOR | `minimal.json` key `team_not_configured`

D-09 and §8 make the team-not-configured text fixed machinery; the key in `minimal.json` is never read. Fix: delete it (no-dead-keys).

### R2-041 | MINOR | §6 orders and sets fixed by step name

Step 9 "combinable steps (`wip-override`, then `set-team`)" and step 1 "an empty value of a step that names a dependent" fix behaviour
by step name outside the file. Fix: "combinable steps run in the order of the step catalogue"; "a step whose `requires` has
`dependent_exists: flag_value` refuses an empty value with `empty_flag_value`".

### R2-042 | MINOR | §4.6 `verdicts` invalid-choice text

`argument --<step>: invalid choice: '<v>' (choose from <verdicts>)` does not say how `<verdicts>` is written; the CLI quotes every
choice (`'complete', 'reject'`) and includes the synonyms? Fix: "`<verdicts>` = the verdicts and `verdict_words` keys, each in single
quotes, in file order, joined by `, `".

## Decisions needed from the author (none from the owner)

None of the findings needs an owner answer: each has one fix that follows from the principle or the repository. R2-017 offers two
ways; the review recommends the first (keep exit 2 for the configuration commands and document the exception) because it changes no
consumer.
