# 03 — Specification: the team behaviour file and its generic enforcer

Status: draft for review. Binding inputs: the owner principle of 2026-11-08 (README of this plan folder), the rulings that still stand
(no aliases, no backwards compatibility, one behaviour per command, team behaviour only under `backlog team`, every command documented,
decision AO). Everything not decided here is an owner question in `08-owner-questions.md`; requirements that depend on an answer are
marked **CONDITIONAL on Q-nn** and carry the acceptance criteria of every option.

Reading order inside this file: §1 terms; §2 decisions taken by the analyst (with the logic); §3 files, discovery, versions; §4 the
key reference of every input; §5 the condition, predicate and value-source catalogues; §6 the enforcer's algorithm; §7 the user-command code;
§8 what the CLI may still hard-code; §9 the behaviours the shipped template must reproduce; §10 the requirements (REQ-nnn), each with
its acceptance criteria, the inventory groups it replaces, its scenarios (`04-bdd.md`, `features/`) and its tests (`05-tdd-plan.md`).

## 1. Terms

- **Behaviour definition** (also *workflow*): one JSON object of schema `backlog-team-behaviour/2`, registered under a name in
  `<home>/workflows.json`. It holds every enforced team rule: status words, steps, roles, conditions, review stages, limits semantics,
  queue order, views, what user commands may do to a bound item, and all texts.
- **Team entry**: one object in `<home>/teams.json` (schema `backlog-teams/2`): the workflow it uses, the names in three generic maps
  (`people`: key → one name, `lists`: key → names, `rules`: key → `[{team, count}]`, whose keys the definition's role sources name) and
  per-team numbers (review counts, limits, chunk scope). No entry key name is fixed in code (D-21).
- **Home**: the backlog home resolved by `resolveHome()` (the backlog repository clone or the in-repository `.backlog` folder).
- **Bound item**: an item whose front-matter `team` is a non-empty string after trimming. Its *team* is that string; its *definition*
  is the workflow named by that team's entry. **Unbound item**: every other item.
- **Command team**: the `--team` of a `backlog team` command (or its fallback, Q-04). **Actor**: the agent a step acts as (§4.6
  `actor`). **Caller**: the agent the session runs as (Q-04: `BACKLOG_AGENT` today).
- **Step**: a key of the definition's `steps`; its flag on `backlog team update` is `--<step name>` and its value kind is the step's
  `value` (D-25). No step name is fixed in code.
- **Refusal**: one line `❌ <text>` on standard output, exit code 1, nothing written (the existing refusal contract). **Invalid input**:
  `❌ backlog: <text>` on standard error, exit code 2.
- **Template**: a file shipped in `templates/team-behaviour/` of the CLI package. Templates are never read at run time.
- **User commands**: every `backlog` command that is not `backlog team ...` (for example `backlog list`, `backlog update`,
  `backlog done`, `backlog archive`). Their code lives in `src/shared/`. They let the user manage items freely and enforce nothing about
  flow, status words or team behaviour; they meet an item bound to a team only through the binding port (§7).

## 2. Decisions taken by the analyst (each can be overruled by the owner; none is an owner question because the principle or the repository answers it)

- **D-01 No shipped fallback at run time.** A team's behaviour lives outside the CLI (principle), so the enforcer reads only
  `<home>/workflows.json`. The shipped `team.json` becomes the template `templates/team-behaviour/team.json`, registered into a backlog by
  `backlog team migrate` (old backlogs) or by `backlog team workflow --file` (new ones). Logic: a fallback inside the package would be a
  behaviour the backlog did not choose.
- **D-02 Two registry files stay** (`teams.json` for names and numbers, `workflows.json` for behaviour), each with a top-level
  `schema` key and one map (`teams`, `workflows`). Logic: the existing commands `team define` and `team workflow` already split them, one
  behaviour may serve several teams, and a version key needs a wrapper object (no-backwards-compatibility: the old flat shape fails with
  the migrate message).
- **D-03 (replaced by D-25).** Steps keep the flags of today only because the template keeps today's step names.
- **D-04 One JSON Schema subset interpreter, zero dependencies.** The package has no runtime dependency; the schema files are standard
  JSON Schema 2020-12 restricted to the keywords listed in REQ-012, interpreted by a small module, plus the semantic rules V-01..V-41 and
  E-01..E-11 of §4.10 that JSON Schema cannot express. Logic: the validator is generic machinery (allowed), and a dependency for a few hundred lines
  is not warranted.
- **D-05 `backlog team validate` and `backlog team migrate` are new subcommands** of `backlog team`. Logic: the owner asked for a
  validation command (`backlog team validate <file>` given as example) and for migrate-or-fail; both act only on team files and items.
- **D-06 `team update` acts only on items bound to the command team**, except the binding step `set-team` on an unbound item. Logic:
  the mirror of decision AO — an unbound item's door is user `update`, a bound item's door is `team update` of its team (F13).
- **D-07 Binding an unbound item sets its status to the definition's `initial` word** (`set-team` with `binds: true`). Logic: today an
  unbound item's `pending` reads as `new` through the legacy translation, which is deleted (ST-LEGACY); binding must leave a word of the
  definition.
- **D-08 `set-team` refuses an unconfigured team name.** Logic: an item bound to an unknown team fails every later command (REQ-006); this
  is integrity of the binding, not flow.
- **D-09 Refusal texts move verbatim into the shipped template**, with these unavoidable changes (each listed in CHANGELOG): every text
  that printed `stage <x>` or `review_state <x>` prints `status <x>` (the derived fields are deleted); the texts that named `TEAM_LEAD`
  lose that word (REQ-206); the work-in-progress level `agent` is called `member` (texts `limit`, `wip_override_lead`, R2-039); E-02 reads `teams.<t>: <a> and <b> must not share a name (<name>)` (R2-003); the team-not-configured text for the command team stays fixed machinery text (no file exists to hold it).
- **D-10 Legacy data is migrated, never translated on read.** `backlog team migrate` rewrites old items and files once; every command
  that meets old data fails with the migrate message (REQ-011).
- **D-11 The user-command code reads no team file for unbound items**, and for bound items only through the binding port (REQ-901, REQ-902).
- **D-12 the example team's definition is converted, not replaced:** `<agent-skills>/team-lead/references/backlog-workflow.json` (workflow
  `example-team`) is migrated to schema 2 by `backlog team migrate --file` and registered; the shipped template keeps the generic names.
- **D-13 The work-in-progress limit numbers move into the team entry** (`limits`), and `wip-limits.json` is retired by the migration
  (F3: the entry's `wip` was never read). The user commands keep none (D-18).
- **D-14 `backlog.scope` moves into the team entry** (`chunk_scope`). The migration fails, listing the folders, when two folders hold
  different values for the teams that read them.
- **D-15 Unenforced keys of today's definition are not carried into schema 2** unless Q-05 says to implement them (F2); the template
  reproduces today's behaviour.
- **D-16 Exit code 3 for an idle `team pop`, the JSON keys of `team pop --json` and `team query --plan --json` stay machinery** (the
  consumer contract); the action names inside them come from the file.
- **D-17 Team commands own their path** (R1-001). `backlog team update|new|query|pop` run end to end in `src/engine/`; they import only
  the storage primitives (item codec, index, lock, publication, numbering, path safety; list in 05 §5) and never a command module of
  `src/shared/`. The modules of the user commands take no `team` parameter and no hook object; `src/shared/seam.js` and
  every consumer of it are deleted (REQ-941); the guard of REQ-905 detects parameters, imports of command modules and property
  assignments on imported objects (hooks and callbacks), not only words. Logic: the principle puts every team behaviour under
  `backlog team`; a hook in an ordinary command is team behaviour in that command.
- **D-18 No limit and no dependency gate outside a team** (R1-003; was Q-03). The user commands apply no
  work-in-progress limit and no dependency gate; `wip-limits.json` is migrated into team entries and retired (REQ-910). Logic: the
  principle says those commands enforce nothing about flow; decision AM keeps dependencies as data (stored, shown, integrity-checked),
  which stays.
- **D-19 Outside a team a status word is data** (R1-003). `backlog archive` never refuses because of the status; `backlog update
  --status` and `backlog new --status` store the word exactly as typed (no canonicalisation, `done` is not rewritten). The default words stay defaults only (D-33).
  Logic: refusing or rewriting a word is enforcement about status words (owner ruling on the user flow).
- **D-20 Holding an item outside a team refuses nothing** (R1-003, R1-027). If `backlog update --claim/--release/--close` stay, they
  write data only and never refuse for a reason other than syntax and never write `status`; no name (such as `owner`) is special.
  They stay (owner ruling on the user flow) and write the default words. Logic: refusing contradicts the ruling.
- **D-21 The team entry is generic** (R1-009). An entry is `{workflow, people, lists, rules, review, limits, chunk_scope}`; the
  definition's role sources name the keys (`entry_person`, `entry_list`, `entry_rule_teams`) and its `entry_constraints` state the
  composition rules (template: today's members non-empty, lead not a member, review_only ⊆ members). Logic: the principle forbids a
  fixed team-entry shape beyond what the schema declares as definition language.
- **D-22 No role name in the engine** (R1-008, R2-010). Queue roles are served in `queue.role_order`; plan assignment is
  `{pick, role, exclude_role, within_limits}`. Logic: "lead before member" fixed role names and precedence in code.
- **D-23 No field name in the engine** (R1-010). Every primitive that reads or writes an item field names it as a parameter
  (`review_passes_met`, `no_later_own_work`, `head_unless_covered`, `last_review_rejected`, `review.reject_clears`,
  `dependents_handoffs_accepted`, `effect.records_field`, `session.block_after_end.field`, `scope.foreign_items.when`); the completion
  stamp is `on_finish.sets` (template `{"completed":"now_if_empty"}`). The binding marker `team` is the one field the code names (§8).
- **D-24 No single-purpose token** (R1-011). `notice` becomes `notice_rules`, `create.ask` takes any field, `matches=estimate_or_dod`
  becomes `matches_rule=<rule names>`, `<reviewers_text>` comes from three refusal keys, `when_team` is a predicate (`team_count`),
  and the instructions the machinery picked by name are named in the file (`marked_instruction`, `on_finish.instruction`,
  `texts.conditional`, extra offers).
- **D-25 No step name in code** (R1-012, replaces D-03). Steps, their flags (`--<step name>`) and value kinds (`value`) come from the
  definition; a flag the definition does not define is refused with `step_not_defined`, or with the text `undefined_step_refusals`
  names for it (template: `--status` → `status_flag`). `combinable` and `binds` may be set on any step; combinable steps run in the
  order of `steps` in the file. Consumers keep their flags because the template keeps today's step names.
- **D-26 No reserved status word** (R1-005). `backlog archive` moves the file and does not change `status`; an archived item is
  recognised by its path. V-03 is withdrawn.
- **D-27 No run-time bridge; one cutover** (R1-017, R3-004, R3-005). The CLI never reads schema 1 and schema 2 side by side: `team
  migrate` lands first (additive, used only on throwaway homes), then one cutover commit switches every reader to schema 2 only, and
  the owner migrates the running backlog in the same maintenance window, with the team stopped (06 PH-3a..PH-3c). The engine phases
  follow on schema 2 data.
- **D-28 Every topology commit moves the CLI pin** (R3-003). While this plan runs, every commit of the topology repository sets
  `<deploy-tooling>/backlog-cli.pin` to the CLI commit live at that moment (pushed first), because its deploy reinstalls the pinned CLI.
- **D-29 A schema 1 definition converts to the template** (R3-001). Today a registered schema 1 definition governed no step (the code
  read the shipped definition), so the conversion keeps the template's behaviour and carries only the workflow name, description,
  review stage names (by position) and texts of keys the template has; a different vocabulary aborts. The old file's role word
  `owner` (the claimer) is the template role `holder`; the template role `owner` is the literal backlog owner (`--by owner`), as in
  today's code. Identity and scope are the template's (today the code applied them to every team).
- **D-30 Every item is migrated once to the stored keys** (R1-015, R1-018). The migration writes the stored keys and removes `stage` and
  `review_state` from every item, bound or not; afterwards the codec maps no earlier key and the edge state of a finished producer
  without a records field is `unrecorded` (a permanent meaning, not a legacy state).
- **D-31 Exit codes 0/1/2/3/4/5** (R2-016, R2-017, R2-018). Code 4 (repository not cloned) stays; the refusals of the configuration
  commands `team define`/`team workflow` are stderr exit 2.
- **D-33 Default words of the user commands** (owner ruling on the user flow; was Q-01). Built-in defaults in `src/shared/defaults.js`:
  new item `pending`; `list new` = `pending`, `new`; finished = `closed`, `done`, `archived` (`list done`, `archive done`); `list open` =
  every other word, an unknown word included; `backlog done` writes `closed`. Any other value is accepted and stored as typed; such an
  item is shown by `backlog list`, `backlog list open` and `backlog show <n>`. A user who wants enforcement defines a team named `user`.
- **D-32 Absent entry keys are read-time defaults** (R2-001, R2-006). A reader treats an absent key of an entry exactly as its default;
  no writer fills it in; E-07 checks only a `review` list written in the entry.

## 3. Files, discovery, versions

| file | schema id | written by | read by |
|---|---|---|---|
| `<home>/teams.json` | `backlog-teams/2` (`schema/teams.schema.json`) | `backlog team define`, `backlog team migrate` | every `backlog team` command; user commands meeting a bound item (port) |
| `<home>/workflows.json` | `backlog-workflows/2` (`schema/workflows.schema.json`) | `backlog team workflow --file`, `backlog team migrate` | the same |
| input of `team define --file` | `backlog-team-definition/2` (`schema/team-definition.schema.json`) | the user | `team define`, `team validate --file` |
| input of `team workflow --file` | `backlog-team-behaviour/2` (`schema/team-behaviour.schema.json`) | the user | `team workflow`, `team validate --file` |
| `.backlog/config.json` keys `team`, `user` | — | `backlog setup`, the user | team commands: the command team and agent after the flag (and per Q-04 the variables) (R1-032) |

Discovery: exactly these two paths under the home; no environment variable, no shipped file, no other folder (there is no
`BACKLOG_TEAM_DIR`; the inventory found no read of it). Precedence: none is needed (one source each). Versioning: the `schema` value
names the major version; a reader accepts exactly the version it implements. Old shapes (a flat map without `schema`, a definition
with `version: 1`) are *schema 1*. Missing, old and invalid files: REQ-005, REQ-006, REQ-011.

## 4. Key reference: every input, its type, default, validation, error text, readers and effect

**Error texts.** Structural problems found by the schema interpreter are printed as `<file>: <path>: <message>`, the message being one
of exactly these forms: `must be <type>` (object, array, string, boolean, whole number), `must be "<const>"`, `must be one of <a>, <b>,
...`, `must match <regex>`, `must not be empty`, `must be at least <n>`, `must have at least <n> entries`, `must have at least <n> keys`,
`entries must be distinct`, `missing key <k>`, `not a key of this object`, `matches none of the allowed forms`. `<path>` is the dotted
path inside the definition (array entries as `[i]`); in `workflows.json` it is prefixed by `workflows.<name>.`, in `teams.json` by
`teams.<team>.`. Semantic problems (V-nn for definitions, E-nn for team entries) print the text given in the tables. The invalid examples
below show the value and the exact line the validator prints for a definition read from `def.json`.

### 4.1 Identity and statuses (definition)

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `schema` | const `"backlog-team-behaviour/2"` | required | schema; another value: `schema: must be "backlog-team-behaviour/2"`; a file with `version: 1` and no `schema`: the migrate message of REQ-011 | every reader: selects the interpreter | — | `"backlog-team-behaviour/2"` / `"backlog-team-behaviour/1"` → `def.json: schema: must be "backlog-team-behaviour/2"` |
| `workflow` | string `^[a-z0-9][a-z0-9._:-]{0,63}$` | required | schema; registration also requires it to equal the name it is stored under | `team workflow --file` (the registry key), texts `<workflow>` | team entry `workflow` names it (E-01) | `"team"` / `"Team"` → `def.json: workflow: must match ^[a-z0-9][a-z0-9._:-]{0,63}$` |
| `description` | string | `""` | schema | `team workflow --show`, docs | — | `"..."` / `5` → `def.json: description: must be string` |
| `statuses` | array of distinct words `^[a-z][a-z0-9 -]{0,39}$`, ≥ 2 | required | schema; V-17 reachability: `no chain of steps leads from <w> to a finished word` | every team command: the vocabulary of bound items; `team query` columns | `initial`, `finished`, every `from`/`to` | `["new","closed","archived"]` / `["new","new"]` → `def.json: statuses: entries must be distinct` |
| `initial` | a word of `statuses` | required | V-01 `initial: <v> is not one of statuses` | `team new` writes it; `set-team` (binding) writes it; `to: "initial"` | `create.sets` may not set `status` (V-28) | `"new"` / `"draft"` → `def.json: initial: draft is not one of statuses` |
| `finished` | distinct words of `statuses`, ≥ 1 | required | V-02 `finished: <v> is not one of statuses` (V-03 withdrawn: no word is reserved, D-26) | dependencies, archive of bound items (archive-finished vs archive-unfinished), queue membership and re-densify of bound items, `team query` done counts | condition `dependencies_finished`, `user_commands.archive-*` | `["shipped"]` / `["gone"]` → `def.json: finished: gone is not one of statuses` |
| `side_statuses` | map word → `{enter, leave, returns_to}`; enter/leave step names, returns_to a word of `statuses` (R2-026) | `{}` | V-04 `side_statuses: <w> is also one of statuses`; V-05 `side_statuses.<w>.returns_to: <v> is not one of statuses`; V-06 `side_statuses.<w>.<enter|leave>: <step> is not defined in steps` | the words are statuses for every check; `returns_to` is the `to` of the `leave` step when that step's `to` is `previous` | `steps.<enter>.to` must be the side word (V-07) | `{"awaiting decision":{"enter":"request-decision","leave":"decision","returns_to":"refining"}}` / `{"ready":{...}}` → `def.json: side_statuses: ready is also one of statuses` |

### 4.2 Identity, scope and roles (definition)

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `identity.same_worker_pattern` | regular expression with exactly one capture group | absent: no continuation (an agent name matches only itself) | V-16 `identity.same_worker_pattern: needs exactly one capture group` / `...: not a valid regular expression (<message>)` | every predicate and condition with `field_is_actor`, `field_empty_or_actor` (without `exact: true`), holder counting, `heldBy`: two names are the same worker when both match and group 1 is equal | `exact: true` on a test ignores it | `"^(.+):\\d+$"` / `"^.+:\\d+$"` → `def.json: identity.same_worker_pattern: needs exactly one capture group` |
| `identity.caller_acts_only_as_itself` | `false` or `{except_roles: [role]}` | `false` | V-09 for the roles | every step of `team update`, `team pop`: when the caller is known (Q-04) and has none of `except_roles`, an actor different from the caller is refused with `caller_not_actor` | runs after binding and scope checks (§6) | `{"except_roles":["lead"]}` / `{"except_roles":"lead"}` → `def.json: identity.caller_acts_only_as_itself: matches none of the allowed forms` |
| `scope.bind_session` | boolean | `false` | schema | every `team` write and `team pop`: when the session names a repository (and branch), an item outside it is refused with `outside_scope`; `team pop --branch` must equal the bound branch (`session_branch`) | Q-04 decides where the session scope comes from | `true` / `"yes"` → `def.json: scope.bind_session: must be boolean` |
| `scope.session_team_only` | boolean | `false` | schema | `team update`, `team pop`, `team query` views: an item bound to a team other than the command team is refused with `other_team` (writes) or not listed (reads) | D-06 | `true` / `1` → `def.json: scope.session_team_only: must be boolean` |
| `scope.foreign_items` | `{when: predicate}` | absent: another folder's items are never offered | schema; V-07, V-24 | `team pop` and the views with scope `all`: items of another repository folder are offered only when `when` holds (R1-010) | entry `chunk_scope` caps the scope | `{"when":{"field_true":"chunk"}}` / `"chunk_only"` → `def.json: scope.foreign_items: must be object` |
| `roles` | map role name `^[a-z][a-z0-9-]{0,39}$` → exactly one source (§5.4) | required, ≥ 1 | V-10 `roles.<r>.union: <x> is not defined in roles` / `roles.<r>: union cycle through <x>` / `roles.<r>: a role has exactly one source`; V-36 `roles.<r>.when_empty: needs entry_rule_teams` | `by`, `not_by`, `actor_has_role`, `actor_lacks_role`, `flag_value_lacks_role`, review stage `reviewers`, `except_roles` | every role referenced must be defined (V-09) | `{"lead":{"entry_person":"lead"}}` / `{"lead":{"entry_person":"Lead"}}` → `def.json: roles.lead.entry_person: must match ^[a-z][a-z0-9_]{0,39}$` |

| `entry_constraints` | array of one-key objects: `{non_empty: k}`, `{disjoint: [k1, k2, ...]}`, `{subset: [k1, k2]}`; k = a `people` or `lists` key | `[]` | schema (`must have at most 1 keys`) | `team define`, `team validate`, every read of `teams.json`: E-11 `teams.<t>.lists.<k>: must not be empty (workflow <w>)`, E-02 `teams.<t>: <a> and <b> must not share a name (<name>)`, E-03 `teams.<t>.lists.<a>: <name> is not in <b>` (R1-009, R2-003) | template = today: non_empty members, disjoint lead/members, subset review_only ⊆ members | `[{"non_empty":"members"}]` / `[{"non_empty":"members","subset":["a","b"]}]` → `def.json: entry_constraints[0]: must have at most 1 keys` |

### 4.3 Completeness and creation (definition)

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `completeness` | array of rules `{name, test, field?, body_pattern?, section?, placeholders?, remove?, ignore_lines?}`; `test` ∈ `non_empty`, `present`, `positive_integer`, `section` | `[]` (every item complete) | V-26 `completeness[<i>]: test <t> needs field` / `test section needs section`; V-16 for each regex (`body_pattern` exactly one group) | predicates `complete`/`incomplete`, condition `complete`, edit rules, `team query --phase --json` key `missing` (the `name` of each failing rule, in order), `<missing>` placeholder | V-25: `complete`/`incomplete` used with an empty list → `<path>: complete needs completeness rules` | §5.6 semantics / `{"name":"x","test":"section"}` → `def.json: completeness[0]: test section needs section` |
| `create.sets` | map field → value source | `{}` | V-28 value sources; `status` not allowed: `create.sets.status: the status of a new item is initial` | `team new`: applied after the user fields | `initial` is written as status | `{"refiner":""}` / `{"status":"ready"}` → `def.json: create.sets.status: the status of a new item is initial` |
| `create.missing_section` | `{heading, placeholder}` | absent: nothing appended | schema | `team new`: when the body has no section named `heading` that the completeness `section` test accepts, `## <heading>\n\n<placeholder>` is appended | the placeholder should be in that rule's `remove` list | `{"heading":"Definition of done","placeholder":"- [ ] <machine-checkable acceptance>"}` / `{"heading":""}` → `def.json: create.missing_section.heading: must not be empty` |
| `create.ask` | array of `{field, label}` | `[]` | schema | `team new --ask`: asks each label on a terminal after the questions of `backlog new --ask` and writes the answer into `field` (R1-011) | REQ-702 | `[{"field":"review_refs","label":"Review documents"}]` / `[{"flag":"review-refs","label":"x"}]` → `def.json: create.ask[0]: missing key field` |
| `create.priority_by_severity` | `{normal?: n ≥ 0, critical?: n ≥ 0}` | `{}` (a new item goes to the end) | schema | `team new` without `--priority`: the 0-based queue rank for the item's severity, later items shift by one; a severity without a number goes to the end (R2-033) | `--priority` wins | `{"critical":0}` / `{"critical":-1}` → `def.json: create.priority_by_severity.critical: must be at least 0` |

### 4.4 Review (definition)

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `review.stages_order` | distinct stage names, ≥ 1 | required when any step has `stages` or the definition uses review predicates | V-13 `steps.<s>.stages.<st>: stage is not in review.stages_order` | the order of stages; `first_review_stage`, `next_review_stage_if_satisfied` | team entry `review` lists stages (E-04) | `["peer","external"]` / `[]` → `def.json: review.stages_order: must have at least 1 entries` |
| `review.stages.<st>.ready` / `.active` | status words | required per stage | V-18 `review.stages.<st>.ready: <w> is no status of this workflow` | ready = word after a request for that stage; active = word while reviewing it | start-review leg `to` must be `active` (V-18 `steps.start-review.stages.<st>.to: must be review.stages.<st>.active`) | `"ready for review"` / `"waiting"` → `def.json: review.stages.peer.ready: waiting is no status of this workflow` |
| `review.stages.<st>.reviewers` | role | required | V-09 | who counts as an eligible reviewer for the stage's passes, unless the entry rule names a `team` | E-07 | `"team"` / `"nobody"` → `def.json: review.stages.peer.reviewers: role nobody is not defined in roles` |
| `review.stages.<st>.default_count` | whole number ≥ 1 | required | schema | passes needed when the entry rule gives no count (never: entry rules require count) and for `defaults.review` | — | `1` / `0` → `def.json: review.stages.peer.default_count: must be at least 1` |
| `review.after_last_stage` | status | required | V-18 | `to` after the last stage of the entry's list is satisfied, and after `request-review` when the entry lists no stage | — | `"review complete"` / `"done"` → `def.json: review.after_last_stage: done is no status of this workflow` |
| `review.reject_clears` | `{verdict, field}` | absent: no verdict clears passes | schema | the named verdict of every review step empties `field` (all stages) (R1-010) | verdict `clears` may also name it | `{"verdict":"reject","field":"reviews"}` / `{"verdict":"reject"}` → `def.json: review.reject_clears: missing key field` |
| `review.stale_after_seconds` | whole number ≥ 1 | required when a `stale` predicate is used | schema (≥ 1); V-30 `<path>: stale needs review.stale_after_seconds` (R2-031) | predicate `stale`: a review whose `review_started` is older is stale | replaces `BACKLOG_REVIEW_STALE_SECONDS` | `1200` / `0` → `def.json: review.stale_after_seconds: must be at least 1` |
| `defaults.review` | array of `{stage, count ≥ 1}` | `[]` | V-19 `defaults.review[<i>].stage: <s> is not in review.stages_order` / `defaults.review: a stage is listed twice` | read for an entry without `review` at every read (read-time default, D-32); nothing writes it into an entry (R2-001) | entry `review` overrides wholly; E-07 never checks it | `[{"stage":"peer","count":1}]` / `[{"stage":"qa","count":1}]` → `def.json: defaults.review[0].stage: qa is not in review.stages_order` |

### 4.5 Limits, active work, waiting (definition)

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `limits.count_scope` | `home` \| `team` | required in `limits` | schema | `home`: every item of every repository folder of the home that matches `active_item` counts (today's behaviour, user items included); `team`: only items bound to a team using this workflow | — | `"home"` / `"all"` → `def.json: limits.count_scope: must be one of home, team` |
| `limits.active_item` | predicate | required in `limits` | V-07, V-24 | what counts as work in progress | `holder` names whose it is | template value / `{}` → `def.json: limits.active_item: must have at least 1 keys` |
| `limits.holder` | array of `{field, when?}`, ≥ 1 | required in `limits` | schema | the holder of an active item for the `member` level: the first entry whose `when` holds and whose field is non-empty | `same_worker_pattern` applies | `[{"field":"claimed_by"}]` / `[]` → `def.json: limits.holder: must have at least 1 entries` |
| `limits.levels` | distinct of `overall`, `repository`, `branch`, `team`, `member` | required in `limits` | schema | the levels this definition knows; numbers come from the entry's `limits` | a condition naming a level not listed: V-23 `<path>: level <l> is not in limits.levels` | `["overall","team"]` / `["agent"]` → `def.json: limits.levels[0]: must be one of overall, repository, branch, team, member` |
| `limits.override` | `{field, lifts: [level]}` | absent: no override | schema | when the item's `field` is non-empty, the listed levels are skipped | `steps.wip-override.sets` writes the field | `{"field":"wip_override","lifts":["team","member"]}` / `{"field":"wip_override"}` → `def.json: limits.override: missing key lifts` |
| `active_work` | `{any: [predicate], except?: predicate}` | absent: a condition `actor_active_items_at_most` is refused by V-23 `<path>: actor_active_items_at_most needs active_work` | V-07 | an item held by the actor (holder fields, same worker) counts as active work when one `any` predicate holds and `except` does not | — | template value / `{"any":"x"}` → `def.json: active_work.any: must be array` |
| `waiting.field` | field name | required in `waiting` | schema | the wait marker the `waiting` step sets (`since_field` deleted: no machinery effect, R2-008) | — | `"wait_on"` / `"Wait"` → `def.json: waiting.field: must match ^[a-z][a-z0-9_]{0,63}$` |
| `waiting.cleared_by_note` | boolean | required in `waiting` | schema | true: a `--note` by the holder clears a set wait marker like a step of `cleared_by_steps` (R1-031) | — | `true` / `"yes"` → `def.json: waiting.cleared_by_note: must be boolean` |
| `waiting.record` | text template | absent: no body line | V-12 | appended to the body when a wait marker is cleared (R1-031) | — | `"WAIT DONE <now>"` / `"<who_knows>"` → `def.json: waiting.record: placeholder <who_knows> is unknown` |
| `limits.held_shown` | whole number ≥ 1 | 8 | schema | how many holders `<held>` lists before `, ...` (R1-014) | — | `8` / `0` → `def.json: limits.held_shown: must be at least 1` |
| `waiting.cleared_by_steps` | distinct step names | required in `waiting` | V-20 `waiting.cleared_by_steps: <s> is not defined in steps` | after one of these steps by the holder, a set wait marker is cleared and `waiting.record` is appended to the body | `waiting.cleared_by_note: true` clears it on a `--note` too | `["close"]` / `["finish"]` → `def.json: waiting.cleared_by_steps[0]: finish is not defined in steps` |

### 4.6 Steps (definition) — `steps.<name>`

Step names come from the file (`^[a-z][a-z0-9-]{0,39}$`, D-25); the flag of step `<s>` on `backlog team update` is `--<s>`, its
value (if any) is the *flag value*; a flag that is neither a step of the definition nor a request part of §5.5 is refused with the text
`undefined_step_refusals.<flag>` names, else `step_not_defined`. The template keeps today's names (`claim`, `release`, `waiting`,
`waiting-done`, `handoff`, `accept-handoff`, `reject-handoff`, `request-review`, `start-review`, `review`, `reassign`, `reassign-review`,
`refine-start`, `refine-done`, `request-refinement-review`, `refinement-review`, `request-decision`, `decision`, `close`, `wip-override`,
`set-team`), so consumers keep their flags.

| key | type / allowed | default | validation and error | effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `value` | `none` \| `text` \| `agent` \| `item` \| `team` \| `word` \| `verdict` | `none` | schema; V-34 `steps.<s>.to: flag_value needs value word`; V-35 `steps.<s>.value: verdict needs verdicts` | the value the flag takes: none (a switch), free text, an agent name, an item id, a team name, a status word of the definition (invalid word: exit 2, REQ-113), a verdict (after `verdict_words`) | `actor: flag_value` reads it | `"agent"` / `"person"` → `def.json: steps.claim.value: must be one of none, text, agent, item, team, word, verdict` |
| `actor` | `by` \| `by_or_holder` \| `flag_value` \| `by_or_flag_value` | `by` | schema | who the step acts as: `--by` (the command's `--agent` when absent, as `team update` fills it today); `by_or_holder`: `--by` given explicitly, else `claimed_by`; `flag_value`: the step's value (claim); `by_or_flag_value`: an explicit `--by`, else the value (release) | `caller_acts_only_as_itself` compares the actor | `"flag_value"` / `"agent"` → `def.json: steps.claim.actor: must be one of by, by_or_holder, flag_value, by_or_flag_value` |
| `from` | words or `["*"]` | required unless `stages` | V-07 `steps.<s>.from: <w> is no status of this workflow`; V-08 `steps.<s>.from: "*" must be the only entry` | the step runs only from these words (`*`: any word, finished ones included); else `from_refusal` or `wrong_status` (+ hints) | `variants`, `skip_from_when` | `["ready"]` / `["*","new"]` → `def.json: steps.claim.from: "*" must be the only entry` |
| `to` | a word, or a token `same`, `previous`, `initial`, `first_review_stage`, `next_review_stage_if_satisfied`, `active_review_stage`, `flag_value` (the flag value; needs `value: word`; V-07 is skipped for it, R1-020, R2-007) | required unless `to_rules`, `verdicts` or `stages` give it (V-14 `steps.<s>: needs to, to_rules, verdicts or stages`) | V-07 | the status after the step (§6 step 13) | `previous` = the side status's `returns_to` | `"in progress"` / `"later"` → `def.json: steps.claim.to: later is no status of this workflow` |
| `to_rules` | array of `{when?, to}`, first match wins | absent | V-07; last rule without `when` required: `steps.<s>.to_rules: the last rule needs no when` | replaces `to` | — | template release / `[{"when":{"status_in":["x"]},"to":"same"}]` → `def.json: steps.release.to_rules: x is no status of this workflow` and `def.json: steps.release.to_rules: the last rule needs no when` |
| `by` | roles, ≥ 1 | required (in the step or in each stage leg) | V-09 | the actor must hold one of the roles, else `by_refusal` or `wrong_actor` (`<who>` = the role names joined by " or ") | roles §5.4 | `["member","lead"]` / `[]` → `def.json: steps.claim.by: must have at least 1 entries` |
| `not_by` | roles | `[]` | V-09 | an actor holding one of these roles is refused with `not_by_refusal` (default `wrong_actor`) | checked right after `by` | `["author"]` / `"author"` → `def.json: steps.review.not_by: must be array` |
| `by_refusal`, `not_by_refusal`, `from_refusal` | refusal keys | the core keys | V-11 `<path>: refusal <k> is not in refusals` | the text printed for that check | — | `"self_review"` / `"Self"` → `def.json: steps.review.not_by_refusal: must match ^[a-z][a-z0-9_]{0,63}$` |
| `from_refusal_hints` | array of `{when, hint}` | `[]` | V-11 | appended to the from refusal when `when` holds (first match) | — | template claim |
| `skip_from_when` | predicate | absent | V-07 | the from check is skipped when it holds | — | `{"field_empty":"claimed_by"}` |
| `variants` | array of `{when, from?, to?, by?}` | `[]` | V-07, V-09 | the first variant whose `when` holds replaces those keys | evaluated before any check | template claim (lead's work item) |
| `arguments` | map of `value`, `note`, `summary`, `reason`, `comments`, `checks`, `handoff-commit`, `handoff-contract`, `handoff-verification`, `handoff-outputs`, `handoff-pickup`, `handoff-risks` → `{required, refusal?, cites_field?, cites_refusal?, order?}`; `value` is the step's flag value (R2-034); `order` ∈ `first` (checked at §6 11(b)), absent = §6 11(f) (R2-008) | `{}` | schema; V-11 | a required argument that is missing or blank after trimming is refused (`refusal`, default `missing_argument` with `<argument>`); `cites_field`: the text must contain one entry of that list field (passes when the list is empty), else `cites_refusal` | `order` §6 | `{"note":{"required":true}}` / `{"notes":{"required":true}}` → `def.json: steps.refine-done.arguments.notes (name): must be one of value, note, summary, reason, comments, checks, handoff-commit, handoff-contract, handoff-verification, handoff-outputs, handoff-pickup, handoff-risks` |
| `requires` | array of conditions §5.1 | `[]` | V-24, V-11 | evaluated in order (§6) | — | §5.1 |
| `recheck_at_publication` | array of conditions | `[]` | as `requires` | evaluated again against the merged files when the change is published; a failure rolls the publication back (exit 3, the existing publication text with the refusal) | today: claim | template claim |
| `sets` | map field → value source §5.3 | `{}` | V-28 `<path>: <v> is no value source`; `status` not allowed (`to` sets it): `steps.<s>.sets.status: the status is set by to` | fields written | `clears` after `sets` | `{"claimed_by":"actor"}` / `{"claimed_by":"me"}` → `def.json: steps.claim.sets.claimed_by: me is no value source` |
| `sets_rules` | array of `{when?, sets, records?}`, first match | absent | V-28 | like `sets`, chosen by condition; the chosen rule's `records` replaces the step's `records`/`records_rules` (R2-034) | — | template decision |
| `clears` | distinct fields | `[]` | schema | fields set to `""` (lists to `[]`) | — | `["wait_on"]` |
| `appends` | map list-field → value sources | `{}` | V-28 | each non-empty value is removed from the list if present and appended at the end | — | `{"session_authors":["field:claimed_by","actor"]}` |
| `records` / `records_rules` | text template / array of `{when?, records}`, first rule whose `when` holds; none holds: no body text (R2-034) | absent: no body text | V-12 placeholders | appended to the body after a blank line; its first line (without `#` and spaces) is the headline of the update line | — | `"Claimed by <actor> at <now>"` / `"<who_knows>"` → `def.json: steps.claim.records: placeholder <who_knows> is unknown` |
| `stages` | map stage → leg `{from, to?, by}` | absent | V-13, V-18 | start-review and review: the stage is the stage whose `ready` or `active` word the item carries | step-level `not_by`, `requires`, `sets` apply to every leg | template |
| `verdicts` | map verdict `^[a-z]+$` → `{to, sets?, clears?, appends?, notice_rules?, records_verdict?, ends_session?}`; `records_verdict` is the text placed in `<records_verdict>` of the step's `records` (R2-008) | absent | V-14, V-07 | the flag value names the verdict (after `verdict_words`); an unknown verdict is invalid input (exit 2) `argument --<step>: invalid choice: '<v>' (choose from <verdicts>)`, `<verdicts>` = the verdict and `verdict_words` keys, each in single quotes, in file order, joined by `, ` (R2-042) | — | template review |
| `verdict_words` | map word → verdict | `{}` | V-15 `steps.<s>.verdict_words.<w>: <v> is not a verdict of the step` | synonyms accepted on the command line | — | `{"pass":"complete"}` |
| `effect` | `{kind: handoff_record \| handoff_accept \| handoff_reject, records_field}` | absent | schema | the hand-off record or receipt is built (format §8) and stored in `records_field` (R1-010); any step may carry it (D-25) | — | `{"kind":"handoff_record","records_field":"handoffs"}` / `"handoff_record"` → `def.json: steps.handoff.effect: must be object` |
| `exclusive` | boolean | `false` | schema | no field edit, note, append or section may accompany the step (`edit_exclusive`) | — | `true` |
| `combinable` | boolean | `false` | schema (any step, D-25) | may accompany one other step in the same call; combinable steps run first, in the order of `steps` in the file | — | `true` |
| `binds` | boolean | `false` | V-27 `steps.<s>: a binding step needs to or to_rules` | the step may run on an item outside a team (D-06) | `to_rules` `unbound` | `true` |
| `ends_session` | `{who: "actor", except_roles}` | absent | V-09 | after the publication the last line is `session.end_text` with `<agent>` = the actor, unless the actor holds an excepted role | Q-05/REQ-114 `block_after_end` | template |
| `notice_rules` (verdict) | array of `{when?, instruction}` | absent: no notice | V-11, V-07 | printed after the update line: the instruction of the first rule whose `when` holds on the item after the step (R1-011, R2-009; the step-level `notice` key is deleted) | — | template `review.complete` (four rules: `next_status`, `next_rules_pending`, `close_now_unheld`, `close_now`) |
| `undefined_step_refusals` (top level) | map flag name → text key | `{}` | V-11; V-37 `undefined_step_refusals.<s>: <s> is defined in steps` | the refusal of a flag the definition does not define (template `{"status":"status_flag"}`) | — | `{"status":"status_flag"}` |
| `on_finish` (top level) | `{sets?: map field → value source, instruction?: text key}` | absent | V-28, V-11 | when a step makes the status a finished word: `sets` written, then `instruction` printed after the update line (template `{"sets":{"completed":"now_if_empty"},"instruction":"completion_ender"}`; R1-010, R2-002) | — | template |

### 4.7 Edit rules, queue, views, commands outside a team, session, texts (definition)

Container keys (R2-014): `identity`, `scope`, `create`, `review`, `limits`, `waiting`, `queue`, `views`, `session`, `texts`, `on_finish`
are optional objects; absent means: `identity` = both defaults; `scope` = no session scope, no team limit, no foreign items; `create` =
nothing added; `review` = no review stage (a step with `stages` or a review predicate is then V-38-like `review: missing (needed by
<path>)`); `limits` = no limit (a `within_limits*` is then `limits: missing (needed by <path>)`); `waiting` = no wait marker; `queue` =
`team pop` prints `❌ backlog: team pop: workflow <w> defines no queue` (stderr, exit 2) and `team query --plan` prints `❌ backlog: team
query --plan: workflow <w> defines no queue.plan` (exit 2); `views` = no view; `session` = no session end line; `texts` = flags only.

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| `edit_rules` | array of `{when, request_has, unless_request_has?, allow?, refusal}` | `[]` | V-11; selectors of §5.5: `edit_rules[<i>].request_has[<j>]: <s> is no request selector` | `team update` before any step: the first rule whose `when` holds (item as before the call) and whose `request_has` matches a part of the request that `allow` does not list refuses with `<flags>` = the offending parts; `unless_request_has`: the rule does not apply when the request also has one of these selectors (R2-008) | evaluated after the actor (§6 step 8) | template / `[{"when":{},"request_has":["x"],"refusal":"edit_frozen"}]` → `def.json: edit_rules[0].when: must have at least 1 keys` and `def.json: edit_rules[0].request_has[0]: x is no request selector` |
| `queue.scope_default` | `branch` \| `repo` \| `all` | `branch` | schema | `team pop` without `--scope` | the entry `chunk_scope` caps chunk offers | `"branch"` / `"world"` → `def.json: queue.scope_default: must be one of branch, repo, all` |
| `queue.role_order` | distinct roles that are keys of `queue.roles` | required when `queue.roles` has more than one key | V-33 `queue: role_order is required when queue.roles has more than one key` / `queue.role_order: <r> is not a key of queue.roles` | an actor holding several queue roles is served by the first listed role that has an answer (D-22, R1-008, R2-010) | — | `["lead","member"]` / `["boss"]` → `def.json: queue.role_order: boss is not a key of queue.roles` |
| `queue.reorder_scope` | `all` \| `command_team` | `all` | schema | a rank change or re-densify by a `backlog team` command re-orders every item (`all`) or only the command team's (`command_team`) (R1-007, REQ-807) | template `command_team` = today | `"command_team"` / `"team"` → `def.json: queue.reorder_scope: must be one of all, command_team` |
| `queue.roles.<role>.offers[]` | `{action, select, instruction, when_actor?, when_team?, mark?, holder_field?, marked_instruction?, try_each?, skipped_instruction?, scope?, otherwise_instruction?, preempts?}` | required per role | V-09, V-11, V-21 `queue.roles.<r>.offers[<i>].mark: <s> is not defined in steps` | `team pop`: the first offer whose `when_actor` (predicate on the actor) and `when_team` (predicate over the team, e.g. `team_count`) hold and whose `select` matches an item (queue order: priority, then seq) answers with `action` and the filled `instruction`; `mark` runs that step through §6 as the actor before answering and fills `holder_field`, then prints `marked_instruction`; `try_each`: every matching item is tried in queue order until a mark succeeds, each refusal listed with `skipped_instruction` (JSON key `skipped`); `scope` = `branch`/`repo`/`all`/`entry_chunk_scope` (the entry's `chunk_scope`); `otherwise_instruction`: the answer when the offer is reached but `select` matches nothing; `preempts[]` = `{action, unless?}`: a later offer replaces an earlier answer of that action whose item does not match `unless` (R2-008, R1-026, R1-028, R3-015) | — | template |
| `queue.roles.<role>.busy_when`, `busy_instruction`, `idle_instruction` | predicate (evaluated over the team: `team_count`, actor tests), text keys | `idle_instruction` required | V-11 | idle answer (exit 3); when `busy_when` holds, the offers after the first answer are replaced by the busy answer | — | template |
| `queue.plan.passes[]` | `{action, select, assign, instruction, reason, limit?}`; `assign` = `{pick: holder\|role\|first_idle\|least_loaded, role?, exclude_role?, within_limits?: levels}` | required when `team query --plan` is used | V-09, V-11 | `team query --plan`: passes in order give each team member at most one entry (`member, action, item, seq, instruction, reason, key`); `holder`: the item's holder (`limits.holder`); `role`: the single person of `role`; `first_idle`: the first idle agent of `role` in roster order (people then lists in entry order) not holding `exclude_role` for the item; `least_loaded`: the agent of `role` holding the fewest active items, ties by roster order, only if within the `within_limits` levels; `limit`: at most that many entries of the pass; `reason`: printed as written (no placeholders) (R1-008, R2-008) | — | `{"pick":"role","role":"lead"}` / `{"pick":"lead"}` → `def.json: queue.plan.passes[0].assign.pick: must be one of holder, role, first_idle, least_loaded` |
| `queue.plan.skip_items` | predicate | none skipped | V-07, V-39 | items never planned | — | template |
| `views.<name>` | `{select?, fields, counts_limits?, stale_hours?}`; name `^[a-z][a-z0-9-]{0,39}$` | absent: `team query --<name>` is invalid input `❌ backlog: view <name> is not defined by workflow <w>` (stderr, exit 2, R2-024) | V-07, V-39; `views.<v>: missing key select` unless `counts_limits` | `team query --<name>` lists the bound items of the command team in scope matching `select`, with the columns and JSON keys `fields` (R1-016; `review_state` is no column); `counts_limits: true` prints the counts per level of the entry `limits` and lists items whose `last_updated` is older than `stale_hours` | — | template views `claimable`, `reviewable`, `blocked`, `decisions`, `wip` / `{"select":{"status_in":["ready"]}}` → `def.json: views.x: missing key fields` |
| `user_commands.<op>` | `{allow, refusal?}` for each of `update`, `update-replan`, `done`, `archive-unfinished`, `archive-finished`, `archive-done`, `move-branch`, `move-repository`, `import`, `import-higher`, `clean`, `new-split-from` | all twelve required | V-22 `user_commands.<op>: allow false needs refusal` | the binding port (§7): a user command whose operation meets a bound item is refused with the text, or proceeds | — | template |
| `session.end_text` | text with `<agent>` | required in `session` | V-12 | printed after a step with `ends_session` | — | template |
| `session.block_after_end` | `{field}` | absent: nothing recorded or checked | schema | REQ-114: ended sessions are recorded in `field` and refused later (`session_ended`) (R1-010) | Q-04 caller session | `{"field":"ended_sessions"}` / `true` → `def.json: session.block_after_end: must be object` |
| `texts.team_step`, `texts.refine_how` | text templates | absent: the how-text prints the step flags only | V-12 | `<how>` in the instructions that name the next command: `team_step` filled with `<flags>` = the step flags; `refine_how` is the `<how>` of the refinement instructions (`refine_start`, `refine_continue`, `lead_refine_incomplete`) (R2-035) | — | template |
| `texts.list_cap` | whole number ≥ 1 | 5 | schema | `<list>` of the port names the first `list_cap` slugs then `and <n> more` (R1-014) | — | `5` / `0` → `def.json: texts.list_cap: must be at least 1` |
| `texts.conditional.<name>` | `{when, text}` | `{}` | V-11, V-07 | defines the placeholder `<name>`: the filled text `text` when `when` holds on the item, else empty (template: `claim_first`, `dod`, `refs_note`, `stale_hint`; R2-002) | the name must not be a filled placeholder | template |
| `refusals` | map key → text; the keys of §4.7a are declared in the schema with their required-when | required; the nine core keys always | V-12 placeholders; V-11 every referenced key present; V-31 machinery keys required by the features used; V-32 a key is defined once across `refusals` and `instructions` | every refusal of the enforcer and of the port | — | template (116 keys + 3) |
| `instructions` | map key → text | `{}` | V-12; V-11 | `team pop`, `team query --plan`, notices | — | template (34 keys) |

**Placeholders (V-12, R2-015).** *Filled* placeholders (value given by the machinery; the empty value is ""): `<item> <slug> <seq> <status>
<step> <from> <who> <actor> <caller> <agent> <value> <team> <item_team> <session_team> <workflow> <holder> <holder_or_nobody>
<holder_or_author> <claimed_at> <refiner> <refiner_or_nobody> <refine_started> <reviewer> <reviewer_if_active> <review_started>
<reviewed_at> <lead> <list> <belong> <n> <missing> <how> <review_refs> <stage> <verdict> <VERDICT> <records_verdict> <need> <have>
<reviewers_text> <reason_text> <level> <of> <limit> <count> <held> <hint> <limit_text> <dependents> <dependent> <edges> <state>
<command> <flags> <repository> <branch> <bound> <cwd> <forced> <teams> <argument> <id> <where> <note> <summary> <reason> <comments>
<comments_line> <now> <today> <work_commit> <first> <repositories> <seqs> <review_refusal> <idle_reason> <claim_refusal>
<actor_or_none> <actor_or_nobody> <sha> <role>` and every name of `texts.conditional`; their values are the table of 05 §3, which is
part of this specification. *Literal* tokens printed as written (instructions to the reader): `<you> <why> <what> <text> <outcome>
<time> <result> <minutes> <answer> <member> <findings>` and every `<...>` that is not a single lowercase word (`<ids|none>`, `<the
commit>`, `<the team lead>`). A single lowercase word that is neither filled nor literal is V-12 `<key>: placeholder <x> is unknown`.

### 4.7a Machinery text keys (R2-002)

The machinery prints these keys without a step naming them; each is required when the definition uses the feature (V-31
`refusals: missing key <k> (required by the features it uses)`). Every other text the machinery prints is named in the file
(`notice_rules`, `marked_instruction`, `skipped_instruction`, `on_finish.instruction`, `texts.conditional`, `undefined_step_refusals`,
offers). The schema declares each key with this condition and its placeholders.

| key | printed when | required when | placeholders |
|---|---|---|---|
| `wrong_status`, `wrong_actor`, `missing_argument`, `step_not_defined`, `one_step`, `empty_flag_value`, `not_team_item`, `other_team` | the §6 checks of that name | always | see the template texts |
| `create_status_flag` | `team new --status` | always | `<team>` |
| `caller_not_actor`, `pop_caller` | a step / `team pop` acts for another agent | `identity.caller_acts_only_as_itself` is an object | `<caller> <actor> <step> <item>` / `<caller> <agent>` |
| `edit_exclusive` | an exclusive step with other parts | a step has `exclusive: true` | `<step> <item> <flags>` |
| `outside_scope`, `session_branch` | an item / `--branch` outside the session scope | `scope.bind_session` is true | `<item> <repository> <branch> <bound>` / `<branch> <bound>` |
| `pop_session_team` | `team pop --team` other than the session team | `scope.session_team_only` is true | `<session_team> <team>` |
| `session_ended` | a step by an ended session | `session.block_after_end` is set | `<agent> <item>` |
| `limit_hint` | `<hint>` of the `limit` text for a lifted level | `limits.override` and a `within_limits` condition | `<item> <team> <lead>` |
| `close_gate_edge`, `close_gate_none_record`, `close_gate_missing_hint` | the close gate | a `dependents_handoffs_accepted` condition | `<dependent> <state> <command>` / `<actor> <now>` / `<item> <dependent>` |
| `review_rule_not_met`, `reviewers_rule_team`, `reviewers_members`, `reviewers_role` | a close before the passes; `<reviewers_text>` = the filled `reviewers_rule_team` (rule names a team), `reviewers_members` (stage reviewers is a union of entry roles), else `reviewers_role` | a `review_passes_met` condition | `<item> <stage> <need> <have> <reviewers_text>` / `<team>` / `<role>` |
| `review_no_work_commit`, `review_lookup_failed`, `review_later_work` | the later-own-work check | a `no_later_own_work` condition | `<item>` / `<item> <reason_text>` / `<item> <work_commit> <sha>` |
| `dep_status`, `dep_foreign`, `dep_missing` | `<list>` of a `dependencies_finished` refusal: one text per unfinished dependency, joined by `; ` | a `dependencies_finished` condition | `<id> <status>` / `<id> <repository> <status>` / `<id>` |
| `dep_handoff_missing`, `dep_handoff_unaccepted`, `dep_handoff_stale`, `dep_handoff_rejected` | appended to `<list>` for a finished dependency whose edge state is not allowed | a `dependencies_finished` condition with a `handoff_states` list | `<id>` |

### 4.8 Team entry (`teams.json` → `teams.<team>`) and the `team define` input

Defaults are read-time defaults: a reader treats an absent key exactly as the default value; no writer fills them in (D-32, R2-006).

| key | type / allowed | default | validation and error | read by and effect | interplay | valid / invalid |
|---|---|---|---|---|---|---|
| team name (map key; `name` in the define input) | `^[a-z0-9][a-z0-9:_-]{0,63}$` (also for `review[].team`, `rules.*[].team`, R2-036) | required | schema | `--team`, item `team` field | — | `"t-live"` / `"T1"` → `teams.json: teams.T1 (name): must match ^[a-z0-9][a-z0-9:_-]{0,63}$` |
| `workflow` | a registered workflow name `^[a-z0-9][a-z0-9._:-]{0,63}$` | required (D-01) | E-01 `teams.<t>.workflow: <w> is not registered in workflows.json` | every team command: the definition of the team's items | — | `"team"` / `"nope"` → `teams.json: teams.t1.workflow: nope is not registered in workflows.json` |
| `people` | map key `^[a-z][a-z0-9_]{0,39}$` → trimmed non-empty name, ≥ 1 key | required | schema; E-09 `teams.<t>.people: workflow <w> needs entry key <k>` | role sources `entry_person: <k>` | `entry_constraints` | `{"lead":"lead-a"}` / `{}` → `teams.json: teams.t1.people: must have at least 1 keys` |
| `lists` | map key → distinct trimmed names | `{}` (an absent key is `[]`) | schema; E-11, E-02, E-03 from `entry_constraints` | role sources `entry_list: <k>`; plan roster order | — | `{"members":["a","b"]}` / `{"members":"a"}` → `teams.json: teams.t1.lists.members: must be array` |
| `rules` | map key → array of `{team, count ≥ 1}` | `{}` | E-08 `teams.<t>.rules.<k>[<i>].team: <x> is not configured` | role source `entry_rule_teams: <k>` (people and lists of the named teams' entries; `when_empty: anyone`: anyone when the list is empty) | — | `{"refinement_review":[{"team":"reviewers","count":1}]}` / `{"refinement_review":[{"team":"reviewers"}]}` → `teams.json: teams.t1.rules.refinement_review[0]: missing key count` |
| `review` | array of `{stage, count ≥ 1, team?}` | absent: the workflow's `defaults.review` | E-04 `teams.<t>.review[<i>].stage: <s> is no stage of workflow <w> (<stages>)`; E-05 `teams.<t>.review: a stage is listed twice`; E-06 `teams.<t>.review[<i>].team: <x> is not configured`; E-07 `teams.<t>.review[<i>]: no reviewer can pass stage <s> (<role> is empty)` — only for a list written in the entry (R2-001) | the stages that apply (in workflow order), their counts, and (with `team`) the people and lists of that team's entry as the eligible reviewers | `[]` = no review | `[]` / `[{"stage":"peer","count":0}]` → `teams.json: teams.t1.review[0].count: must be at least 1` |
| `limits` | `{overall?: n, repository?: n \| {default?, "<owner>/<name>": n}, branch?: n \| {default?, "<owner>/<name>:<branch>": n}, team?: n, member?: n \| {default?, "<agent>": n}}`, n whole ≥ 0 | `{}` (no limit) | schema; E-10 `teams.<t>.limits.<l>: level <l> is not in the limits.levels of workflow <w>` (R2-011) | condition `within_limits`: the number for a level; a map key is matched exactly (case-sensitive) against `<owner>/<name>`, `<owner>/<name>:<branch>` or the agent, else `default`, else no limit; an empty map is `must have at least 1 keys` (R2-037) | — | `{"team":4,"member":1}` / `{"agent":1}` → `teams.json: teams.t1.limits.agent: not a key of this object`; `{"repository":{}}` → `teams.json: teams.t1.limits.repository: matches none of the allowed forms` |
| `chunk_scope` | `off` \| `branch` \| `repo` \| `all` | `branch` | schema | caps the scope of offers with `scope: entry_chunk_scope` and `team query --scope` (the narrower wins) | — | `"repo"` / `"global"` → `teams.json: teams.t1.chunk_scope: must be one of off, branch, repo, all` |

The define input (`schema/team-definition.schema.json`) has the same keys plus `schema: "backlog-team-definition/2"` and `name`
(`schema`: const, required; another value → `team.json: schema: must be "backlog-team-definition/2"`).

### 4.9 Registry files

| key | type | validation and error | effect |
|---|---|---|---|
| `teams.json` `schema` | const `backlog-teams/2` | a file without `schema` (the old flat map): `<home>/teams.json is schema 1; run backlog team migrate` (exit 2) | selects the reader |
| `teams.json` `teams` | map name → entry | schema + E-rules | the teams |
| `workflows.json` `schema` | const `backlog-workflows/2` | as above with `workflows.json` | selects the reader |
| `workflows.json` `workflows` | map name → definition; the key pattern equals the definition `workflow` pattern (R2-004); the definition's `workflow` must equal its key: V-41 `workflows.<k>.workflow: must equal the name it is registered under (<k>)` | schema + V-rules | the definitions |

**Message forms (R2-030).** Structural: `<file>: <path>: <message>`; at the root the `<path>: ` part is omitted (`def.json: missing key
statuses`); a key failing its name rule: `<path> (name): <message>`; whole-file rules (V-17): `<file>: <message>`. `<file>` is
`teams.json`/`workflows.json` for registries and the path as given for `--file`. An enum message lists every value in schema order.

### 4.10 Semantic rules (V-nn, E-nn) (R2-027)

| rule | trigger | exact text |
|---|---|---|
| V-01 | `initial` not in `statuses` | `initial: <v> is not one of statuses` |
| V-02 | a `finished` word not in `statuses` | `finished: <v> is not one of statuses` |
| V-03 | withdrawn (D-26) | — |
| V-04 | a side word is also a status | `side_statuses: <w> is also one of statuses` |
| V-05 | `returns_to` not a status | `side_statuses.<w>.returns_to: <v> is not one of statuses` |
| V-06 | `enter`/`leave` not a step | `side_statuses.<w>.<enter\|leave>: <step> is not defined in steps` |
| V-07 | a word in `from`, `to`, `to_rules`, a verdict `to`, a stage leg or a predicate that is no status (tokens excepted) | `<path>: <w> is no status of this workflow`; second form: `steps.<enter>.to` of a side word's enter step is not that word: `steps.<s>.to: must be <w> (side_statuses.<w>.enter)` |
| V-08 | `*` with other words | `steps.<s>.from: "*" must be the only entry` |
| V-09 | an unknown role anywhere | `<path>: role <r> is not defined in roles` |
| V-10 | role sources | `roles.<r>.union: <x> is not defined in roles` / `roles.<r>: union cycle through <x>` / `roles.<r>: a role has exactly one source` |
| V-11 | an unknown text key | `<path>: text <k> is not in refusals or instructions` |
| V-12 | an unknown placeholder | `<key>: placeholder <x> is unknown` |
| V-13 | a stage leg not in the order | `steps.<s>.stages.<st>: stage is not in review.stages_order` |
| V-14 | a step with no target | `steps.<s>: needs to, to_rules, verdicts or stages` |
| V-15 | a verdict word naming no verdict | `steps.<s>.verdict_words.<w>: <v> is not a verdict of the step` |
| V-16 | a regex | `<path>: needs exactly one capture group` / `<path>: not a valid regular expression (<message>)` |
| V-17 | reachability | `<file>: no chain of steps leads from <w> to a finished word` |
| V-18 | stage words | `review.stages.<st>.<ready\|active>: <w> is no status of this workflow` / `review.after_last_stage: <w> is no status of this workflow` / `steps.<s>.stages.<st>.to: must be review.stages.<st>.active` |
| V-19 | `defaults.review` | `defaults.review[<i>].stage: <s> is not in review.stages_order` / `defaults.review: a stage is listed twice` |
| V-20 | a step name in `waiting.cleared_by_steps` | `waiting.cleared_by_steps[<i>]: <s> is not defined in steps` |
| V-21 | an offer mark | `queue.roles.<r>.offers[<i>].mark: <s> is not defined in steps` (also `review_rules_met.step`) |
| V-22 | port refusal | `user_commands.<op>: allow false needs refusal` |
| V-23 | limits and active work | `<path>: level <l> is not in limits.levels` / `<path>: actor_active_items_at_most needs active_work` / `limits: missing (needed by <path>)` / `limits.override.lifts: <l> is not in limits.levels` |
| V-24 | test keys | `<path>: a condition has exactly one test key (found <keys>)` / `<path>: a predicate has exactly one test key (found none)` (R2-032) |
| V-25 | completeness | `<path>: complete needs completeness rules` |
| V-26 | completeness rule | `completeness[<i>]: test <t> needs field` / `completeness[<i>]: test section needs section` |
| V-27 | a binding step | `steps.<s>: a binding step needs to or to_rules` |
| V-28 | value sources | `<path>: <v> is no value source` / `steps.<s>.sets.status: the status is set by to` / `create.sets.status: the status of a new item is initial` |
| V-29 | a required key (structural) | `<path>: missing key <k>` |
| V-30 | stale | `<path>: stale needs review.stale_after_seconds` |
| V-31 | machinery text keys (§4.7a) | `refusals: missing key <k> (required by the features it uses)` |
| V-32 | a key in both text maps | `instructions.<k>: also a key of refusals` |
| V-33 | queue role order | `queue: role_order is required when queue.roles has more than one key` / `queue.role_order: <r> is not a key of queue.roles` |
| V-34 | `to: flag_value` | `steps.<s>.to: flag_value needs value word` |
| V-35 | verdict value | `steps.<s>.value: verdict needs verdicts` |
| V-36 | `when_empty` | `roles.<r>.when_empty: needs entry_rule_teams` |
| V-37 | undefined-step text for a defined step | `undefined_step_refusals.<s>: <s> is defined in steps` |
| V-38 | review keys | `review.stages: keys must equal review.stages_order` / `review: missing (needed by <path>)` / `session: missing (needed by <path>.ends_session)` |
| V-39 | an actor or flag-value test where there is no actor | `<path>: <k> needs an actor and is not allowed in <views\|limits\|active_work\|queue.plan.skip_items>` (R2-012) |
| V-40 | a condition without `refusal` (other than `review_passes_met` and `no_later_own_work`, whose texts are §4.7a) | `<path>: a condition needs refusal` (R2-005) |
| V-41 | registry key | `workflows.<k>.workflow: must equal the name it is registered under (<k>)` |
| E-01 | unregistered workflow | `teams.<t>.workflow: <w> is not registered in workflows.json` |
| E-02 | `disjoint` constraint | `teams.<t>: <a> and <b> must not share a name (<name>)` |
| E-03 | `subset` constraint | `teams.<t>.lists.<a>: <name> is not in <b>` |
| E-04 | review stage | `teams.<t>.review[<i>].stage: <s> is no stage of workflow <w> (<stages>)` |
| E-05 | stage twice | `teams.<t>.review: a stage is listed twice` |
| E-06 | review rule team | `teams.<t>.review[<i>].team: <x> is not configured` |
| E-07 | explicit stage nobody can pass | `teams.<t>.review[<i>]: no reviewer can pass stage <s> (<role> is empty)` |
| E-08 | rules team | `teams.<t>.rules.<k>[<i>].team: <x> is not configured` |
| E-09 | person key required by a role source | `teams.<t>.people: workflow <w> needs entry key <k>` |
| E-10 | limit level unknown to the workflow | `teams.<t>.limits.<l>: level <l> is not in the limits.levels of workflow <w>` |
| E-11 | `non_empty` constraint | `teams.<t>.lists.<k>: must not be empty (workflow <w>)` |

In `team validate --file team.json` (a define input) the messages are prefixed `team.json: ` and drop `teams.<t>.`. The reference
implementation of these rules for the quality gates is `tools/check_semantics.py`.

## 5. Catalogues (the generic primitives the enforcer implements; their use is entirely in the file)

### 5.1 Conditions (`requires`, `recheck_at_publication`)

A condition is an object with **exactly one test key** (V-24 `<path>: a condition has exactly one test key (found <keys>)`) and the
optional attributes `refusal` (text key; required except for `review_passes_met` and `no_later_own_work`, whose texts are the machinery
keys of §4.7a: V-40 `<path>: a condition needs refusal`, R2-005; the schema has no minimum key count), `when` (predicate: the condition
applies only when it holds), `unless` (predicate: skipped when it holds), `force: "bypasses"` (skipped when `--force` is given), `order`
(`first`: §6 11(a); `before_from`: §6 11(c); `after_from`, the default: §6 11(g); R2-008), `exact` (true: actor comparisons ignore
`same_worker_pattern`). Every predicate key of §5.2 is also a test key (the condition passes when the predicate holds); in addition these
condition-only tests (`$defs.condition`):

| test key | passes when | fixed placeholder values |
|---|---|---|
| `any_of: [p]`, `all_of: [p]` | one / all predicates hold | — |
| `review_passes_met: {passes_field, commit_field}` | for every rule of the item's entry review list (workflow stage order): the distinct eligible reviewers whose `passes_field` record `<reviewer> <commit>` names the current `commit_field` number at least `count` (R1-010) | `<need> <have> <reviewers_text>` (§4.7a: `reviewers_rule_team`, `reviewers_members`, `reviewers_role`, R1-011) |
| `no_later_own_work: {commit_field, subject_item_pattern}` | the item has a `commit_field` value, HEAD is that commit or no commit subject in `work_commit..HEAD` names the item's number by the pattern (capture groups = item numbers); a failed git lookup fails the condition with `review_lookup_failed` | `<reason_text>` = first line of git's error |
| `dependents_handoffs_accepted: {records_field, none_value}` | every dependent of the item (any repository folder of the home, not archived) has an accepted edge; with no dependent the step also sets `records_field` to `none_value` and appends `close_gate_none_record` (R1-010) | `<edges>` = `close_gate_edge` per open edge joined by ` \| `, `<command>` = the next command (record or accept), `close_gate_missing_hint` appended when an edge is missing |
| `dependent_exists: "flag_value"` | the flag value is the id of a dependent | `<dependents>` = ids joined by `, ` or `none` |
| `handoff_record_exists`, `handoff_record_has_commit` | a current record for the dependent exists / has a non-empty commit | — |
| `not_caller_session_of: <field>` | the caller session (Q-04) is empty or differs from the item field | — |
| `actor_active_items_at_most: n` | the actor holds at most n other items matching `active_work` | `<n> <list>` |
| `within_limits: [levels]` | for each listed level with a number in the entry's `limits` (and not lifted by `limits.override`), the count of other active items in that level is below the number | `<level> <of> <limit> <count> <held> <hint>`; `<held>` = up to `limits.held_shown` `<repository>#<seq>` then `, ...` (R1-014); `<hint>` = `limit_hint` for the team and member levels when an override exists |
| `within_limits_of_target_team`, `within_limits_for_role` | as `within_limits` for the team named by the flag value / for the agent holding the role | `<limit_text>` = the filled `limit` text |
| `flag_value_is_configured_team` | the flag value names an entry of `teams.json` | — |

### 5.2 Predicates (item and actor tests; used in `when`, `unless`, `select`, `views`, `limits`, `active_work`, rules)

`$defs.predicate` holds only these keys; the condition-only tests of §5.1 are not predicates (R2-012). A predicate object has exactly
one test key besides `exact` (V-24). Contexts without an actor or flag value (`views`, `limits.active_item`, `active_work`,
`queue.plan.skip_items`) refuse the tests marked *actor* (V-39).

| key | value | passes when | actor? |
|---|---|---|---|
| `all`, `any`, `not` | predicates / one predicate | all / one hold / it does not hold | — |
| `status_in`, `status_not_in` | words | the status is / is not one of them | — |
| `finished` | `true` | the status is a finished word of the item's definition | — |
| `field_empty`, `field_present` | field | the value is empty / non-empty after trimming (lists: empty / non-empty) | — |
| `field_exists`, `field_absent` | field | the key is present / absent in the front matter | — |
| `field_true` | field | `true`, `yes`, `1`, any case | — |
| `field_is_actor`, `field_empty_or_actor` | field | the value is the actor (without `exact`: the same worker) / empty or that | actor |
| `field_equals_flag_value` | field | the value equals the flag value | actor |
| `actor_has_role`, `actor_lacks_role`, `flag_value_lacks_role` | role | the actor holds / lacks the role; the agent named by the flag value lacks it | actor |
| `actor_equals_flag_value`, `flag_value_empty` | `true` | the actor is the flag value / the flag value is empty | actor |
| `unbound` | `true` | the item is outside a team | — |
| `argument_present` | argument name | the request carries a non-blank argument | actor |
| `dependencies_finished` | `{handoff_states: [state] \| null}` | every `depends_on` entry names an item that `binding.finished` reports finished (bound target: a finished word of its own definition; target outside a team: the default words of the user commands (D-33)) and, with a list, whose edge state (`accepted`, `unrecorded`, `unaccepted`, `stale`, `rejected`, `missing`) is in the list; `null` ignores edges (R1-015, R2-035) | — |
| `waits_on_other_repository` | `true` | a dependency of another repository folder is not finished | — |
| `waits_on_actor_items` | `true` | a dependency is held by the actor (R3-015) | actor |
| `complete`, `incomplete` | `true` | every / not every completeness rule passes | — |
| `within_limits` | levels | the item may become active within the entry's limits (§5.1) | — |
| `within_limits_for_role` | `{role, levels}` | as `within_limits` for the agent holding the role | — |
| `matches_limits_active_item` | `true` | the item matches `limits.active_item` | — |
| `actor_active_items_at_most` | n | the actor holds at most n other items matching `active_work` | actor |
| `stale` | `{field}` | the field is a time stamp older than `review.stale_after_seconds` | — |
| `last_review_rejected` | `{history_field, verdict}` | the last line of `history_field` has that verdict and the item is not reviewed since (R1-010) | — |
| `review_rules_met` | `{step}` | the `review_passes_met` and `no_later_own_work` conditions of that step hold (no step name fixed) | — |
| `team_count` | `{select, at_most}` | at most `at_most` bound items of the command team on the actor's branch match `select` (evaluated over the team; R1-011, R3-015) | actor |

Valid / invalid examples: `{"finished":true}` / `{"finished":"yes"}` → `def.json: <path>.finished: must be true`;
`{"team_count":{"select":{"finished":true},"at_most":0}}` / `{"team_count":{"at_most":0}}` → `def.json: <path>.team_count: missing key select`.

### 5.3 Value sources (`sets`, `sets_rules`, `appends`, `create.sets`, `on_finish.sets`)

`actor`, `now` (UTC `YYYY-MM-DDThh:mm:ssZ`), `now_if_empty` (`now` when the field is empty, else unchanged), `today` (`YYYY-MM-DD`),
`head` (git HEAD of the working directory, empty when none), `{"head_unless_covered": {passes_field, commit_field,
subject_item_pattern}}` (HEAD when HEAD is non-empty and either no pass in `passes_field` names the current `commit_field` or the
later-own-work test with that pattern fails; else the current value; R1-010), `caller_session` (Q-04), `flag_value`, `""` (empty),
`field:<f>` (the field's value before the step), `role:<r>` (the single agent of an `entry_person` role), `text:<template>` (filled
template), `argument:<a>`. V-28 refuses anything else.

### 5.4 Role sources (`roles.<r>`)

`entry_person: <k>` (the entry's `people.<k>`), `entry_list: <k>` (the names of `lists.<k>`), `entry_rule_teams: <k>` (the people and
lists of every team the entry's `rules.<k>` name; with `when_empty: anyone`, anyone when the rule list is empty), `item_field: <f>`
(the agent in that field), `item_fields: [f]` (any agent in those fields, lists included), `union: [roles]`, `literal: <name>` (the
actor string itself, e.g. `owner` for `--by owner`), `anyone: true` (any non-empty actor). No role or key name is fixed (D-21, D-22).

### 5.5 Request selectors (`edit_rules`)

`step:<name>` / `step:*` (a requested step of the definition), `field:<name>` / `field:*` (a field flag: `status`, `branch`, `commit`,
`location`, `summary`, `priority`, `name`, `objective`, `seq`, `size_score`, `severity`), `set:<name>` / `set:*` (`--set-<name>`),
`note`, `append`, `section:<heading>` / `section:*`. An `allow` entry may carry one qualifier after `?`: `actor_role=<role>`,
`when_status=<word>` (the item's status before the call), `matches_rule=<rule>[,<rule>]` (an `--append` whose text passes, on its own,
one of the named completeness rules: for a rule with `body_pattern` every line matches it, for a `section` rule the section test passes)
(R1-011).

### 5.6 Completeness tests

`non_empty`: the list field (comma text or list) has an entry. `present`: the key exists and is not `""` (`none` and `[]` count as
written). `positive_integer`: the field is a whole number > 0, or (with `body_pattern`) the body matches and group 1 is > 0. `section`:
in the body, after removing every `remove` string and every line matching an `ignore_lines` pattern, the **last** line that starts with
an optional `#`-heading mark, `**` or a list mark followed by the `section` text (case-insensitive, word-bounded) is found; its content
is the text up to the next Markdown heading, trimmed of spaces, line breaks, colons and stars; the test passes when the content is
non-empty and matches no `placeholders` pattern (case-insensitive).

## 6. The enforcer (one algorithm for every `backlog team update` call)

Inputs: the parsed request (step flags, field flags, `--note`, `--append`, `--section`, `--force`, `--by`, `--reason`, `--comments`,
`--checks`, hand-off arguments), the command team T, the item (front matter and body as stored), the caller and session scope (Q-04).
Output: allow (the writes, body texts, output lines) or the first refusal. Order:

1. **Syntax** (machinery): unknown flags, missing values, `--section` grammar, verdict word not in `verdicts` ∪ `verdict_words`
   (exit 2); a flag value that is not of the step's `value` kind (a `word` outside the vocabulary) is invalid input. More than one
   non-combinable step: `one_step` (`<flags>` = the steps as `--name`, joined by `, `); an empty value of a step whose `value` is not
   `none` or `text`: `empty_flag_value` (R2-041).
2. **Files** (REQ-004..006): load and validate both registries once; T without an entry: fixed text (D-09) exit 1.
3. **Item**: not found / archived (machinery texts, exit 1).
4. **Binding** (D-06): unbound item and the request is not exactly `set-team` (+ field edits): `not_team_item`. Bound to a team ≠ T and
   `scope.session_team_only`: `other_team`. The definition D = the workflow of the item's team (of T for `set-team` on an unbound item).
5. **Scope**: `scope.bind_session` and the session names a repository: item outside → `outside_scope`.
6. **Step defined**: each requested step flag must be a step of `D.steps`; an undefined flag prints the text `D.undefined_step_refusals`
   names for it (template: `status` → `status_flag`), else `step_not_defined` (D-25).
7. **Actor**: per step `actor`; `identity.caller_acts_only_as_itself` → `caller_not_actor`.
8. **Edit rules**: `D.edit_rules` in order (item as before the call); `exclusive` steps refuse accompanying edits (`edit_exclusive`).
9. **Combinable steps**, in the order of `steps` in the file, each by steps 10–14, then the main step (D-25, R2-041).
10. **Variant**: the first `variants` entry whose `when` holds overrides `from`/`to`/`by`.
11. **Checks in order**: (a) conditions with `order: first`; (b) arguments with `order: first`; (c) conditions with
    `order: before_from`; (d) `by` (role test, `by_refusal`/`wrong_actor`) and `not_by` (`not_by_refusal`/`wrong_actor`); (e) `from`
    unless `skip_from_when` holds (`from_refusal`/`wrong_status`, plus the first matching `from_refusal_hints` text); (f) the other
    arguments (`refusal`/`missing_argument`; `cites_field`); (g) the other conditions in file order. `when`/`unless`/`force` filter each
    condition. The first failure is the refusal; nothing is written.
12. **Verdict** (steps with `verdicts`): the verdict object adds its `to`, `sets`, `clears`, `appends`, `notice_rules`, `ends_session`;
    the verdict named by `review.reject_clears` empties its field.
13. **To**: `to_rules` (first match) or `to`; tokens: `same` (unchanged), `previous` (the side status's `returns_to`), `initial`,
    `first_review_stage` (the `ready` word of the first stage of the entry's review list, else `review.after_last_stage`),
    `next_review_stage_if_satisfied` (stage satisfied: the next listed stage's `ready`, else `after_last_stage`; not satisfied: the
    current stage's `ready`), `active_review_stage` (the `active` word of the stage the current status belongs to), `flag_value` (the
    flag value, a word of the definition).
14. **Writes**: `sets` (or the first matching `sets_rules`), then `clears`, then `appends`, then the status; `effect` builds hand-off
    records; `records`/`records_rules` appended to the body; when the step is in `waiting.cleared_by_steps` (or a note with
    `cleared_by_note`) and the wait field is set, it is cleared and `waiting.record` appended; when the new status is finished,
    `on_finish.sets` is applied (template: `completed` = `now_if_empty`; D-23).
15. **Publication**: the existing commit/push; `recheck_at_publication` conditions against the merged files.
16. **Output**: the existing `✅ <slug> updated (...)` line, the first matching `notice_rules` instruction, the `on_finish.instruction`
    when the item finished, and last the session end line (`ends_session`).

`backlog team pop` (REQ-802) and `backlog team query --plan` (REQ-804) evaluate `queue` with the same predicate evaluator; a `mark`
runs the named step through this algorithm as the actor (a refused mark is retried up to 3 times, machinery); whether a mark runs is
decided only by the offer's `mark` key; `team pop` never runs a command outside a team (R1-026, R1-028). `backlog team new`
applies `create`. `backlog team query` views apply `views`.

## 7. The user commands

- Their code (`src/shared/` and every command that is not `backlog team ...`) contains **no status, stage, role or team word**, **no
  flow rule** and **no team hook** (REQ-902, REQ-941); the guard tests of `05-tdd-plan.md` §5 enforce it.
- **Where the team path lives (D-17).** `backlog team update|new|query|pop` run in `src/engine/` (`engine/commands/update.js`, `new.js`,
  `query.js`, `pop.js`) and import only the storage primitives: `src/shared/frontmatter.js` (codec), `src/shared/index.js` (index read
  and write), `src/storage.js` (lock), `src/shared/sync.js` (pull, commit, push, publication), `src/shared/store.js` (item files,
  numbering, home), `src/shared/safety.js` (paths, redaction), `src/shared/text.js`, `src/errors.js`. They never import a command
  module (`update.js`, `new.js`, `query.js`, `archive.js`, `router.js`, `done.js`, `move.js`, `sequence.js`, `clean.js`, `read.js`);
  the shared code they need for argument parsing moves into a primitive without item semantics (`src/shared/args.js`). The command
  modules take no `team` parameter; `seam.js` and every assignment to it are deleted.
- **Binding port** (REQ-901): the only team-aware calls from that code are `binding.check(operation, items)` and
  `binding.finished(item)` in `src/engine/binding.js`. `check` returns `allow` without reading any team file when no item of the list is
  bound; otherwise it loads the registries (REQ-004), groups the bound items by team and applies each team's
  `user_commands.<operation>`: the first refusing team answers its `refusal` text (`<list>` = that team's slugs, the first
  `texts.list_cap` then `and <n> more`; `<belong>` = `belongs`/`belong`; `<item>`, `<item_team>` for single-item operations). The
  command prints `❌ <text>`, exit 1, nothing written. `finished(item)` answers `null` for an item outside a team (the reader then uses
  the default words of the user commands, D-33) and, for a bound item, whether its status is a finished word of its definition (R1-006). Invalid or
  missing team files with a bound item: exit 2 with the REQ-006 message; a bound item whose team has no entry: exit 2 (REQ-006).
- **Operations** (which command asks which): `update` — `backlog update <item>` with any flag except `--replan`; `done` — `done <item>`;
  `update-replan` — `update --replan` naming the item; `archive-unfinished` / `archive-finished` — `archive <item>` (with or without
  `--force`) when `binding.finished` is false / true; `archive-done` — each item `archive done` selects; `move-branch` — `move
  --to-branch` and `move --all-open-of-branch`; `move-repository` — `move --to-repository`; `import` — each item `import` moves;
  `import-higher` — `import --higher` before anything moves; `clean` — `clean` and `clean all-branches` before the question and again
  after the pull; `new-split-from` — `new --split-from` of a bound parent.
- **Decided by the principle**: no limit and no dependency gate (D-18); a typed status word is stored as typed and `archive` never
  refuses because of the status (D-19); holding flags refuse nothing and write no status (D-20); `archive` writes no status (D-26).
  Default words of the user commands: D-33 (REQ-908); holding flags refuse nobody: D-20 (REQ-909).

## 8. What the CLI may still hard-code (each with its reason; everything else comes from the files)

The guard test of REQ-905 (check 5) reads its allow-list from this table (R1-013).

| hard-coded | reason |
|---|---|
| argument syntax of every command, the request parts of `team update` (field flags, `--note`, `--append`, `--section`, `--by`, `--force`, `--reason`, `--comments`, `--checks`, hand-off arguments) and the grammar `--<step name>` with the value kinds of `steps.<s>.value` | command surface (D-25), not a rule about items |
| exit codes 0/1/2/3/4/5, the refusal line format, the configuration-command exception | consumer contract (REQ-925, D-31) |
| the JSON Schema subset interpreter, the V/E rules of §4.10, the condition/predicate/value/role/selector catalogues, the template filler, the evaluation order of §6, the machinery text keys of §4.7a | the generic reading and evaluating machinery the principle allows |
| item file format, front-matter codec (stored keys only, D-30), numbering, slug, index, the archive folder `archive/` and read-only archived items (the migration of Q-18 option A is the one writer that may rewrite one) | storage integrity |
| the item field `team` as the binding marker | the only team word the code of the user commands reads (through the port) |
| `branch` changed only by `move`, `commit` never cleared, `seq` unique, dependency targets exist and form no cycle, a moved item keeps no stranded dependency, a bound item's team has an entry | referential integrity (decision AM keeps dependencies a feature of every item) |
| run lock, stale-view guard (exit 5), pull/commit/push and publication validation, rollback | concurrency and publication integrity |
| path safety (no symbolic link, no `..`), redaction of secrets, review-document path check | safety |
| hand-off record and receipt format (JSON strings, sha256 digest over seven fields, 40-hex commit, `accepted`/`rejected`, the DEPENDENCY_HANDOFF and HANDOFF_ACCEPTED/REJECTED body blocks) and the edge states `accepted`, `unrecorded`, `unaccepted`, `stale`, `rejected`, `missing` | record integrity: a digest must mean the same in every backlog; the field that stores them is named by the file |
| `team pop` retries a mark 3 times; idle exit 3 (and `team query` idle exit 0); the JSON keys of `team pop --json` and `team query --plan --json` | concurrency; consumer contract (D-16) |
| identity inputs (`--agent`, `--by` defaulting to `--agent`, the `.backlog/config.json` keys `team`/`user`, and per Q-04 the session variables) and the stale guard's actor | input resolution, not behaviour |
| operator inputs `BACKLOG_RUN_HOOK`, `BACKLOG_LOCK_WAIT_MS`, `XDG_CONFIG_HOME`, `APPDATA` | documented operator environment (R1-025) |
| the bootstrap's runtime error (`RUNTIME_ERROR`, exit 1; JSON object under `--json`) | package bootstrap (Q-11 decides its shape) |
| `team define`/`team workflow` refuse to redefine a team or workflow in use by open items (Q-20 may relax it) | in-flight items keep their definition |
| the fixed text `team <team> is not configured in the backlog configuration` when the command team has no entry | no file can hold the text of a missing entry |

## 9. Behaviours the shipped template must reproduce (today's team flow, so that the topology consumers keep working)

Each row is proved by a conformance test (REQ-907) that runs today's literal test (old id in `05-tdd-plan.md` §6) once against the
registered `templates/team-behaviour/team.json` (R3-021). A row may change only through an owner question. The template encodings of
R24–R29 (R3-015) are written in the template and checked by the schema and semantic gates of this plan; their behavioural equality
with 174c76d is proved only when their conformance tests run (PH-10c/PH-10d).

| # | behaviour today (source) | template keys |
|---|---|---|
| R01 | a team item starts `new`; `team new --status` refused (team/new.js); `team update --status` refused | `initial`, `refusals.create_status_flag`, `undefined_step_refusals.status` |
| R02 | a member refines (`refine-start` from new/refining), not the lead in the first round; one refiner; busy rule with `--force`; limits | `steps.refine-start` |
| R03 | `refine-done` by the refiner with a note on a complete item → refined | `steps.refine-done`, `completeness` |
| R04 | the lead requests the refinement review; a reviewer of the entry's `refinement_review` teams (anyone without rules) gives complete → ready or reject/limit → refining, refiner cleared, finding recorded; verdict alone; item frozen while in review | `steps.request-refinement-review`, `steps.refinement-review`, `edit_rules[0]` |
| R05 | before ready only refinement steps, claim and the owner's close run | `edit_rules[1]` |
| R06 | an owner decision only before ready, with the question; the answer returns it to refining with the lead as refiner unless a limit is full | `side_statuses`, `steps.request-decision`, `steps.decision` |
| R07 | claim: not finished; own team; the lead claims only the team's work item (no refiner key, from new); ready only; holder; dependencies finished with accepted hand-offs; one active item (`--force`); limits; rechecked at publication | `steps.claim` |
| R08 | release by the holder or the lead with a reason; a review word stays; a slice goes to ready, a work item to new; claim and wait cleared | `steps.release` |
| R09 | waiting by the holder; waiting-done; the holder's next review request, review, close or note ends the wait | `steps.waiting`, `steps.waiting-done`, `waiting` |
| R10 | hand-off by the claimer for a real dependent with commit, contract, verification; accept/reject only by the lead, record exists, checks/reason, review passed, record has a commit; close gate; NONE record | `steps.handoff`, `steps.accept-handoff`, `steps.reject-handoff`, `steps.close` |
| R11 | request-review: note; not while reviewed; holder or lead; work commit = HEAD unless covered; first stage of the entry's list (skipped stages) or review complete; `ready for external review` kept | `steps.request-review`, `review` |
| R12 | start-review/review: not an author (claimer, requester, earlier sessions); open to the actor; external stage only by external reviewers; comments cite a review document; not in the author session; complete counts passes per stage (members+lead or the rule's team), reject → in progress clearing every pass; history line | `steps.start-review`, `steps.review`, `roles.author`, `review` |
| R13 | close: summary; owner with reason skips review rules; holder or lead; unheld: lead; review rules met on the current work commit, no later own work | `steps.close` |
| R14 | reassign and reassign-review by the lead with a reason; stale reviews handed on by the lead only | `steps.reassign`, `steps.reassign-review`, `review.stale_after_seconds` |
| R15 | limits overall/repository/branch/team/member over the whole home; refining items count; the lead's override lifts team and member; a team session re-orders only its team's items | `limits`, entry `limits`, `steps.wip-override`, `queue.reorder_scope` |
| R16 | incomplete items are refined only (by the lead outside the refinement stages); the lead edits a refining item only as its refiner | `edit_rules[2..4]`, `completeness` |
| R17 | a member acts only as itself in a team session; the lead may act for others | `identity.caller_acts_only_as_itself` |
| R18 | a session bound to a repository/branch touches only its items; a team session works only its team's items; another repository's items only as chunk work | `scope` |
| R19 | pop order for members and the lead, actions continue/review/refine/claim/refinement-review/reassign-review/chunk/idle, exit 3 idle, marks start-review/refine-start/claim | `queue.roles` |
| R20 | plan: respond/close/review-request to holders, stale reviews to the lead, reviews to idle non-authors, claims to the least-loaded free member within limits, one incomplete item to the lead | `queue.plan` |
| R21 | views claimable/reviewable/blocked/decisions/wip | `views` |
| R22 | a review request, a reject and a close end the agent's session (not the lead's) with the 🛑 line; the close-now notice after a passing review; the lead re-evaluates the order after a completion | `session`, `ends_session`, `notice_rules`, `on_finish` |
| R23 | update/done/replan/archive of an unfinished item/import --higher/clean/split of a bound item by a user command are refused with today's texts; move, archive of a finished item, archive done and import work | `user_commands`, `refusals.user_*` |
| R24 | a slice without a team is offered to the session's team and joins it on claim or refine (team/queue.js:101,185, lifecycle.js:65,73,126) | Q-19 (REQ-019): the migration and `team new --split-from` bind slices (A), or slices outside a team are not team work (B) |
| R25 | the lead tries each free work item in priority order, lists each refused claim in `skipped` and stops at the first success (team/pop.js:173-180) | lead offer `claim` with `try_each: true`, `skipped_instruction: "lead_claim_skipped"`, `marked_instruction: "claimed"` |
| R26 | the lead continues its held work item only when no other item of the team is open, ignoring other free, complete, dependency-free work items (team/pop.js:148-149) | lead offer `continue` with `when_team: team_count{select: not held by actor and not free work, at_most 0}`; a second offer with `lead_close_work_item_review` when the review rules are not met |
| R27 | the lead is busy while another open item of the team on its branch is not held by it and waits neither on the lead's items nor on another repository; items waiting only on other repositories send it there; its passed and changes-requested items keep their action (team/queue.js:112-125) | lead `busy_when` = any of two `team_count` predicates (`waits_on_actor_items`, `waits_on_other_repository`) |
| R28 | an entry without members lets anyone pass the peer stage (shared/status.js:59) | accepted loss: the template's `entry_constraints` require a non-empty members list (E-11); documented in CHANGELOG |
| R29 | `--claim-now` on an item outside a team claims through the command `backlog update --claim` (team/queue.js:171) | removed: a mark runs only a step of the definition (REQ-802); the holding flags outside a team follow Q-02 |

## 10. Requirements

### 10.0 File identity, schema, discovery, validation, migration

#### REQ-001 Registry files and their shape

- **Statement.** Team entries live in `<home>/teams.json` as `{"schema":"backlog-teams/2","teams":{...}}` and behaviour definitions in `<home>/workflows.json` as `{"schema":"backlog-workflows/2","workflows":{...}}`; the shapes are `schema/teams.schema.json` and `schema/workflows.schema.json`.
- **Rationale.** A version key needs a wrapper object; two files keep names apart from behaviour (D-02).
- **Acceptance criteria.**
  1. `backlog team define --file gold.json` on a home without `teams.json` writes `teams.json` whose text is exactly `{\n  "schema": "backlog-teams/2",\n  "teams": {\n    "gold": {...}\n  }\n}\n` (2-space JSON, trailing newline), commits it with the subject `team define: gold` and pushes it (the backlog repository location); `git log -1 --format=%s` in the home prints that subject (R2-020).
  2. A reader given a file of that shape with valid content runs; any other top-level key is `not a key of this object`.
- **Replaces inventory groups.** CFG-TEAMS, DEF-ENTRY
- **Scenarios.** S-001-1, S-001-2
- **Tests.** T-001-1, T-001-2, T-001-3
- **Phase.** PH-3a

#### REQ-002 Schema identity and version check

- **Statement.** Every reader checks the `schema` value first. A schema-1 file (no `schema` key, or a definition with `version: 1`) stops the command with `❌ backlog: <home>/<file> is schema 1; run backlog team migrate` (stderr, exit 2); an unknown schema value is a structural error. **Old items (R3-010, D-30):** an item is old when its front matter carries a key `stage`, `review_state`, `name`, `updated`, `updated_by`, `claimed_by` or `claimed_at`, or when it is bound and its status is `pending`, `in_progress` or `done`; every command that loads such an item (reads included, archived items per Q-18) stops with `❌ backlog: <owner>/<repo>/<path> carries schema 1 fields (<keys or word>); run backlog team migrate` on stderr, exit 2, nothing written. The codec maps no earlier key (ST-CODEC-LEGACY deleted).
- **Rationale.** No backwards compatibility: migrate or fail with a clear message.
- **Acceptance criteria.**
  1. The message names the file and the command.
  2. Nothing is written.
  3. A schema 2 file is accepted.
  4. `backlog show 1` of an item whose front matter has `stage: ready` prints `❌ backlog: <owner>/<repo>/phases/001-a.md carries schema 1 fields (stage); run backlog team migrate` on stderr and exits 2; `git status --porcelain` of the backlog repository is empty afterwards.
  5. An unbound item with status `done` and no old key is not old: `backlog show 1` exits 0.
- **Replaces inventory groups.** ST-LEGACY
- **Scenarios.** S-002-1, S-002-2, S-002-3
- **Tests.** T-002-1, T-002-2, T-002-3, T-002-4
- **Phase.** PH-3a

#### REQ-003 Discovery: only the backlog home, no shipped fallback

- **Statement.** The enforcer reads `<home>/teams.json` and `<home>/workflows.json` and nothing else: no `templates/` file, no environment variable, no other folder. A team entry naming an unregistered workflow is error E-01.
- **Rationale.** The team behaviour is controlled outside the CLI (principle, D-01).
- **Acceptance criteria.**
  1. Deleting `templates/team-behaviour/` from the package changes no command result.
  2. An entry with `workflow: team` and no registered `team` fails E-01 even though the template exists.
- **Replaces inventory groups.** CFG-WORKFLOW-LOAD, SHIP-TEAMCACHE
- **Scenarios.** S-003-1
- **Tests.** T-003-1, T-003-2, T-003-3
- **Phase.** PH-3a

#### REQ-004 Validate once per process, then cache

- **Statement.** On first use in a process the enforcer parses both registries, runs the structural interpreter (REQ-012) and the semantic rules (REQ-013) over the whole files, and caches the result; later reads in the process use the cache. A write by `team define`/`team workflow`/`team migrate` invalidates the cache.
- **Rationale.** Validation errors must surface before any evaluation; repeated parsing is waste.
- **Acceptance criteria.**
  1. A file with any error makes the first team command fail (REQ-006) even when the failing key belongs to another team.
  2. Two reads in one process parse the file once (spy).
- **Replaces inventory groups.** ST-VALIDATE, DEF-TEAM
- **Scenarios.** S-004-1
- **Tests.** T-004-1, T-004-2
- **Phase.** PH-0

#### REQ-005 Missing files and unknown teams

- **Statement.** A missing `teams.json` means no team is configured: a team command prints the fixed text `❌ team <team> is not configured in the backlog configuration` (stdout, exit 1). A missing `workflows.json` with an entry in `teams.json` is E-01 (exit 2). A user command never reads them for unbound items.
- **Rationale.** Missing configuration is a normal state of a backlog without teams; a team with an entry but no behaviour is a broken configuration.
- **Acceptance criteria.**
  1. Exit codes and texts as stated.
  2. A backlog with no team files runs every user command unchanged.
- **Replaces inventory groups.** DEF-NOTCONF, CFG-TEAMS
- **Scenarios.** S-005-1, S-005-2
- **Tests.** T-005-1, T-005-2
- **Phase.** PH-3a

#### REQ-006 Invalid files fail closed

- **Statement.** Unreadable, non-JSON or invalid registry files stop every team command and every user command that meets a bound item: `❌ backlog: <file>: invalid team configuration (<n> problem(s)); run backlog team validate` followed by the first problem line (stderr, exit 2); nothing is written. **A bound item whose team has no entry** (files valid, R3-009): every command that loads it stops with `❌ backlog: <owner>/<repo>/<path> is bound to team <t>, which has no entry in <home>/teams.json` on stderr, exit 2, nothing written (referential integrity of the binding, like a dependency target).
- **Rationale.** Today such files are read as empty (F7): a silent default the principle rules out.
- **Acceptance criteria.**
  1. After `printf x > teams.json` in the home, `backlog team query --team t1 --agent ann --claimable` exits 2, prints `❌ backlog: teams.json: invalid team configuration (1 problem(s)); run backlog team validate` and `❌ backlog: teams.json: not JSON` on stderr, and `git log -1` of the home is unchanged.
  2. With the same broken file, `backlog update 2 --summary x` of an unbound item exits 0 and writes the summary (R2-020).
  3. `backlog show 3` of an item bound to team `ghost` (no entry) exits 2 with `is bound to team ghost, which has no entry`.
- **Replaces inventory groups.** CFG-TEAMS-SILENT, CFG-WORKFLOW-LOAD
- **Scenarios.** S-006-1, S-006-2, S-006-3
- **Tests.** T-006-1, T-006-2, T-006-3, T-006-4
- **Phase.** PH-3a

#### REQ-007 backlog team validate

- **Statement.** `backlog team validate` validates the registered `teams.json` and `workflows.json` (both, all entries). Valid: `✅ teams.json, workflows.json: valid (<t> teams, <w> workflows)` (stdout, exit 0). Invalid: one `❌ backlog: <file>: <problem>` line per problem on stderr, exit 2. `--json`: `{"ok":true|false,"files":[{"file":"teams.json","errors":[...]},{"file":"workflows.json","errors":[...]}]}` on stdout, exit 0 or 2. It needs no `--team`/`--agent`. Help: `backlog team validate --help` prints the usage, the two files, the exit codes and one example.
- **Rationale.** The owner asked for a validation command; it is the place where an operator learns every problem at once.
- **Acceptance criteria.**
  1. All problems are listed, sorted by file then path.
  2. A schema 1 file prints the migrate message as its problem.
  3. Help text test.
- **Replaces inventory groups.** ST-VALIDATE, DEF-TEAM
- **Scenarios.** S-007-1, S-007-2, S-007-3
- **Tests.** T-007-1, T-007-2, T-007-3, T-007-4
- **Phase.** PH-0

#### REQ-008 backlog team validate --file

- **Statement.** `backlog team validate --file <path>` validates one input file before registration: by its `schema` value a behaviour definition (`backlog-team-behaviour/2`) or a team definition (`backlog-team-definition/2`; its workflow must be registered); any other or missing `schema`: `❌ backlog: <path>: schema must be backlog-team-behaviour/2 or backlog-team-definition/2` exit 2. Output and exit codes as REQ-007 (`✅ <path>: valid`). An unreadable file prints `❌ backlog: cannot read <path>: <code>` where `<code>` is the Node error code (`ENOENT`, `EACCES`, `EISDIR`) (R2-038). `teams.example.json` (a registry, `backlog-teams/2`) is not a `--file` input: it is validated by a unit test against `teams.schema.json` (R2-019).
- **Rationale.** A definition is written outside the CLI and must be checkable before it is published.
- **Acceptance criteria.**
  1. Works without network and writes nothing.
  2. Unreadable file: `❌ backlog: cannot read <path>: <code>` exit 2.
- **Replaces inventory groups.** ST-VALIDATE, DEF-TEAM
- **Scenarios.** S-008-1, S-008-2
- **Tests.** T-008-1, T-008-2, T-008-3
- **Phase.** PH-0

#### REQ-009 Registration of a behaviour definition

- **Statement.** `backlog team workflow --file <path>` registers a valid schema 2 definition under its `workflow` name (validation as REQ-008; problems as REQ-007 lines, exit 2, nothing written) and prints `✅ workflow <name> registered` (`--json`: `{"ok":true,"workflow":"<name>","status":"registered"}`); `--show <name>` prints the registered definition (2-space JSON) or `❌ backlog: workflow <name> is not registered (backlog team workflow --file <json> registers one)` on stderr, exit 2 (invalid input, REQ-925) — it never shows a template. The registry key pattern equals the definition `workflow` pattern `^[a-z0-9][a-z0-9._:-]{0,63}$` (R2-004).
- **Rationale.** Registration is the only way a behaviour enters a backlog (D-01).
- **Acceptance criteria.**
  1. Registering the same file twice prints `workflow team unchanged` (no prefix, the text of today) on stdout the second time and exits 0; `git log` of the home gains no commit (R2-020, R2-038).
  2. With an item bound to a team of workflow `team` whose status is not finished, `team workflow --file changed.json` (another definition named `team`) exits 2 with `❌ backlog: workflow team is used by teams with 1 open items; register the new flow under another name` (REQ-015, the text of today).
  3. A definition named `example:team` registers and `team validate` of the home passes.
- **Replaces inventory groups.** DEF-WFREG, ST-VALIDATE, DI-DEFINE-IO
- **Scenarios.** S-009-1, S-009-2
- **Tests.** T-009-1, T-009-2
- **Phase.** PH-3a

#### REQ-010 team define validates against the referenced workflow

- **Statement.** `backlog team define --file <path>` accepts a `backlog-team-definition/2` file, validates it (schema + E-01..E-11 against the registered workflow) and writes the entry without `schema`/`name`; it writes no key the input does not give: an absent `review` is read as the workflow `defaults.review` at every read (D-32, R2-001, R2-006), and E-07 checks only a `review` list the input gives. `workflow` is required (D-01; no default workflow, DEF-DEFAULTWF deleted). `rules`, `limits`, `chunk_scope` are accepted (F4 closed).
- **Rationale.** The entry shape must be the documented one and complete.
- **Acceptance criteria.**
  1. Output: `✅ team <name> defined: <entry person keys as key name>, <n> members, flow <workflow>` — for the template workflow `✅ team gold defined: lead ann, 2 members, flow team` (the person keys and the list named by the first `non_empty` constraint come from the definition).
  2. A missing `workflow` is `team.json: missing key workflow` (exit 2).
  3. Define of `{"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]}}` succeeds; `teams.json` has no `teams.t9.review`; `backlog team validate` passes; a close of an item of t9 needs 1 pass by `a` or `b` and 1 pass by an external reviewer, which nobody can give (the stage can never be passed: today's behaviour, R2-001).
- **Replaces inventory groups.** DEF-TEAM, DEF-ENTRY, DI-DEFINE-IO
- **Scenarios.** S-010-1, S-010-2, S-010-3
- **Tests.** T-010-1, T-010-2, T-010-3, T-010-4
- **Phase.** PH-3a

#### REQ-011 backlog team migrate

- **Statement.** `backlog team migrate` (no team or agent needed) converts a backlog once, in one commit `team migrate: schema 2` (in the in-repository location on the current branch of the repository, R3-025): (1) `teams.json` flat map → `{schema, teams}`: each entry gets `workflow` (absent: `team`, or per Q-16), `people.lead` from `lead`, `lists.members|review_only|external_reviewers` from those keys, `rules.refinement_review` from `refinement_review`, keeps `review` (the earlier form `{team,count}` without `stage` takes `stage` = the definition's `stages_order[i]`; a stage not in the order and a second rule of a stage are dropped and listed), drops `wip`, and gets `limits` from `<home>/wip-limits.json` (`overall`/`repository`/`branch` copied; `team` and `agent` maps become, per entry, the value for that team or agent, else `default`; `agent` → `member`) and `chunk_scope` from `backlog.scope` of every folder `<owner>/<repo>` in which the team has an open bound item; an entry without `lead`, with no or empty `members`, with an unknown key or a bad name aborts with `❌ backlog: teams.json: teams.<t>: <problem>; fix the entry with backlog team define before migrating`; `stale_hours` of `wip-limits.json` other than the definition's `views.wip.stale_hours` aborts with `❌ backlog: wip-limits.json: stale_hours <n> differs from the workflow's views.wip.stale_hours <m>; register a workflow with that value first`; two `backlog.scope` values for one team abort with `❌ backlog: backlog.scope: team <t> reads <a> in <folder1> and <b> in <folder2>`; `wip-limits.json` and every `backlog.scope` are deleted (R3-011). (2) `workflows.json` → `{schema, workflows}`, every schema 1 definition converted by the rules of `06-migration-plan.md` §4 (template + review stage names by position; vocabulary must equal the template, else abort), and the template registered as `team` when an entry names `team` and none is registered (R3-001). (3) every item of the home (archived items per Q-18) is rewritten once to the stored keys: earlier codec keys `name`/`updated`/`updated_by`/`claimed_by`/`claimed_at` become `title`/`last_updated`/`last_updated_by`/`owner`+`owned_since`, `stage` and `review_state` are removed from every item, bound or not (R1-015, R1-018); a bound item with an old word gets the word `statusOf` gives at 174c76d; (3a) an item with `stage` and no `refiner` key gets `refiner: ""`; (3b) an item whose `review_state` is `changes-requested` and that has no `review_history` gets the line `<reviewed_at> <first stage of its entry> reject <reviewer> <work_commit>: changes requested before the history was kept`; (3c) a teamless split slice is handled per Q-19 and, when bound, gets `refiner: ""`; (3d) the parent of a slice is the item whose file name (without `.md`) or `phase` equals the last `Split from \`<x>\`` of its body, in `phases/` or `archive/phases/` of the same repository folder; no match: the slice stays unbound and is listed under `not bound (parent not found)`; items bound to a team without an entry per Q-17 (R3-007..R3-009). (4) each file and each item is migrated when it is old and left alone when it is schema 2, so a partly migrated home completes (R3-024); the result is validated (REQ-007) before the commit; any problem aborts with the problem lines and writes nothing. `--file <path>` converts one schema 1 definition file and prints `✅ <path>: converted to backlog-team-behaviour/2` (the file is rewritten); `--file <path> --dry-run` prints the converted JSON on stdout and writes nothing. `--dry-run` lists every change (files, entries, items) and writes nothing. Exit 0 / 2. Already schema 2: `ℹ️  nothing to migrate` exit 0. Every `team migrate` test sets `BACKLOG_HOME` to a throwaway home and the PH-1 gate runs under `.agents/scripts/check-real-backlog-clean.mjs` (R3-023).
- **Rationale.** No backwards compatibility: every reader drops its translation; the data is changed once.
- **Acceptance criteria.**
  1. Running `backlog team migrate` twice: the second run prints `ℹ️  nothing to migrate`, exits 0 and adds no commit.
  2. An unbound item `status: done` with `review_state: none` keeps `status: done`, loses `review_state`, and keeps every other key byte for byte.
  3. Two `backlog.scope` values for one team abort with the text of (1) and `git status --porcelain` of the home stays empty.
  4. `--file` on the topology copy `backlog-workflow.json` (workflow `example-team`) gives the template with the stage `peer` renamed `local` and description kept (deep equality, T-011-9); on the shipped `templates/workflows/team.json` of 174c76d it gives the template with its description (T-011-6).
  5. A bound legacy slice (`stage: refining`, no `refiner`) gets `refiner: ""`; a `changes-requested` item without history gets the (3b) line; a slice whose `Split from` names no item stays unbound and is listed.
- **Replaces inventory groups.** ST-LEGACY, RF-LEGACYSTAGE, RF-JOIN, CFG-WIPFILE, CFG-SCOPEFILE
- **Scenarios.** S-011-1, S-011-2, S-011-3, S-011-4, S-011-5, S-011-6
- **Tests.** T-011-1, T-011-2, T-011-3, T-011-4, T-011-5, T-011-6, T-011-7, T-011-8, T-011-9, T-011-10, T-011-11, T-011-12, T-011-13, T-011-14
- **Phase.** PH-1

#### REQ-012 JSON Schema subset interpreter

- **Statement.** The schema files are JSON Schema 2020-12 using only: `type`, `const`, `enum`, `anyOf`, `required`, `properties`, `additionalProperties` (false or schema), `propertyNames`, `minProperties`, `items`, `minItems`, `uniqueItems`, `pattern`, `minLength`, `minimum`, `$ref` (local `#/$defs/...` and the `$id` of a sibling schema), `$defs`, `$id`, `$schema`, `title`. The interpreter `src/engine/schema.js` implements exactly these with the messages of §4; a schema using another keyword fails a test. Each schema has an absolute `$id` (`urn:backlog:team-behaviour:2`, `urn:backlog:teams:2`, `urn:backlog:team-definition:2`, `urn:backlog:workflows:2`); a `$ref` to a sibling schema names that absolute `$id`, so a standard 2020-12 validator resolves it (R2-013). The subset adds `maxItems` and `maxProperties` (messages `must have at most <n> entries` / `must have at most <n> keys`). At the root of a file the `<path>: ` part of a message is omitted (R2-030).
- **Rationale.** Zero runtime dependencies (D-04); one interpreter for all files.
- **Acceptance criteria.**
  1. The reference implementation `tools/validate_subset.py` and the JS module give the same problem list on the fixture corpus.
- **Replaces inventory groups.** ST-VALIDATE, DEF-TEAM
- **Scenarios.** none (Covered by T-012-1..T-012-3: the subset and the agreement of the two interpreters are not behaviour a user sees)
- **Tests.** T-012-1, T-012-2, T-012-3, T-012-4
- **Phase.** PH-0

#### REQ-013 Semantic validation rules

- **Statement.** After the structural pass the validator applies V-01..V-30 (definitions) and E-01..E-08 (entries) with the texts of §4 and §5; every rule is one function with a test that triggers it once. The numbered semantic rules are the table of `03-spec.md` §4.10 (V-01..V-40, E-01..E-11), each with its trigger and exact text; V-03 is withdrawn (D-26), V-27 is reduced to "a binding step needs to or to_rules" (D-25), V-29 is the required-key structural message, V-31..V-40 are new (R2-002, R2-005, R2-011, R2-012, R2-027, R2-032).
- **Rationale.** Cross-references (a status used in a step, a role used in `by`) cannot be expressed in the schema subset.
- **Acceptance criteria.**
  1. Each rule has one Examples row in `features/validator-keys.feature`.
- **Replaces inventory groups.** ST-VALIDATE, DEF-TEAM
- **Scenarios.** S-013-1..S-013-63 (See the Scenario Outline in features/validator-keys.feature)
- **Tests.** T-013-1, T-013-2
- **Phase.** PH-0

#### REQ-014 Shipped templates

- **Statement.** The package ships `templates/team-behaviour/team.json` (= this plan's `templates/team.full.json`), `minimal.json`, `teams.example.json`, `workflows.example.json` (the two definitions inlined, generated from the first two) and the four schema files under `templates/team-behaviour/schema/`. Each template is valid; `team.json` reproduces today's team (§9, REQ-907). Templates are documentation and the input of `team workflow --file`/`team migrate`, never read at run time (REQ-003).
- **Rationale.** A documented starting point per use: a full team, a minimal team.
- **Acceptance criteria.**
  1. `backlog team validate --file <template:team.full.json>` and `--file <template:minimal.json>` exit 0 and print `✅ <path>: valid`; a unit test validates `teams.example.json` against `teams.schema.json` and `workflows.example.json` against `workflows.schema.json` (R2-019).
  2. `README.md` contains the four lines `templates/team-behaviour/team.json`, `templates/team-behaviour/minimal.json`, `templates/team-behaviour/teams.example.json`, `templates/team-behaviour/workflows.example.json` (checked by `docs-keys.test.js`, R2-020).
- **Replaces inventory groups.** SHIP-TEAMCACHE, ST-VOCAB
- **Scenarios.** S-014-1, S-014-2
- **Tests.** T-014-1, T-014-2
- **Phase.** PH-0

#### REQ-015 Redefinition of a team or workflow in use

- **Statement.** Machinery: `team define` refuses a changed entry of a team that has open items (`team <t> has <n> open items; register the new composition under another name`) and `team workflow --file` a changed definition used by teams with open items (`workflow <w> is used by teams with <n> open items; register the new flow under another name`); an item is open when its status is not a finished word of its own definition (R1-004); the refusals are configuration-command refusals: stderr `❌ backlog: <text>`, exit 2 (REQ-925 exception, R2-017). Upgrading a definition in use: CONDITIONAL on Q-20 (REQ-020).
- **Rationale.** In-flight items keep the definition they started with (DATA-INTEGRITY).
- **Acceptance criteria.**
  1. With item 1 bound to t1 in `in progress`, `team define` of a changed t1 entry exits 2 with `❌ backlog: team t1 has 1 open items; register the new composition under another name` on stderr; with item 1 `closed` it succeeds.
- **Replaces inventory groups.** DI-DEFINE-INUSE
- **Scenarios.** S-015-1
- **Tests.** T-015-1
- **Phase.** -

### 10.1 Statuses and steps

#### REQ-101 Status vocabulary, initial and finished words

- **Statement.** The words of a bound item are the `statuses` (and side words) of its definition; `initial` is the word of a new or newly bound item; a word in `finished` finishes the item for dependencies, the archive operations of the port and queue membership. No word is reserved: `backlog archive` moves the file and does not change `status`; an archived item is recognised by its path `archive/` only (D-26, R1-005).
- **Rationale.** Moves `src/shared/status.js` (which loads the shipped vocabulary into every command) into the definition.
- **Acceptance criteria.**
  1. With `minimal` registered for team m (`ready` → `in progress` → `closed`), `team update 1 --claim ann` then `--close --summary s` leaves item 1 with status `closed` (`backlog show 1 --json` field `status`).
  2. A definition whose `finished` is `["shipped"]` validates; `backlog archive 1` of a `shipped` item moves it to `archive/` and its status stays `shipped`.
  3. `backlog update 2 --status ready` of an unbound item stores `ready` and `backlog show 2` prints it; no team file is read (the guard test of REQ-905 proves the second half).
- **Replaces inventory groups.** ST-VOCAB, ST-FINISHED, DI-ARCHIVE
- **Scenarios.** S-101-1, S-101-2, S-101-3
- **Tests.** T-101-1, T-101-2, T-101-3
- **Phase.** PH-4b

#### REQ-102 Side statuses

- **Statement.** A side word is entered by its `enter` step and left by its `leave` step; a `leave` step with `to: previous` goes to `returns_to`.
- **Rationale.** Today the decision word is code (`decision()` writes refining).
- **Acceptance criteria.**
  1. Template: request-decision → awaiting decision; decision → refining.
- **Replaces inventory groups.** RF-DECISION
- **Scenarios.** S-102-1
- **Tests.** T-102-1, T-102-2
- **Phase.** PH-8

#### REQ-103 Step catalogue and undefined steps

- **Statement.** Each `team update` step flag maps to the step of the same name (`--status` → `set-status`). A step the definition does not define is refused: `status_flag` for `--status`, else `step_not_defined` (exit 1, nothing written).
- **Rationale.** The CLI keeps its flags (D-03); the file decides which exist.
- **Acceptance criteria.**
  1. Template defines no `set-status`: `team update --status` prints the status_flag text (today's text).
  2. A definition without `waiting` refuses `--waiting`.
- **Replaces inventory groups.** BIND-NOSTATUS, DI-MACHINE
- **Scenarios.** S-103-1, S-103-2
- **Tests.** T-103-1, T-103-2
- **Phase.** PH-4b

#### REQ-104 From check

- **Statement.** A step runs only when the item's status is in `from` (`*`: any), after `variants`, unless `skip_from_when` holds; else `from_refusal` (default `wrong_status` with `<from>` = the words joined by ` or `) plus the first matching `from_refusal_hints` text.
- **Rationale.** Today only the from-words were data, and only the shipped ones (F1).
- **Acceptance criteria.**
  1. `team update 1 --claim ann` of a `new` item under the template prints `❌ 001-a is new; claim needs ready or in progress` followed by the hint of `from_refusal_hints[0]` filled for item 1, exit 1 (the key list: `wrong_status`, `refine_first_hint`, `claim_awaiting_decision_hint`).
  2. Under a definition patched `steps.claim.from = ["new"]`, the same command on a `new` item succeeds; on a `ready` item it is refused with `wrong_status`.
- **Replaces inventory groups.** ST-CANSTEP, STEP-GATE
- **Scenarios.** S-104-1, S-104-2, S-104-3
- **Tests.** T-104-1, T-104-2
- **Phase.** PH-4b

#### REQ-105 To resolution

- **Statement.** The new status is resolved by §6 step 13 (`to`, `to_rules`, verdict `to`, tokens).
- **Rationale.** Today `next()` is code with the shipped words.
- **Acceptance criteria.**
  1. For each token of §6 step 13 (`same`, `previous`, `initial`, `first_review_stage`, `next_review_stage_if_satisfied`, `active_review_stage`, `flag_value`) a unit test gives the status after the step on a fixture item (T-105-1 lists the seven pairs); release under the template gives `reviewing` → `reviewing`, a slice `in progress` → `ready`, a work item `in progress` → `new` (R08).
- **Replaces inventory groups.** ST-NEXT
- **Scenarios.** S-105-1, S-105-2, S-105-3
- **Tests.** T-105-1, T-105-2
- **Phase.** PH-4b

#### REQ-106 Writes: sets, clears, appends, value sources

- **Statement.** Writes follow §6 step 14 with the value sources of §5.3; `appends` moves an existing value to the end; `status` is written only by `to`.
- **Rationale.** Today each step writes its fields in code.
- **Acceptance criteria.**
  1. Claim writes claimed_by, claimed_at, author_session and session_authors as today (byte-equal front matter on the conformance fixture).
- **Replaces inventory groups.** RV-HISTORY, DI-GIT
- **Scenarios.** S-106-1, S-106-2
- **Tests.** T-106-1, T-106-2, T-106-3
- **Phase.** PH-4b

#### REQ-107 Body records

- **Statement.** `records`/`records_rules`/verdict `records_verdict` are filled (§4.7 placeholders) and appended after a blank line; the update line shows the first line as the headline.
- **Rationale.** The body texts are part of the team behaviour; consumers read some of them.
- **Acceptance criteria.**
  1. Conformance: every record text of today (claim, release, waiting, review, refinement, decision, close, hand-off blocks) byte-equal.
- **Replaces inventory groups.** DI-MACHINE
- **Scenarios.** S-107-1, S-107-2
- **Tests.** T-107-1, T-107-2
- **Phase.** PH-4b

#### REQ-108 Arguments

- **Statement.** A required argument missing or blank is refused (`refusal` or `missing_argument`); `cites_field` requires the text to contain one entry of the list field; order per §6.
- **Rationale.** Today each step checks its own arguments in code.
- **Acceptance criteria.**
  1. The template texts of `close_no_summary`, `refine_done_no_note`, `review_needs_comments` and `review_cite_refs` are printed filled for item 1 (old tests TST ids of `shared-team-lifecycle` and `shared-session-review` re-pointed, 05 §6).
- **Replaces inventory groups.** RV-CLOSE, RF-STEPS
- **Scenarios.** S-108-1, S-108-2
- **Tests.** T-108-1, T-108-2
- **Phase.** PH-4b

#### REQ-109 Evaluation order and refusal contract

- **Statement.** Checks run in the order of §6; the first failure prints `❌ <text>` on stdout, exit 1, and nothing is written (files, index, commit, event).
- **Rationale.** A deterministic order makes refusal texts stable and testable.
- **Acceptance criteria.**
  1. Property test: for each template step, a request failing two checks gets the text of the earlier one.
  2. Snapshot shows no change after a refusal.
- **Replaces inventory groups.** STEP-GATE, DI-MACHINE
- **Scenarios.** S-109-1
- **Tests.** T-109-1, T-109-2
- **Phase.** PH-4b

#### REQ-110 One step per call; combinable and exclusive steps

- **Statement.** At most one step without `combinable` per call (`one_step`, `<flags>` = the steps as `--name` in file order); `combinable` steps may accompany it and run first, in the order of `steps` in the file (no step name is special, D-25, R1-012); an `exclusive` step refuses accompanying edits (`edit_exclusive`).
- **Rationale.** One behaviour per call; `--wip-override` with `--claim` works today.
- **Acceptance criteria.**
  1. `--claim x --release x` refused with one_step; `--wip-override r --claim x` accepted for the lead.
- **Replaces inventory groups.** DI-SYNTAX, RF-EDITS
- **Scenarios.** S-110-1, S-110-2, S-110-3
- **Tests.** T-110-1
- **Phase.** PH-4b

#### REQ-111 Session end and notices

- **Statement.** After a step (or verdict) with `ends_session`, unless the actor holds an excepted role, the last output line is `session.end_text` with `<agent>`; a verdict's `notice_rules` print the instruction of the first rule whose `when` holds on the item after the step, right after the update line (R1-011, R2-009).
- **Rationale.** Today `ender`, `shutdown` and `closeNow` are code.
- **Acceptance criteria.**
  1. Template: request-review, reject and close by a member print the 🛑 line; by the lead no line.
- **Replaces inventory groups.** RV-NOTICE
- **Scenarios.** S-111-1, S-111-2
- **Tests.** T-111-1, T-111-2
- **Phase.** PH-7

#### REQ-112 team update on an unbound item

- **Statement.** `team update` on an unbound item accepts only `set-team` (with field edits); anything else prints `not_team_item` (exit 1). On an item bound to another team, with `scope.session_team_only`: `other_team`.
- **Rationale.** D-06: one door per item kind.
- **Acceptance criteria.**
  1. `team update <user> --note x` refused; `--set-team t1` binds.
- **Replaces inventory groups.** BIND-UNBOUND, BIND-CLOSESTATUS, WIP-START
- **Scenarios.** S-112-1, S-112-2, S-112-3
- **Tests.** T-112-1, T-112-2, T-112-3
- **Phase.** PH-11b

#### REQ-113 A set-status step (S29b)

- **Statement.** A definition may define a step with `"value": "word"` and `"to": "flag_value"`; the flag value must then be a word of `statuses` or `side_statuses`, else invalid input, exit 2: `❌ backlog: argument --<step>: invalid choice: '<v>' (choose from '<w1>', '<w2>', ...)` (words in file order). `--status` is an ordinary step name: the template defines no step `status` and maps it in `undefined_step_refusals` to `status_flag`, so today's refusal stays (D-25, R1-020, R2-007).
- **Rationale.** Impact row S29b: setting a team item's word directly is a team rule the file must be able to express, not a CLI literal.
- **Acceptance criteria.**
  1. With a fixture defining set-status by the lead from `*`, the lead sets a word; a member is refused by `by`.
  2. With a definition that adds `steps.status = {"value":"word","from":["*"],"to":"flag_value","by":["lead"]}`, `team update 1 --status gone` by the lead exits 2 with `argument --status: invalid choice: 'gone' (choose from 'new', ...)`.
- **Replaces inventory groups.** BIND-NOSTATUS
- **Scenarios.** S-113-1, S-113-2
- **Tests.** T-113-1
- **Phase.** PH-4b

#### REQ-114 Blocking a session after it ended (S82)

- **Statement.** When `session.block_after_end` is `{"field": "<f>"}`, a step with `ends_session` appends the caller session (Q-04) to the item field `<f>`, and every later step whose actor session is in `<f>` of any item of the home is refused with `session_ended`. Absent (template): nothing is recorded or checked (R1-010).
- **Rationale.** Impact row S82: the removed hand-off session marker was team behaviour; it becomes a file switch (template off = today).
- **Acceptance criteria.**
  1. Off: no field written. On: the same session is refused after a review request; a new session is not.
- **Replaces inventory groups.** RV-NOTICE
- **Scenarios.** S-114-1
- **Tests.** T-114-1, T-114-2
- **Phase.** PH-7

### 10.2 Roles, identity and scope

#### REQ-201 Roles from sources

- **Statement.** Every role used in a definition is defined in `roles` by one source of §5.4 (`entry_person`, `entry_list`, `entry_rule_teams` name keys of the team entry's `people`, `lists` and `rules`; no role or entry key name is fixed in code, D-21, D-22); the enforcer resolves an actor's roles from the item, the team entry and the entries of other teams named by rules.
- **Rationale.** Today membership, lead, external reviewers and authorship are code over `teams.json`.
- **Acceptance criteria.**
  1. A definition whose roles are `captain` (`entry_person: skipper`) and `crew` (`entry_list: hands`) with an entry `{"people":{"skipper":"sam"},"lists":{"hands":["ann"]}}` lets `sam` run a step `by: ["captain"]` and refuses `ann` with `wrong_actor` (`<who>` = `captain`).
  2. A `union` cycle is refused with V-10 `roles.a: union cycle through b`.
- **Replaces inventory groups.** RO-MEMBERS, RO-AUTHOR
- **Scenarios.** S-201-1, S-201-2
- **Tests.** T-201-1, T-201-2, T-201-3
- **Phase.** PH-5

#### REQ-202 by and not_by

- **Statement.** The actor must hold a role of `by` (else `by_refusal`/`wrong_actor` with `<who>`), and none of `not_by` (else `not_by_refusal`/`wrong_actor`).
- **Rationale.** Today only the external stage checks its actor; the rest is scattered code.
- **Acceptance criteria.**
  1. External stage review by a member refused; self review refused with today's text.
- **Replaces inventory groups.** ST-CANSTEP
- **Scenarios.** S-202-1, S-202-2
- **Tests.** T-202-1
- **Phase.** PH-5

#### REQ-203 The actor of a step

- **Statement.** The actor is resolved by the step's `actor` (§4.6).
- **Rationale.** Today the ACTS_AS map is code.
- **Acceptance criteria.**
  1. Release by the lead for another holder uses the explicit --by; claim uses the flag value.
- **Replaces inventory groups.** RO-ACTSAS
- **Scenarios.** S-203-1
- **Tests.** T-203-1
- **Phase.** PH-5

#### REQ-204 A caller acts only as itself

- **Statement.** With `identity.caller_acts_only_as_itself`, a known caller (Q-04) without an excepted role may not act as another agent: `caller_not_actor`. Applies to `team update` and `team pop` (`pop_caller`).
- **Rationale.** Today a code rule tied to TEAM_NAME being set.
- **Acceptance criteria.**
  1. A member naming another agent is refused; the lead is not.
- **Replaces inventory groups.** RO-CALLER
- **Scenarios.** S-204-1
- **Tests.** T-204-1
- **Phase.** PH-5

#### REQ-205 Same worker (session continuation)

- **Statement.** `identity.same_worker_pattern` makes two names the same worker when both match and their first groups are equal; actor comparisons use it unless `exact: true`.
- **Rationale.** Today `sameWorker` is a code regex.
- **Acceptance criteria.**
  1. `member-a:2` continues an item held by `member-a:1`; without the key it is refused.
- **Replaces inventory groups.** RO-SAMEWORKER
- **Scenarios.** S-205-1, S-205-2
- **Tests.** T-205-1
- **Phase.** PH-5

#### REQ-206 The lead comes only from the team entry

- **Statement.** Role sources are the only way to name the lead; `TEAM_LEAD` is not read and `--lead` is removed from `team pop` and `team query --plan` (an unknown option, exit 2). Texts no longer name TEAM_LEAD (D-09).
- **Rationale.** F6: the environment and a flag overrode the file.
- **Acceptance criteria.**
  1. TEAM_LEAD set to a member changes nothing.
  2. `team pop --lead x` exit 2 unrecognized arguments.
- **Replaces inventory groups.** ENV-LEAD
- **Scenarios.** S-206-1, S-206-2
- **Tests.** T-206-1, T-206-2, T-206-3
- **Phase.** PH-5

#### REQ-207 Session scope and session team

- **Statement.** With `scope.bind_session`, a session bound to a repository (and branch) (Q-04 inputs) refuses items outside (`outside_scope`) for every write, `team new --split-from`, `team update --replan` in a bound session, and `team pop --branch` other than the bound one (`session_branch`). With `scope.session_team_only` an item of another team is refused (`other_team`).
- **Rationale.** Today these are code rules tied to environment variables.
- **Acceptance criteria.**
  1. With `scope.bind_session` (template) and the session bound to repository `o/r` branch `main`, `team update 3` of an item on branch `dev` prints `❌` + the filled `outside_scope` text, exit 1; `team pop --branch dev` prints the filled `session_branch` text, exit 1.
  2. With `scope.bind_session: false` the same update succeeds.
- **Replaces inventory groups.** SC-SCOPE, SC-INTEAM, SC-BRANCHBOUND
- **Scenarios.** S-207-1, S-207-2
- **Tests.** T-207-1, T-207-2
- **Phase.** PH-5

#### REQ-208 Items of another repository

- **Statement.** `scope.foreign_items: {when: <predicate>}` offers another repository's items only when the predicate holds; absent: never (template `{"when":{"field_true":"chunk"}}`, R1-010).
- **Rationale.** Today `offeredTo` is code.
- **Acceptance criteria.**
  1. Template: a chunk item of another repository is offered with scope all; a user one is not.
- **Replaces inventory groups.** SC-INTEAM, Q-ROWS
- **Scenarios.** S-208-1, S-208-2
- **Tests.** T-208-1
- **Phase.** PH-10a

#### REQ-209 Team entry names

- **Statement.** Entry keys are generic (`people`, `lists`, `rules`, D-21); the composition rules come from the definition's `entry_constraints` (`non_empty`, `disjoint`, `subset`) and the role sources; E-02 text is `teams.<t>: <a> and <b> must not share a name (<name>)`, triggered when a name is in both (R2-003); E-09 `teams.<t>.people: workflow <w> needs entry key <k>`; E-11 `teams.<t>.lists.<k>: must not be empty (workflow <w>)`.
- **Rationale.** Names belong to the entry, rules to the definition.
- **Acceptance criteria.**
  1. Define of `{"people":{"lead":"b"},"lists":{"members":["b"]}}` on the template exits 2 with `team.json: lead and members must not share a name (b)`; on a definition without that constraint it succeeds.
- **Replaces inventory groups.** RO-MEMBERS, DEF-TEAM
- **Scenarios.** S-209-1
- **Tests.** T-209-1
- **Phase.** PH-3a

### 10.3 Claims and hand-offs

#### REQ-301 Conditions: shape, when, unless, force, order

- **Statement.** A condition has one test key and the attributes of §5.1; `when`/`unless` filter it, `force: bypasses` skips it under `--force`, `order` places it (§6).
- **Rationale.** Generic machinery for every rule that today is an if-statement.
- **Acceptance criteria.**
  1. `--force` passes the active-item rule and never a limit (template).
- **Replaces inventory groups.** STEP-ACTIVE
- **Scenarios.** S-301-1, S-301-2
- **Tests.** T-301-1, T-301-2
- **Phase.** PH-6a

#### REQ-302 Field conditions

- **Statement.** Field tests of §5.2 used as conditions (`field_empty`, `field_present`, `field_exists`, `field_absent`, `field_is_actor`, `field_empty_or_actor`, `field_equals_flag_value`).
- **Rationale.** Holder, refiner and reviewer rules are field tests.
- **Acceptance criteria.**
  1. For each field test a unit test (T-302-1) evaluates it on `{}` and on `{"f":"x"}` (and `exact` for actor tests) and gives the booleans listed in 05 §4.
- **Replaces inventory groups.** STEP-CLAIM, STEP-RELEASE
- **Scenarios.** S-302-1
- **Tests.** T-302-1
- **Phase.** PH-6a

#### REQ-303 The claim step of the template

- **Statement.** The template's `steps.claim` reproduces R07 (order and texts of today).
- **Rationale.** Conformance of the most used step.
- **Acceptance criteria.**
  1. The claim tests of today (T-303-1 lists their TST ids from 05 §6, theme T-CLAIM) pass against the registered template with their assertions unchanged except those marked harness or rewrite in `tests.tsv`.
- **Replaces inventory groups.** STEP-CLAIM, STEP-ACTIVE
- **Scenarios.** S-303-1, S-303-2, S-303-3
- **Tests.** T-303-1
- **Phase.** PH-6a

#### REQ-304 Release, waiting, waiting-done, reassign

- **Statement.** The template steps reproduce R08, R09 and R14 (reassign).
- **Rationale.** Each was a code function.
- **Acceptance criteria.**
  1. The texts `release_not_holder`, `release_other`, `waiting_not_holder`, `reassign_not_lead`, `reassign_no_reason`, `reassign_same` are printed filled (old TST ids of theme T-CLAIM, 05 §6); `reassign_not_lead` contains no `TEAM_LEAD`.
- **Replaces inventory groups.** STEP-RELEASE, STEP-WAIT, STEP-REASSIGN
- **Scenarios.** S-304-1, S-304-2, S-304-3
- **Tests.** T-304-1
- **Phase.** PH-6a

#### REQ-305 Waiting cleared by the next step

- **Statement.** A set wait field is cleared, with `waiting.record` appended, after a step in `waiting.cleared_by_steps` or a note (`cleared_by_note`).
- **Rationale.** Today code in team/update.js `after`.
- **Acceptance criteria.**
  1. Note on a waiting item clears it (today's test).
- **Replaces inventory groups.** STEP-WAIT
- **Scenarios.** S-305-1
- **Tests.** T-305-1
- **Phase.** PH-6a

#### REQ-306 Recheck at publication

- **Statement.** Conditions in `recheck_at_publication` are evaluated against the merged files during publication; a failure rolls back (exit 3, the publication text naming the refusal). The refusal texts are the template keys `recheck_dependencies`, `recheck_limit`, `recheck_active_items` (filled); the line that wraps them is the publication failure line of today (src/shared/sync.js), unchanged (R2-038).
- **Rationale.** A claim depends on other files that may change concurrently.
- **Acceptance criteria.**
  1. Two racing claims past a limit: the second is rolled back (existing concurrency test, re-pointed).
- **Replaces inventory groups.** STEP-RECHECK, DI-PUBLISH-HOOK
- **Scenarios.** none (Covered by the existing race test of shared-update.test.js (re-pointed to the template))
- **Tests.** T-306-1
- **Phase.** PH-6a

#### REQ-307 Hand-off record step

- **Statement.** A step with `effect: handoff_record` builds the record (format DATA-INTEGRITY) after its conditions and arguments pass; the template reproduces R10 (record). The step's `effect` names its kind and `records_field` (template `handoffs`); a producer without status reads as the definition's `initial`, and a record's review field is a required part of the record (HO-DEFAULTS deleted).
- **Rationale.** Who records, when and with which arguments is team behaviour; the record format is not.
- **Acceptance criteria.**
  1. Contract/verification required by the file; commit format by the machinery (40-hex text unchanged).
- **Replaces inventory groups.** HO-RECORD, DI-HANDOFF-FORMAT
- **Scenarios.** S-307-1
- **Tests.** T-307-1, T-307-2
- **Phase.** PH-6b

#### REQ-308 Accept and reject a hand-off

- **Statement.** Template `accept-handoff`/`reject-handoff` reproduce R10 (receipts), with the text change `status <status>` (D-09).
- **Rationale.** Lead-only receipt is a team rule.
- **Acceptance criteria.**
  1. A member accepting is refused with today's text.
- **Replaces inventory groups.** HO-RECEIPT
- **Scenarios.** S-308-1
- **Tests.** T-308-1
- **Phase.** PH-6b

#### REQ-309 The close gate

- **Statement.** Condition `dependents_handoffs_accepted` refuses the close while a dependent edge is open (`close_gate` with every edge and its next command, `close_gate_missing_hint` when one is missing) and records `handoffs: none` plus `close_gate_none_record` when there is no dependent.
- **Rationale.** Today handoff-close.js and runCloseGate are code.
- **Acceptance criteria.**
  1. A close of an item with an open dependent edge prints `close_gate` filled with one `close_gate_edge` per edge; a close without dependents writes `handoffs: none` (the `records_field`/`none_value` of the condition, R1-010) and appends the filled `close_gate_none_record`.
- **Replaces inventory groups.** HO-GATE, HO-EDGE, HO-TEXTS, DI-HANDOFF-GRAPH
- **Scenarios.** S-309-1, S-309-2
- **Tests.** T-309-1
- **Phase.** PH-6b

### 10.4 Review

#### REQ-401 Review stages

- **Statement.** `review.stages_order`, `review.stages.<st>` (ready, active, reviewers, default_count) and `review.after_last_stage` define the stages; the entry's `review` list selects which apply (a stage not listed is skipped).
- **Rationale.** Today READY, STAGE_OF and next() are code over the shipped file.
- **Acceptance criteria.**
  1. A team with `review: []` goes from request-review straight to review complete; with only external, to ready for external review.
- **Replaces inventory groups.** ST-VOCAB, ST-NEXT
- **Scenarios.** S-401-1, S-401-2
- **Tests.** T-401-1, T-401-2
- **Phase.** PH-7

#### REQ-402 Entry review rules and defaults

- **Statement.** An entry rule `{stage, count, team?}` needs `count` distinct eligible passes on the current work commit; eligible = the stage's `reviewers` role, or the people and lists of the entry of `team` when given. An entry without `review` reads the definition's `defaults.review` at every read (D-32); nothing is written.
- **Rationale.** Today stageRules/eligible are code (and the `{team,count}` positional form).
- **Acceptance criteria.**
  1. With t1's entry `review: [{"stage":"peer","count":2,"team":"gold"}]`, two passes by members of gold (`reviews` lines `g1 <c>`, `g2 <c>` on work commit `<c>`) let the holder close item 1 (`backlog show 1` status `closed`); a pass by a t1 member does not count.
- **Replaces inventory groups.** ST-STAGERULES, ST-ELIGIBLE
- **Scenarios.** S-402-1
- **Tests.** T-402-1, T-402-2
- **Phase.** PH-7

#### REQ-403 Request review

- **Statement.** Template `request-review` reproduces R11.
- **Rationale.** Code function today.
- **Acceptance criteria.**
  1. Work commit set from HEAD unless covered; unclaimed item needs no holder.
- **Replaces inventory groups.** RV-REQUEST
- **Scenarios.** S-403-1
- **Tests.** T-403-1, T-403-2
- **Phase.** PH-7

#### REQ-404 Start review, verdicts, passes, history

- **Statement.** Template `start-review` and `review` reproduce R12: verdict words, pass records `<reviewer> <work_commit>`, the verdict named by `review.reject_clears.verdict` clears `review.reject_clears.field` and returns to in progress, history line.
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. A `--review changes` at the peer stage and at the external stage each returns the item to `in progress`, empties `reviews` (`review.reject_clears`), and appends the history line `<now> <stage> reject <actor> <work_commit>: <comments_line>`.
- **Replaces inventory groups.** RV-START, RV-REVIEW, RV-VERDICTS, RV-HISTORY, ST-ELIGIBLE
- **Scenarios.** S-404-1, S-404-2, S-404-3
- **Tests.** T-404-1, T-404-2
- **Phase.** PH-7

#### REQ-405 Review rules at the close

- **Statement.** Conditions `review_passes_met: {passes_field, commit_field}` and `no_later_own_work: {commit_field, subject_item_pattern}` (fields named by the definition, R1-010) with the machinery text keys of §4.7a (`review_rule_not_met`, `review_no_work_commit`, `review_lookup_failed`, `review_later_work`; `<reviewers_text>` from `reviewers_rule_team`, `reviewers_members`, `reviewers_role`).
- **Rationale.** Code today (reviewRefusal, laterOwnWork, leadingItemIds).
- **Acceptance criteria.**
  1. A close before the passes prints `review_rule_not_met` filled (`<need>` 1, `<have>` 0, `<reviewers_text>` = filled `reviewers_members`); with `git` failing in the working directory the close prints `review_lookup_failed` and nothing is written.
- **Replaces inventory groups.** RV-RULES
- **Scenarios.** S-405-1
- **Tests.** T-405-1, T-405-2
- **Phase.** PH-7

#### REQ-406 Author session and citation

- **Statement.** Condition `not_caller_session_of: author_session` and argument `cites_field: review_refs`.
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. Review in the author session refused with today's text.
- **Replaces inventory groups.** RV-REVIEW, RO-AUTHOR
- **Scenarios.** S-406-1
- **Tests.** T-406-1
- **Phase.** PH-7

#### REQ-407 Stale reviews and reassign-review

- **Statement.** `review.stale_after_seconds` (not the environment) decides staleness; template `reassign-review` reproduces R14.
- **Rationale.** F5: env override.
- **Acceptance criteria.**
  1. BACKLOG_REVIEW_STALE_SECONDS is ignored.
- **Replaces inventory groups.** RV-REASSIGN, RV-STALE, ENV-STALE
- **Scenarios.** S-407-1
- **Tests.** T-407-1, T-407-2
- **Phase.** PH-7

#### REQ-408 The close step

- **Statement.** Template `close` reproduces R13 (holder/lead/owner, summary, owner reason, gate first, review rules unless owner).
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. Owner close with a reason on an incomplete item passes (edit rules allow it).
- **Replaces inventory groups.** RV-CLOSE
- **Scenarios.** S-408-1, S-408-2
- **Tests.** T-408-1
- **Phase.** PH-7

### 10.5 Refinement, decisions, edit rules, completeness

#### REQ-501 Refinement steps

- **Statement.** Template `refine-start`, `refine-done`, `request-refinement-review`, `refinement-review` reproduce R02–R04 (the verdict `limit` acts as reject, F8).
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. The refinement scenario of `team.feature` (lead splits, member refines, lead requests review, reviewer completes → `ready`) passes against the registered template.
- **Replaces inventory groups.** RF-STEPS, RV-VERDICTS
- **Scenarios.** S-501-1, S-501-2
- **Tests.** T-501-1
- **Phase.** PH-8

#### REQ-502 Refinement reviewers from the entry

- **Statement.** Role `refinement-reviewer` = members and lead of the teams in the entry's `refinement_review`, anyone when empty.
- **Rationale.** F4: the key could not be defined.
- **Acceptance criteria.**
  1. See REQ-201 scenario.
- **Replaces inventory groups.** RF-STEPS
- **Scenarios.** S-502-1
- **Tests.** T-502-1
- **Phase.** PH-8

#### REQ-503 Owner decisions

- **Statement.** Template `request-decision` and `decision` reproduce R06; `decision` uses `sets_rules` with `within_limits_for_role` for the lead.
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. Past a limit the answer is recorded and no refiner set, with the limit text.
- **Replaces inventory groups.** RF-DECISION
- **Scenarios.** S-503-1
- **Tests.** T-503-1
- **Phase.** PH-8

#### REQ-504 Edit rules

- **Statement.** `edit_rules` are evaluated per §4.7 with the selectors of §5.5; the template reproduces R05 and R16.
- **Rationale.** Five code guards in lifecycle step().
- **Acceptance criteria.**
  1. For each of the five template edit rules one refusing and one passing scenario exist (S-504-1..S-504-10).
- **Replaces inventory groups.** RF-EDITS
- **Scenarios.** S-504-1, S-504-2, S-504-3, S-504-4, S-504-5, S-504-6, S-504-7, S-504-8, S-504-9, S-504-10
- **Tests.** T-504-1, T-504-2
- **Phase.** PH-8

#### REQ-505 Completeness

- **Statement.** Completeness rules (§5.6) decide `complete`/`incomplete` and the `missing` list; `team query --phase --json` shows `missing` (S92); user `show --json` never does.
- **Rationale.** Code today (missingFields, hasDefinitionOfDone).
- **Acceptance criteria.**
  1. The 14 definition-of-done inputs of `shared-new.test.js` (TST ids in 05 §6) give the same complete/incomplete answer under the template's `definition_of_done` rule as today.
- **Replaces inventory groups.** RF-COMPLETE, CR-DOD
- **Scenarios.** S-505-1, S-505-2
- **Tests.** T-505-1
- **Phase.** PH-8

### 10.6 Limits

#### REQ-601 Limit numbers in the team entry

- **Statement.** The numbers per level come from the entry's `limits` (§4.8); a level without a number has no limit; `wip-limits.json` is not read (migrated, REQ-011).
- **Rationale.** F3: the entry's `wip` was never read; the numbers belong to the team.
- **Acceptance criteria.**
  1. A team limit of 1 refuses the second start; no limits: no refusal.
- **Replaces inventory groups.** CFG-WIPFILE, WIP-LEVELS
- **Scenarios.** S-601-1, S-601-2
- **Tests.** T-601-1, T-601-2
- **Phase.** PH-9

#### REQ-602 What counts and whose it is

- **Statement.** `limits.active_item` and `limits.holder` decide counting; `count_scope` home or team.
- **Rationale.** Code today (inProgress, alsoActive, holderOf).
- **Acceptance criteria.**
  1. A refining item with a refiner counts against the member level.
- **Replaces inventory groups.** WIP-ACTIVE
- **Scenarios.** S-602-1, S-602-2
- **Tests.** T-602-1, T-602-2
- **Phase.** PH-9

#### REQ-603 within_limits evaluation and text

- **Statement.** Condition `within_limits` per §5.1; text `limit` with up to `limits.held_shown` holders (template 8) then `, ...` (R1-014). Level names: `member` replaces `agent` (D-09 list, R2-039).
- **Rationale.** Code today.
- **Acceptance criteria.**
  1. With entry `limits: {"member":1}` and ann holding item 1, `team update 2 --claim ann` prints the filled `limit` text naming level `member`, `<limit>` 1, `<count>` 1 and `<held>` = `<repository>#1`.
- **Replaces inventory groups.** WIP-LEVELS
- **Scenarios.** none (See S-601-1)
- **Tests.** T-603-1
- **Phase.** PH-9

#### REQ-604 The override

- **Statement.** `limits.override` lifts the listed levels when the field is set; template `wip-override` (lead, reason, combinable) writes it.
- **Rationale.** Code today (fieldsBefore).
- **Acceptance criteria.**
  1. The lead's override with a claim in one call passes the team limit.
- **Replaces inventory groups.** WIP-OVERRIDE
- **Scenarios.** S-604-1, S-604-2
- **Tests.** T-604-1
- **Phase.** PH-9

#### REQ-605 The wip view

- **Statement.** `team query --wip` counts per level from the entry numbers and lists items older than `views.wip.stale_hours`.
- **Rationale.** Code today with stale_hours from wip-limits.json.
- **Acceptance criteria.**
  1. With entry `limits: {"team":4}` and one item in progress, `backlog team query --team t1 --agent ann --wip` prints the line `team t1: 1 of 4` and the line `limits: <home>/teams.json` (R2-020).
- **Replaces inventory groups.** WIP-VIEW
- **Scenarios.** S-605-1, S-605-2
- **Tests.** T-605-1
- **Phase.** PH-9

### 10.7 Creation, binding, dependencies

#### REQ-701 Dependencies finished

- **Statement.** Predicate/condition `dependencies_finished` with `handoff_states` (§5.2): finished per the target's own definition; a target outside a team per the default words of the user commands (D-33).
- **Rationale.** Code today with the shipped finished words.
- **Acceptance criteria.**
  1. With `handoff_states: ["accepted","unrecorded"]` (template) a claim of an item whose producer is `closed` with an unaccepted record is refused (`dependencies_not_done`, `dep_handoff_unaccepted`); with a definition patched to `handoff_states: null` the same claim succeeds; a finished producer without a records field has edge state `unrecorded` (R1-015).
- **Replaces inventory groups.** DEP-FINISHED, HO-EDGE
- **Scenarios.** S-701-1
- **Tests.** T-701-1, T-701-2
- **Phase.** PH-9

#### REQ-702 Creation (team new)

- **Statement.** `team new` writes the user fields, `team` = the command team, `status` = `initial`, `create.sets`, appends `create.missing_section` when the body lacks the section, asks `create.ask` labels with `--ask`, places by `create.priority_by_severity`; `--status` refused (`create_status_flag`). `create.ask[]` is `{field, label}`: any field (R1-011).
- **Rationale.** Today split between team/new.js and user new (which writes team keys on every item).
- **Acceptance criteria.**
  1. Output and files equal today's team new (conformance).
- **Replaces inventory groups.** CR-TEAMNEW, CR-DOD, PC-NEWKEYS, PC-SEVERITY
- **Scenarios.** S-702-1, S-702-2, S-702-3, S-702-4
- **Tests.** T-702-1, T-702-2
- **Phase.** PH-8

#### REQ-703 Binding an item (set-team)

- **Statement.** Template `set-team` binds an unbound item (status → initial, D-07), refuses an unconfigured team (D-08), keeps a team on an item with a refiner key (unbinding refused), and admits active work only within the target team's limit. Items created before the migration carry no `stage`/`review_state` (REQ-011 removes them from every item, R1-018).
- **Rationale.** Code today; binding left the user word.
- **Acceptance criteria.**
  1. team.feature background (user new then --set-team) leaves status new.
- **Replaces inventory groups.** WIP-SETTEAM, BIND-UNBOUND
- **Scenarios.** S-703-1, S-703-2
- **Tests.** T-703-1
- **Phase.** PH-11b

#### REQ-704 Dependency integrity stays generic

- **Statement.** Existence, cycle, seq-uniqueness and stranded-dependent checks of `new`, `update --set-depends-on`, `move` and the publication stay as they are, for every item (decision AM).
- **Rationale.** DATA-INTEGRITY.
- **Acceptance criteria.**
  1. The dependency integrity tests (TST ids of theme T-DEPS and `shared-new`/`shared-move` existence and cycle tests in 05 §6) pass unchanged; `backlog new --depends-on 99` with no item 99 exits 1 with today's text.
- **Replaces inventory groups.** DI-REF
- **Scenarios.** S-704-1
- **Tests.** T-704-1
- **Phase.** -

### 10.8 Queue, plan, views

#### REQ-801 Predicate evaluator

- **Statement.** One evaluator implements §5.2 for conditions, offers, plan passes, views and limits.
- **Rationale.** Today each reader has its own filters.
- **Acceptance criteria.**
  1. T-801-1 evaluates every predicate key of §5.2 on one fixture where it holds and one where it does not, through the single evaluator used by conditions, offers, plan passes, views and limits (one import site, checked by the test).
- **Replaces inventory groups.** Q-POP, Q-VIEWS
- **Scenarios.** none (No scenario: see T-801-1)
- **Tests.** T-801-1
- **Phase.** PH-10a

#### REQ-802 team pop from queue.roles

- **Statement.** `team pop` answers by §4.7 `queue.roles`: an actor holding several queue roles is served in the order `queue.role_order` (no role name is fixed, D-22, R1-008, R2-010); the first offer with a matching item answers; a `mark` runs that step of the definition through §6 as the actor (whether it runs is decided only by the offer's `mark` key, never by an instruction text, R1-028; `team pop` never runs a non-team command and has no internal flag, R1-026); `holder_field` names the field the mark fills; `try_each` tries every matching item in queue order and lists refusals with `skipped_instruction` (R3-015); idle exit 3 (D-16).
- **Rationale.** queue.js holds the order in code.
- **Acceptance criteria.**
  1. The pop tests of today (TST ids of theme T-QUEUE in 05 §6) pass against the registered template.
  2. A test that changes every instruction text of the template gives the same actions and marks (R1-028).
  3. With a definition whose queue roles are `captain` and `crew` and `role_order: ["crew","captain"]`, an actor holding both is served the crew offer first.
- **Replaces inventory groups.** Q-POP, Q-REVIEWONLY, RF-HOWTEXT, DI-CONCURRENCY
- **Scenarios.** S-802-1, S-802-2, S-802-3
- **Tests.** T-802-1, T-802-2
- **Phase.** PH-10c

#### REQ-803 The lead's work item

- **Statement.** The template lead offers claim the team's work item (no refiner key, new, complete, dependencies finished) and continue it; a busy team makes the lead idle (`lead_busy`).
- **Rationale.** pop.js workItem is code.
- **Acceptance criteria.**
  1. The `team.feature` scenario "the lead takes its team's work item" passes against the registered template; the lead tries each free work item in queue order and the JSON key `skipped` lists `not taken <item>: <reason>` for each refused claim (R3-015 item 2).
- **Replaces inventory groups.** Q-LEADWORK
- **Scenarios.** S-803-1
- **Tests.** T-803-1
- **Phase.** PH-10d

#### REQ-804 team query --plan from queue.plan

- **Statement.** Plan passes in order; `assign` is `{pick: holder|role|first_idle|least_loaded, role?, exclude_role?, within_limits?}` (no role name fixed, R1-008); the JSON keys stay (D-16); the action names come from the template.
- **Rationale.** queue.js plan() is code.
- **Acceptance criteria.**
  1. The plan tests of today (TST ids of `shared-team-plan` in 05 §6) pass against the registered template.
  2. A pass `{pick:"least_loaded",role:"crew"}` on a definition with role `crew` assigns the member with the fewest held items.
- **Replaces inventory groups.** Q-PLAN, Q-REVIEWONLY
- **Scenarios.** S-804-1
- **Tests.** T-804-1, T-804-2
- **Phase.** PH-10b

#### REQ-805 Team views

- **Statement.** `team query --<view>` lists the command team's bound items in scope that match `views.<view>.select`, with the columns and JSON keys of `views.<view>.fields` (R1-016; `review_state` is no longer a column; the text view prints `status=<word>`); a view with `counts_limits` prints the limit counts. An undefined view is invalid input: `❌ backlog: view <v> is not defined by workflow <w>` on stderr, exit 2 (R2-024).
- **Rationale.** views.js is code.
- **Acceptance criteria.**
  1. `backlog team query --team t1 --agent ann --decisions --json` prints a JSON array whose objects have exactly the keys of `views.decisions.fields`.
  2. `--claimable` on a definition without `views.claimable` exits 2 with `❌ backlog: view claimable is not defined by workflow minimal`.
- **Replaces inventory groups.** Q-VIEWS
- **Scenarios.** S-805-1, S-805-2
- **Tests.** T-805-1
- **Phase.** PH-10a

#### REQ-806 Chunk scope in the entry

- **Statement.** The entry's `chunk_scope` caps chunk offers and view scope; `backlog.scope` is not read (migrated).
- **Rationale.** A per-folder file decided a team behaviour.
- **Acceptance criteria.**
  1. `chunk_scope: off` offers no chunk item.
- **Replaces inventory groups.** CFG-SCOPEFILE, Q-ROWS
- **Scenarios.** S-806-1
- **Tests.** T-806-1
- **Phase.** PH-10c

### 10.9 User-command code, binding, texts, guards, documentation, conditional and gap requirements

#### REQ-901 The binding port and user_commands

- **Statement.** User commands ask `binding.check(operation, items)` (§7) and act on its answer, and readers ask `binding.finished(item)` (true, false, or null for an item outside a team, which then uses the default words of the user commands (D-33)) wherever they need "finished" (R1-006); the operations and their mapping are §7; the texts are the bound team's `refusals`; the port is the only call from that code into `src/engine/`.
- **Rationale.** Decision AO and 7c-2c refusals become file rules; the user-command code holds no team text.
- **Acceptance criteria.**
  1. Each of the 12 operations: allowed and refused case with a fixture definition.
  2. Template reproduces R23 verbatim.
- **Replaces inventory groups.** BIND-TEXTS, BIND-UPDATE, BIND-REPLAN, BIND-ARCHIVE, BIND-IMPORT, BIND-CLEAN, BIND-SPLIT, BIND-ENTRYOF, PC-SEAM
- **Scenarios.** S-901-1, S-901-2, S-901-3, S-901-4
- **Tests.** T-901-1, T-901-2, T-901-3, T-901-4
- **Phase.** PH-11a

#### REQ-902 The user-command code enforces nothing

- **Statement.** No module under `src/shared/` (the code of the user commands) contains a status, stage, role, verdict or team word, compares a status with a word list other than the default words of the user commands (D-33), refuses or orders anything by a flow rule, reads a team file except through the port, or takes a team hook (D-17). `backlog new` outside a team writes no team key and always writes `owner` from the configuration's user (R1-004). The changes report of `backlog list changes` counts an item as held when the agent is in its holder field `owner` with `owned_since` set; team roles are not consulted (R1-019). The field table of `backlog fields` documents each field as data only; team meanings are documented in `docs/team-behaviour.md` from the definition (R1-030).
- **Rationale.** Owner principle.
- **Acceptance criteria.**
  1. Guard tests of `05-tdd-plan.md` §5 pass.
  2. User new writes: phase, seq, name, objective, summary, status, severity, repository, branch, commit, location, created, updated, updated_by, depends_on, owner (+ chunk/estimate/complexity/layer when given).
  3. `backlog list changes --agent ann --json` lists an item whose `reviewer` is `ann` (and `owner` is `bob`) under `others`, not under `held`.
- **Replaces inventory groups.** ST-SOLO, PC-NEWKEYS, PC-SEAM, CFG-OWNER
- **Scenarios.** S-902-1, S-902-2
- **Tests.** T-902-1, T-902-2, T-902-3, T-902-4, T-902-5
- **Phase.** PH-12

#### REQ-903 Refusal and instruction tables

- **Statement.** Every refusal and instruction text of the enforcer and the port comes from the definition's `refusals`/`instructions` (except the machinery texts of §8); placeholders per §4.7, filled by the machinery.
- **Rationale.** Owner: all texts in the file.
- **Acceptance criteria.**
  1. Conformance: every text of `templates/team.full.json` is produced by at least one test (coverage list).
- **Replaces inventory groups.** BIND-TEXTS, HO-TEXTS, RF-HOWTEXT, STEP-GATE, ST-FILL
- **Scenarios.** S-903-1, S-903-2
- **Tests.** T-903-1, T-903-2
- **Phase.** PH-4b

#### REQ-904 The hard-code allow-list

- **Statement.** Only the items of §8 stay in code; dead code (F12) is deleted. The guard test of REQ-905 (check 5) reads its allow-list from the §8 table, so the two cannot drift (R1-013).
- **Rationale.** Principle: generic machinery and data integrity only.
- **Acceptance criteria.**
  1. `user-guard.test.js` check 5 parses the §8 table of `docs/team-behaviour.md` (generated from 03-spec §8) and fails when a literal of `src/engine/` is neither in it nor a key or token of the schema.
- **Replaces inventory groups.** DI-ERR, DI-CLI, DI-SYNTAX, DI-LOCK, DI-UPGRADE, DI-SETUP, DI-STORE, DI-SYNC, DI-SAFETY, DI-FM, DI-STALE, DI-REPAIR, DI-INDEX, DI-ITEMSCHEMA, DI-ARCHIVE, DI-IDENTITY-FIELD, DI-MACHINE, DI-FINDINGS, DI-INPUT-IDENTITY, DEAD
- **Scenarios.** none (See T-904-1)
- **Tests.** T-904-1, T-904-2
- **Phase.** PH-13

#### REQ-905 Guard tests

- **Statement.** The build fails when (1) a flow literal or team word appears in `src/shared/` as a string literal or as a property name (`x.<word>`, `x['<word>']`) outside the allow-list; (2) `src/shared/` imports `src/team/` or any `src/engine/` module but `binding.js`; (3) any function of `src/shared/` declares a parameter, destructured option or variable named `team`, `seam`, `hooks` or `callbacks`; (4) a module of `src/engine/` or `src/team/` imports a command module of `src/shared/` (only the storage primitives listed in 05 §5 may be imported) or assigns to a property of an object imported from `src/shared/` (callback installation); (5) a literal of `src/engine/` is not in the §8 allow-list (R1-001, R1-013).
- **Rationale.** Keeps the principle from eroding.
- **Acceptance criteria.**
  1. Mutation checks: a copy of `update.js` with `team?.step(a)` added, a copy of an engine module importing `../shared/update.js`, a copy assigning `seam.x = f`, and a copy of `update.js` with `"in progress"` each make the guard fail with the check number.
- **Replaces inventory groups.** PC-SEAM
- **Scenarios.** none (See T-905-1)
- **Tests.** T-905-1, T-905-2, T-905-3
- **Phase.** PH-11c

#### REQ-906 Documentation of every key

- **Statement.** A reference page `docs/team-behaviour.md` (package), `backlog team validate --help`, `team workflow --help`, `team define --help`, COMMANDS.md, the skill reference and README name every key of the four schema files with its meaning; a test fails when a schema key is missing from the page.
- **Rationale.** Owner: every command and input documented accurately.
- **Acceptance criteria.**
  1. The test enumerates schema keys (paths) and greps the page.
- **Replaces inventory groups.** DI-HELP, DI-FIELDS
- **Scenarios.** none (See T-906-1)
- **Tests.** T-906-1, T-906-2
- **Phase.** PH-13

#### REQ-907 Conformance of the shipped template

- **Statement.** The conformance suite runs the migrated literal tests (05 §6) once, against the registered `team.json` template (R3-021); every row of §9 (R01..R29) has at least one passing test.
- **Rationale.** Migration changes where a rule lives, not what the shipped team does.
- **Acceptance criteria.**
  1. Counts of 05 §6 reconcile: each CODE-LITERAL row of `tests.tsv` has one disposition (unchanged, harness, rewrite, changed, deleted, misclassified) and each kept row maps to a §9 row.
- **Replaces inventory groups.** ST-VOCAB, ST-CANSTEP, ST-NEXT
- **Scenarios.** none (See T-907-1)
- **Tests.** T-907-1
- **Phase.** PH-4b

#### REQ-908 Default words of the user commands

- **Statement.** Decided by the owner ruling on the user flow (D-19, D-33): the user commands keep built-in default words, used as defaults only, in one module `src/shared/defaults.js` documented in `backlog --help` and COMMANDS.md: new item `pending`; `list new` = `pending`, `new`; finished = `closed`, `done`, `archived`; `list open` = every item whose status is not a finished default word (an unknown word such as `shipped` counts as open); `list done` = the finished default words; `backlog done <n>` writes `closed`; `archive done` archives the items with a finished default word; `next` and the open-first order use the same split. Any other value is accepted and stored exactly as typed (`update --status`, `new --status`; nothing rewrites a word); `backlog archive <n>` archives any item without refusal; an item with another word is shown by `backlog list` (the whole stack), `backlog list open` and `backlog show <n>`, never by `list new` or `list done`. A bound item is judged by its definition through `binding.finished` (R1-006).
- **Rationale.** The principle forbids team vocabulary in the user-command code; the user commands still need to know which items are finished to list, archive and order them.
- **Acceptance criteria.**
  1. After `backlog update 3 --status shipped`, `backlog list` and `backlog list open` show item 3 with `shipped`; `backlog list new` and `backlog list done` do not.
  2. `backlog update 1 --status Done` stores `Done` (not `closed`); `backlog list done` does not show it (the default words are lower case).
  3. `backlog archive 3` of the `shipped` item exits 0 and moves it to `archive/` without `--force`; its status stays `shipped`.
  4. `backlog done 1` stores `closed`; `backlog list done` shows item 1.
- **Replaces inventory groups.** ST-NORMALISE, PC-LISTWORDS, PC-FINISHED, PC-DEFAULT, PC-ARCHIVE-CLOSED, PC-DONE, PC-SEVERITY
- **Scenarios.** S-908-1, S-908-2, S-908-3, S-908-4
- **Tests.** T-908-1
- **Phase.** PH-12

#### REQ-909 Holding flags of the user commands refuse nobody

- **Statement.** Decided by the owner ruling on the user flow (D-20): `backlog update <n> --claim <who>` writes `owner` = `<who>`, `owned_since` = now and the default word `in progress`; `--release` clears `owned_since`, sets `owner` back to the configuration user and writes the default word `pending`; `--close [--summary <text>]` writes the default word `closed` and appends the summary, if given, as the body record `## Closed by <who> at <now>`. None of them refuses for any reason other than syntax (no "claimed by", no "needs --summary", no "only the claimer"); `--by` is recorded as the closer and no name is special (R1-027).
- **Rationale.** User claim refuses another holder and finished items — flow rules in the user-command code.
- **Acceptance criteria.**
  1. `backlog update 2 --claim bob` after `--claim alice` exits 0 and `backlog show 2 --json` has `owner` `bob` (today: `❌ 002-write-docs: claimed by alice since <time>; message alice or pick another item`).
  2. `backlog update 2 --close` without `--summary` exits 0 and the status is `closed` (today: `❌ 002-write-docs: --close needs --summary "<what was delivered>"`).
- **Replaces inventory groups.** PC-STEP
- **Scenarios.** S-909-1, S-909-2
- **Tests.** T-909-1
- **Phase.** PH-12

#### REQ-910 No limits and no dependency gate outside a team

- **Statement.** Decided by the principle (D-18): `backlog update --claim`, `backlog update --status`, `backlog move` and the publication recheck apply no work-in-progress limit and no dependency gate; limits exist only in team entries (`limits`), and `wip-limits.json` is migrated into them (REQ-011) and retired.
- **Rationale.** AM kept them shared; the principle says user enforces nothing.
- **Acceptance criteria.**
  1. With `wip-limits.json` `{"overall":1}` before the migration and one item `in progress`, `backlog update 2 --claim bob` of an item outside a team exits 0.
  2. `backlog update 2 --claim bob` of an item depending on an open item exits 0.
- **Replaces inventory groups.** PC-WIP, PC-DEPGATE
- **Scenarios.** S-910-1
- **Tests.** T-910-1
- **Phase.** PH-9

#### REQ-911 Session inputs — CONDITIONAL on Q-04

- **Statement.** CONDITIONAL on Q-04. Option A (recommended): `TEAM_NAME`, `TEAM_REPOSITORY`, `TEAM_BRANCH`, `BACKLOG_AGENT`, `BACKLOG_SESSION` stay documented session inputs (identity and scope only; what is enforced comes from the file). Option B: flags only (`--team`, `--agent`, new `--session`, `--scope-repository`, `--scope-branch` on every team command); the variables are not read. Under both options the fallback after the flag (and, with A, the variable) is the key `team`/`user` of `.backlog/config.json`; option B also drops that fallback (R1-032).
- **Rationale.** The owner rule of 2026-11-07 forbids environment overrides of the configuration; these variables are inputs of the session, not configuration.
- **Acceptance criteria.**
  1. A: with `TEAM_NAME=t1 BACKLOG_AGENT=ann` set and no flags, `backlog team pop --dry-run --json` answers for team t1 and agent ann; with `--team t2` the flag wins. B: the same command without flags exits 2 with `❌ backlog: team pop needs --team`.
- **Replaces inventory groups.** ENV-INPUT
- **Scenarios.** none (See S-207-1)
- **Tests.** T-911-1
- **Phase.** PH-5

#### REQ-912 Keys the old definition declared but nothing enforced — CONDITIONAL on Q-05

- **Statement.** CONDITIONAL on Q-05. Option A (recommended): not carried into schema 2 (D-15); behaviour unchanged. Option B: schema 2 adds `steps.<s>.max_rounds` + `after_max_rounds` (a step name run automatically, refusal `max_rounds_reached`), side status `blocks: [steps]` and `blocks_dependents`, and the queue predicate `older_than {field, seconds}`; the template sets refinement-review max 3 → request-decision, external review max 3 → lead reviews, review offers older than 300 s first.
- **Rationale.** F2: keys promised behaviour that never existed.
- **Acceptance criteria.**
  1. A: template has none of the keys. B: each key has scenarios (written when answered: S-912-B1..B4 in features/user-flow.feature).
- **Replaces inventory groups.** RF-STEPS, RF-DECISION
- **Scenarios.** S-912-1
- **Tests.** T-912-1
- **Phase.** PH-8

#### REQ-920 Read one chosen branch (decision AR)

- **Statement.** `backlog list branch <name> [--json]` prints the listing of that branch exactly as `list` prints the current one (JSON: same shape, `branch` = <name>); `backlog next branch <name> [--json]` likewise for `next`. Unknown branch with no items: `ℹ️  no item of branch <name> in this backlog (check the name)` exit 0. Read-only. Help per command; COMMANDS.md; skill reference.
- **Rationale.** AR = a (owner 2026-11-08); impact rows L12, S06, S87, S88.
- **Acceptance criteria.**
  1. Works from a detached HEAD (no current branch needed).
  2. No write, no commit.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-920-1, S-920-2
- **Tests.** T-920-1, T-920-2, T-920-3
- **Phase.** PH-14

#### REQ-921 list branches columns

- **Statement.** `backlog list branches` prints per branch: `branch`, `open`, `done`, `archived`, `total` (text columns in that order; JSON keys the same); open/done by `binding.finished` (the definition for a bound item, the default words of the user commands (D-33) otherwise, R1-006), archived = items under `archive/` of that branch.
- **Rationale.** Impact L13 (LEAD narrowed Active|Done|Archived|Total to open/done).
- **Acceptance criteria.**
  1. Totals equal open + done + archived.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-921-1
- **Tests.** T-921-1
- **Phase.** PH-14

#### REQ-922 Import every unarchived item

- **Statement.** `backlog import all --branch <source>` moves every item of the source branch that is not archived (open and finished), oldest first, after the queued ones; output `✅ imported <n> item(s) of <source> into <branch>: <slugs>`; user `import --branch` keeps moving open items only. Bound items obey `user_commands.import`.
- **Rationale.** Impact L43: the first release moved new, open and done items; an option that is not data is a subcommand (`all`).
- **Acceptance criteria.**
  1. Finished items move too; archived ones stay.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-922-1
- **Tests.** T-922-1
- **Phase.** PH-14

#### REQ-923 Several section lines in one call

- **Statement.** `backlog update <item> --section "<H>" --add-line '<JSON array of strings>'` appends each entry in order (with `--top`: inserted first, keeping their order); a value that is not a JSON array stays one line.
- **Rationale.** Impact L33 (one line per call since the section editor).
- **Acceptance criteria.**
  1. Array of 3 adds 3 lines; text only adds 1.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-923-1
- **Tests.** T-923-1
- **Phase.** PH-14

#### REQ-924 Skill copies refreshed after a version change

- **Statement.** When a command (other than `--help`, `--version`, `upgrade`, `setup`) runs with a CLI version different from `skill_version` in `.backlog/config.json`, it redeploys the skill copies exactly as `backlog setup` does, records the version, and prints `ℹ️  backlog: skill copies refreshed for <version>` on stderr; output and exit code of the command are unchanged; a failed refresh prints a warning and the command still runs.
- **Rationale.** Impact L52 (LEAD removed the refresh without a ruling).
- **Acceptance criteria.**
  1. Second command prints nothing; no refresh when versions match.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-924-1
- **Tests.** T-924-1
- **Phase.** PH-14

#### REQ-925 Exit-code contract

- **Statement.** Exit codes: 0 success (and idle answers that are not `team pop`); 1 refusal or failure of a valid request (refusal line on stdout; storage failures on stderr), including "not found" and a missing required value of a valid command (`new` without `--name`); 2 invalid input (unknown command, option or word, malformed value, invalid configuration) and the refusals of the configuration commands `team define`/`team workflow`, which print `❌ backlog: <text>` on stderr (R2-017) — `team workflow --show <unknown>` included (R2-018); 3 publication failure, and `team pop` idle; 4 the configured backlog repository is not cloned (`run backlog setup`, unchanged, R2-016); 5 stale view. Storage failures exit 1 (COMMANDS.md changes "2 invalid input or a failure" to "2 invalid input"). An uncaught program error exits 1 with `❌ backlog: internal error: <message>` (today 2: main.js `error.exitCode || 2`); the bootstrap's runtime error keeps exit 1. Documented in `backlog --help` and COMMANDS.md.
- **Rationale.** Impact L55 (NONE): re-tested 2026-11-08 in a throwaway clone: `show 999999` exit 1, `list bogusword` exit 2, `update 999 --name x` exit 1, `new` without --name exit 1, detached `list` exit 2.
- **Acceptance criteria.**
  1. A table test runs one command per class 0, 1, 2, 3, 4, 5 and the configuration refusal, and checks stream and code.
- **Replaces inventory groups.** DI-ERR
- **Scenarios.** S-925-1, S-925-2
- **Tests.** T-925-1, T-925-2
- **Phase.** PH-14

#### REQ-926 Detached HEAD

- **Statement.** Reads of a chosen branch use `list branch <name>` / `next branch <name>` (REQ-920) and work on a detached HEAD; every other command on a detached HEAD is refused with `❌ backlog: HEAD is detached: check out a branch (git switch <branch>), or read one with backlog list branch <name>` (exit 2). No `--branch` fallback option (owner rule: the current branch by default; a wider read is a subcommand).
- **Rationale.** Impact L56 (NONE): the first release accepted --branch as fallback everywhere.
- **Acceptance criteria.**
  1. Text names both ways out.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-926-1
- **Tests.** T-926-1
- **Phase.** PH-14

#### REQ-927 Items waiting on dependencies

- **Statement.** `backlog list blocked [--json]` lists the items of the current branch with at least one dependency that is not finished (`binding.finished`: the target's definition for a bound target, the default words of the user commands (D-33) otherwise, R1-006), each with the waits as `next` prints them; no team needed; read-only.
- **Rationale.** Impact S101: dependencies are a shared feature (AM), their waits were shown nowhere for unbound items.
- **Acceptance criteria.**
  1. An item depending on an open item is listed; on a finished one it is not.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-927-1
- **Tests.** T-927-1
- **Phase.** PH-14

#### REQ-940 Interactive creation and the update notice stay

- **Statement.** `backlog new --ask` / `backlog team new --ask` (owner AP) and the update notice (owner AI), restored in 7c-2c (b6a2852, 174c76d), keep their tests; impact rows L27 and L51 are resolved by them.
- **Rationale.** Already restored after the impact snapshot C.
- **Acceptance criteria.**
  1. The tests `new-ask.test.js` and `update-notice.test.js` (TST ids in 05 §6) pass unchanged at every phase gate.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-940-1
- **Tests.** T-940-1, T-940-2
- **Phase.** -

#### REQ-930 A lead-only deletion door for team items — CONDITIONAL on Q-06

- **Statement.** CONDITIONAL on Q-06. Option A (recommended): step `delete` (flag `--delete`, `actor: by`, value = reason) defined by the template for the lead from any unfinished word with a required reason; the machinery removes the item file and its index entry in one published change and appends nothing (the commit message carries the reason); dependents block it (DATA-INTEGRITY: stranded dependency refusal). `user_commands.clean` stays refused. Option B: no door; team items are never deleted (today). Option C: `user_commands.clean.allow: true` in the template (user clean deletes team items).
- **Rationale.** Withdrawn AT re-derived: the principle puts the choice in the file; whether a team door exists is a design choice.
- **Acceptance criteria.**
  1. A: lead deletes with reason; member refused; dependents refuse.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-930-1
- **Tests.** T-930-1
- **Phase.** PH-15

#### REQ-931 Moving team items — CONDITIONAL on Q-07

- **Statement.** CONDITIONAL on Q-07. Option A (recommended): keep user `move` for bound items (`user_commands.move-branch/move-repository: allow` in the template, today); Option B: template refuses user move and defines step `move` (`--move <branch>`, lead only) that changes the branch of a bound item inside the team's repository; `--to-repository` stays user-only and refused for bound items.
- **Rationale.** Withdrawn AU re-derived: a move changes the scope a team session is bound to.
- **Acceptance criteria.**
  1. A: today. B: user move refused with text; team move by the lead.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** none (See S-901-3)
- **Tests.** T-931-1
- **Phase.** PH-15

#### REQ-932 Abandoning an unfinished team item — CONDITIONAL on Q-08

- **Statement.** CONDITIONAL on Q-08. Option A (recommended): step `abandon` (`--abandon "<reason>"`, lead only, from any unfinished word, to `closed`, records `## Abandoned by <actor> at <now>\n\n<reason>`, skips review rules, keeps the close gate) — the item can then be archived by user archive. Option B: no step; `close --by owner --reason` is the only way (today).
- **Rationale.** Withdrawn AT (archive --force of unfinished team items) re-derived.
- **Acceptance criteria.**
  1. A: lead abandons a refining item; it becomes closed.
  2. A: the template defines `abandon` with `to` = a finished word of the definition (template `closed`) and `records` = the template text; a test reads the template, not a literal (R1-021).
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-932-1
- **Tests.** T-932-1
- **Phase.** PH-15

#### REQ-933 Interactive value of update — CONDITIONAL on Q-09

- **Statement.** CONDITIONAL on Q-09. Option A: `backlog update <item> --ask` asks on a terminal for name, objective, summary and an appended note (empty answer: unchanged), refused without a terminal (exit 2). Option B (recommended): not provided; `--ask` stays on `new` and `team new` only (owner AP named them).
- **Rationale.** Impact L32 (LEAD).
- **Acceptance criteria.**
  1. A: prompts in order; B: unknown option exit 2.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-933-1
- **Tests.** T-933-1
- **Phase.** PH-15

#### REQ-934 JSON envelope — CONDITIONAL on Q-10

- **Statement.** CONDITIONAL on Q-10. Option A: every `--json` output is `{"ok":true,"data":<today's payload>}`; consumers migrate first (additive phase with `--json=v2` is not allowed: no aliases, so a coordinated switch). Option B (recommended): raw payloads stay (consumers parse them today); documented per command.
- **Rationale.** Impact L53 (LEAD removed it).
- **Acceptance criteria.**
  1. B: for each command with `--json` (list in COMMANDS.md) a test parses the payload and checks its top-level type and keys against COMMANDS.md.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-934-1
- **Tests.** T-934-1
- **Phase.** PH-15

#### REQ-935 JSON error object — CONDITIONAL on Q-11

- **Statement.** CONDITIONAL on Q-11. Option A (recommended): with `--json`, a failure prints `{"ok":false,"error":{"code":"<CODE>","message":"<text>"}}` on stdout (codes: INVALID_INPUT, REFUSED, NOT_FOUND, STORAGE_ERROR, SYNC_FAILED, STALE, TEAM_CONFIG) with the same exit code; without `--json` unchanged. Option B: text only (today). Today one path already prints the object: the bootstrap's runtime error `{"ok":false,"error":{"code":"RUNTIME_ERROR","message":...}}` (exit 1); option A reuses that shape, option B removes it (R1-024).
- **Rationale.** Impact L54 (LEAD).
- **Acceptance criteria.**
  1. A: each code once.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-935-1
- **Tests.** T-935-1
- **Phase.** PH-15

#### REQ-936 User environment fallbacks — CONDITIONAL on Q-12

- **Statement.** CONDITIONAL on Q-12. Option A (recommended): `BACKLOG_CLI_BRANCH` and `BACKLOG_CLI_REPONAME` are not read (owner rule 2026-11-07: configuration only; REQ-926 covers detached reads). Option B: `BACKLOG_CLI_BRANCH` names the branch when git names none (detached HEAD), and `BACKLOG_CLI_REPONAME` is exported to child processes the CLI starts. The question also covers `BACKLOG_HOME` and `BACKLOG_ORIGIN_URL`, which override the configured backlog source today (R1-025): A does not read them either; B keeps them documented.
- **Rationale.** Impact L57, L58 (NONE).
- **Acceptance criteria.**
  1. A: a set variable has no effect.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-936-1
- **Tests.** T-936-1
- **Phase.** PH-15

#### REQ-937 Selecting an item by its queue position — CONDITIONAL on Q-13

- **Statement.** CONDITIONAL on Q-13. Option A (recommended): an item selector `P<n>` (the item at rank n of the current branch's queue) is accepted wherever an item is named; numbers stay seq and words stay slugs. Option B: not provided (today).
- **Rationale.** Impact L59 (NONE).
- **Acceptance criteria.**
  1. A: `update P0 --name x` changes the queue head.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-937-1
- **Tests.** T-937-1
- **Phase.** PH-15

#### REQ-938 History of items written before the event move — CONDITIONAL on Q-14

- **Statement.** CONDITIONAL on Q-14. Option A: `backlog setup` (one-time, when `backlog.db` exists) copies each item's events from `backlog.db` into the item files and removes the database in one commit. Option B (recommended): `backlog history <item>` with no recorded event prints `ℹ️  no history recorded for <slug> (events before the item-file history were not carried over; they stay in the repository history)` exit 0.
- **Rationale.** Impact S95 (NONE): history prints nothing for such items.
- **Acceptance criteria.**
  1. B: the info line.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** S-938-1
- **Tests.** T-938-1
- **Phase.** PH-15

#### REQ-939 Update notice timing — CONDITIONAL on Q-15

- **Statement.** CONDITIONAL on Q-15. Option A (recommended): wait at most 3000 ms; print the failure warning only for a real error (registry answer, network error), never for a timeout or a development checkout. Option B: 1500 ms and every failure warned (today). The re-check intervals (1 hour after a failure, 24 hours with `auto`, 7 days otherwise) stay as they are under both options (R1-033).
- **Rationale.** Withdrawn AV re-derived: a user feature, not flow.
- **Acceptance criteria.**
  1. A: timeout silent; error warned.
- **Replaces inventory groups.** none (gap requirement, see 09-gap-resolution.md)
- **Scenarios.** none (No scenario (needs a slow registry stub): see T-939-1)
- **Tests.** T-939-1
- **Phase.** PH-15

### 10.0 File identity, schema, discovery, validation, migration

#### REQ-016 Which workflow the running team uses after the migration — CONDITIONAL on Q-16

- **Statement.** CONDITIONAL on Q-16. Option A (recommended): `backlog team migrate` writes `"workflow":"team"` into an entry without `workflow`; the converted `example-team` definition is registered for teams defined later; the live entry keeps the stage name `peer`. Option B: `backlog team migrate --workflow <team>=<name>` sets the entry's workflow in the migration commit (the only path that changes a team in use); the converted definition is the template with the stage renamed.
- **Rationale.** R3-006: after the migration `team define` refuses to change a team with open items, so the choice is made inside the migration or not at all.
- **Acceptance criteria.**
  1. A: after `backlog team migrate` on a home whose entry t1 has no workflow, `teams.json` has `teams.t1.workflow` = `team`.
  2. B: `backlog team migrate --workflow t1=example-team` gives `teams.t1.workflow` = `example-team` and the converted definition registered under `example-team`.
- **Replaces inventory groups.** CFG-TEAMS
- **Scenarios.** S-016-1
- **Tests.** T-016-1
- **Phase.** PH-1

#### REQ-017 Items bound to teams that have no entry — CONDITIONAL on Q-17

- **Statement.** CONDITIONAL on Q-17. Option A (recommended): the migration removes `team` from such items, keeps their status word as stored, and lists each under `unbound (team <t> has no entry)`. Option B: the migration aborts with `❌ backlog: <n> items are bound to teams without an entry: <team> (<k>: <slugs>); define each team (backlog team define) and run backlog team migrate again`.
- **Rationale.** R3-009: twenty item files of the running backlog are bound to seven teams with no entry; no command can unbind them today.
- **Acceptance criteria.**
  1. A: an item bound to `ghost` loses `team` and appears in the migration output under `unbound (team ghost has no entry)`.
  2. B: the migration exits 2 with the text of option B and writes nothing.
- **Replaces inventory groups.** ST-LEGACY
- **Scenarios.** S-017-1
- **Tests.** T-017-1
- **Phase.** PH-1

#### REQ-018 Archived items with schema 1 fields — CONDITIONAL on Q-18

- **Statement.** CONDITIONAL on Q-18. Option A (recommended): the migration rewrites the front matter of archived items too (body untouched) and §8 names `team migrate` as the one writer allowed to change an archived item. Option B: archived items are left as stored; the old-item check of REQ-002 skips `archive/`, and readers show them as stored.
- **Rationale.** R3-008: 24 bound archived files carry `stage`/`review_state`; the read-only rule and migrate-or-fail collide.
- **Acceptance criteria.**
  1. A: an archived item with `stage` loses it after the migration and `backlog show` of it exits 0.
  2. B: the archived item is unchanged and `backlog show` of it exits 0 and prints `stage`.
- **Replaces inventory groups.** ST-LEGACY
- **Scenarios.** S-018-1
- **Tests.** T-018-1
- **Phase.** PH-1

#### REQ-019 Split slices without a team — CONDITIONAL on Q-19

- **Statement.** CONDITIONAL on Q-19. Option A (recommended): the migration binds every teamless slice whose parent is bound to the parent's team (with `refiner: ""`), and `backlog team new --split-from` always binds a slice; a slice outside a team is an ordinary item. Option B: teamless slices stay items outside a team; a team works them only after `--set-team`; the template offers none of them.
- **Rationale.** R3-015 item 1: today a teamless slice is offered to the session's team and joins it on claim; the enforcer acts only on bound items (D-06).
- **Acceptance criteria.**
  1. A: a teamless slice of a bound parent is bound by the migration and offered by `team pop`.
  2. B: the slice stays outside the team and `team pop` does not offer it.
- **Replaces inventory groups.** RF-JOIN
- **Scenarios.** S-019-1
- **Tests.** T-019-1
- **Phase.** PH-1

#### REQ-020 Upgrading a definition used by teams with open items — CONDITIONAL on Q-20

- **Statement.** CONDITIONAL on Q-20. Option A (recommended): `backlog team workflow --file` replaces a registered definition in use when every status word carried by an open item of its teams is a status of the new definition (and each item's review stage still exists); otherwise the REQ-015 refusal names the missing words. Option B: never (today): a changed definition is registered under a new name and teams move by `team define` once they have no open items.
- **Rationale.** R3-006: a fix to the template found after the migration can otherwise never reach the running team.
- **Acceptance criteria.**
  1. A: a definition that adds a step registers while items are open; one that drops `refining` while an item is `refining` is refused with `workflow team is used by teams with 1 open items in words not in the new definition: refining`.
  2. B: today's refusal.
- **Replaces inventory groups.** DI-DEFINE-INUSE
- **Scenarios.** S-020-1
- **Tests.** T-020-1
- **Phase.** PH-15

### 10.8 Queue, plan, views

#### REQ-807 Which items a team re-orders

- **Statement.** `queue.reorder_scope`: `all` (default) or `command_team`. With `command_team` a rank change (`--priority`, `--replan`) and a re-densify by a `backlog team` command re-order only the items bound to the command team; other items keep their positions (template `command_team` = today, R1-007).
- **Rationale.** R1-007: the seam `inScope` limited the re-order to the session team without a key.
- **Acceptance criteria.**
  1. With `command_team`, `team update 3 --priority 0` of t1 moves item 3 before t1's other items and leaves item 2 of team t2 at its index position.
  2. With `all`, the same command re-densifies every item.
- **Replaces inventory groups.** Q-REORDER
- **Scenarios.** S-807-1, S-807-2
- **Tests.** T-807-1
- **Phase.** PH-10b

### 10.9 User-command code, binding, texts, guards, documentation, conditional and gap requirements

#### REQ-928 Rows of list --json outside a team

- **Statement.** `backlog list --json` rows carry the index columns and the stored front-matter fields `owner` and `owned_since`; no derived field (`review_state`, `claimed_by`) is added (R1-016). The topology readers change first (consumer CON-02).
- **Rationale.** D-09 deletes the derived fields; the user list may not print team words (REQ-902).
- **Acceptance criteria.**
  1. `backlog list --json` of an item in review has no key `review_state` and no key `claimed_by`.
- **Replaces inventory groups.** ST-LEGACY
- **Scenarios.** S-928-1
- **Tests.** T-928-1
- **Phase.** PH-12

#### REQ-941 Team commands own their path

- **Statement.** `backlog team update|new|query|pop` are implemented end to end in `src/engine/` (D-17). They call only the storage primitives (item codec, index, lock, publication, numbering, path safety) of the modules listed in 05 §5; `src/shared/update.js`, `new.js`, `query.js`, `archive.js`, `router.js`, `status.js`, `store.js` and `wip-limits.js` take no team parameter; `src/shared/seam.js` and every consumer of it are deleted (R1-001).
- **Rationale.** The user modules hosted the whole team pipeline through injected hooks; the guard could not see them.
- **Acceptance criteria.**
  1. `grep -rn "seam" src/` finds nothing; the guard checks 3 and 4 of REQ-905 pass; every team test passes.
- **Replaces inventory groups.** PC-HOOKS, PC-SEAM
- **Scenarios.** none (No scenario: a source-structure rule; proved by T-941-1 and the guard tests of REQ-905)
- **Tests.** T-941-1
- **Phase.** PH-11c
