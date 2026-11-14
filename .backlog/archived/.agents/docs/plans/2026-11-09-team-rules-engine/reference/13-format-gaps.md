# 13 — Format gaps: team behaviours the behaviour file cannot express yet (2026-11-09)

Context: this chapter belongs to the team behaviour file set (`00-README.md`). The owner answers of round 2 (`11-owner-answers.md`)
ordered an inventory of every behaviour a running team relies on, each mapped to the format of `03-spec.md`; the inventory itself
lives in the team's private repository because it describes a private team. This chapter lists, in generic words, every place where
that inventory found a behaviour the format of `03-spec.md` cannot state, and proposes a generic key or condition for each. Names in
the examples (`peer refinement review`, `outside work review`, `lead-1`, `member-2`) are invented. No requirement of `03-spec.md`
changes here; an accepted proposal is carried into `03-spec.md`, `04-bdd.md`, `05-tdd-plan.md` and `06-migration-plan.md` in the
single refinement pass that round 1 of the owner answers describes.

How to read an entry: what the format lacks (two sentences or more), the proposed key with a valid and an invalid example, and, where
there is a real choice, two options with a recommendation. The decisions needed from the owner are listed again, one after another,
at the end.

## G-001 — Uniform review stages, the refinement review included

Today a definition models a work review as `review.stages` (ready and active words, reviewers, pass counts, the entry's `review`
list that switches stages on and off, stale reviews and their hand-on), but a refinement review only as ordinary steps with
verdicts. A team that reviews the refinement twice (for example a `peer refinement review` and an `outside refinement review`)
and the work twice can write all four, but the two refinement stages get none of the stage machinery: no pass count, no entry
switch, no stale detection, no reassignment, and every verdict target is written by hand. The work stages also share one verdict
target table, so a reject always returns to the same word whatever stage it came from.

Proposed key: `review.stages.<stage>` gains `group` (a name such as `refinement` or `work`), `pass_to` and `reject_to` (a word or a
token), and `review.groups.<group>.after_last_stage` replaces the single `review.after_last_stage`. The tokens `first_review_stage`
and `next_review_stage_if_satisfied` take the group of the step's `stages` legs. Valid: `{"stages_order": ["peer-refinement",
"outside-refinement", "peer-work", "outside-work"], "stages": {"peer-refinement": {"group": "refinement", "ready": "ready for peer
refinement review", "active": "peer refinement review", "reviewers": "member", "default_count": 1, "reject_to": "refining"}, ...},
"groups": {"refinement": {"after_last_stage": "ready"}, "work": {"after_last_stage": "review complete"}}}`. Invalid: a stage whose
`group` is not a key of `review.groups` → `def.json: review.stages.peer-refinement.group: x is not a key of review.groups`.

- **Option A — groups inside `review` (the proposal above).** One machinery serves every review: passes, entry switches, staleness
  and hand-on work the same for refinement and work stages, and the step definitions shrink to one start step and one verdict step
  per group. The schema and the enforcer grow by one level, and the conversion of an existing definition must move its refinement
  steps into stages.
- **Option B — keep refinement reviews as steps and add only the missing pieces to steps** (a `passes` key on a verdict step, a
  `stale_after_seconds` per step). The change is smaller and nothing existing moves. The four stages stay described in two different
  ways, so every later review feature has to be built twice.
- **Recommendation:** A, because the owner's direction is that every stage of a team is defined the same way in the file, and the
  second option repeats the problem for every future review feature.

## G-002 — Round cap per review stage with an escalation target

A team may allow at most a fixed number of review rounds per stage and then hand the item to an escalation reviewer (a lead or a
person) instead of a further round. The format has no counter of rounds and no rule that refuses a further round, so the cap lives
only in instructions, and an escalation reviewer cannot be allowed at the cap while being refused below it.

Proposed keys (generic and enforceable; the CLI holds no value): on a review stage (G-001) or on a verdict step,
`max_rounds` (whole number ≥ 1, counted as the entries of a named list field that the reject verdict appends to) and
`after_max_rounds` (`{to: <word>, reviewers: <role>, refusal: <text key>}`). After `max_rounds` rejects the stage refuses its
ordinary reviewers with `refusal` and accepts a verdict only from `reviewers`; below the cap the escalation role is refused. Valid:
`{"max_rounds": 2, "rounds_field": "outside_rejects", "after_max_rounds": {"to": "awaiting decision", "reviewers": "lead",
"refusal": "round_cap"}}`. Invalid: `{"max_rounds": 0}` → `def.json: steps.outside-review.max_rounds: must be at least 1`.

- **Option A — the escalation role records the verdict at the cap.** The item stays in the stage and only the escalation role may
  pass or reject it. This keeps the item's history in one place and matches a lead or person deciding after the last round.
- **Option B — the cap moves the item to a side status** (for example an owner decision) and the decision step returns it. This needs
  no new verdict rule, but the escalation verdict is recorded as a decision text, not as a review, and pass counts cannot use it.
- **Recommendation:** A, because the close rules count passes and option B records the final verdict where no rule can read it.

## G-003 — "Hand-off note required before this step"

A team may require that every session that ends a stage writes a hand-off into the item (what it did, why, the context the next
agent needs) before the next stage can start. The format can require a `--note` on the ending step (`arguments.note.required`), but
it cannot let the next stage's first step check that such a hand-off was written since the last status change.

Proposed condition: `handoff_note_since_status_change: {heading}` (passes when the body has an entry whose first line starts with
`heading` written after the item entered its current status). Valid: `{"handoff_note_since_status_change": {"heading": "## Stage
hand-off"}, "refusal": "no_stage_handoff"}`. Invalid: `{"handoff_note_since_status_change": {}}` → `def.json: <path>: missing key
heading`.

- **Option A — check on the ending step only** (today's `arguments.note.required`, plus G-004 for its structure). Nothing new is
  stored and the check runs where the writer is. A step that changes the status without a note (a lead's reassign, a release)
  leaves the next stage without a hand-off.
- **Option B — also check on the next stage's first step** (the condition above). The receiving agent is refused until a hand-off
  exists, whatever path the item took. It needs the time of the last status change, which the item history already records.
- **Recommendation:** B in addition to A, because the receiving side is the one that must not reload sources by necessity.

## G-004 — Content rules for an argument or a field

A team may require that a review comment is a numbered list of findings with a disposition each, that a hand-off note carries a
fixed block, that a decision question has a set number of sentences, or that a list field names documents of one folder. The format
tests only that an argument is present (`required`) or cites an entry of a list field (`cites_field`), and completeness tests only
presence, non-emptiness and a section.

Proposed key: `arguments.<a>.matches: [{pattern, refusal}]` and the completeness test `matches` with `field` and `pattern` (every
entry of a list field must match). Valid: `{"comments": {"required": true, "matches": [{"pattern": "(?m)^F1: (BLOCKING|GAP|NOTE)",
"refusal": "findings_format"}]}}`. Invalid: a pattern that is not a valid regular expression → `def.json: steps.review.arguments.
comments.matches[0].pattern: not a valid regular expression (<message>)`.

## G-005 — `blocks_dependents` on a side status

A team may want an item in a side status (for example awaiting an owner decision) to stop its dependents from moving on, even
dependents already claimed. Today a dependency only blocks a claim while it is unfinished; nothing reaches a dependent that is
already in progress.

Proposed key: `side_statuses.<w>.blocks_dependents: [step]` (the listed steps are refused on every item that depends on an item in
that side status, with the text `dependency_in_side_status`). Valid: `{"awaiting decision": {"enter": "request-decision", "leave":
"decision", "returns_to": "refining", "blocks_dependents": ["request-review", "close"]}}`. Invalid: `"blocks_dependents": true` →
`def.json: side_statuses.awaiting decision.blocks_dependents: must be array`.

## G-006 — A time test with its own duration

The predicate `stale` compares a time field with one global number, `review.stale_after_seconds`. A team that wants a different
wait for another rule (a close fallback some minutes after a recorded reminder, a reminder after a hand-off) must reuse the review
number, which ties two unrelated rules together.

Proposed predicate: `older_than: {field, seconds}` (passes when the field holds a time stamp older than `seconds`; an empty field
fails). Valid: `{"older_than": {"field": "close_reminder_at", "seconds": 1800}}`. Invalid: `{"older_than": {"field":
"close_reminder_at"}}` → `def.json: <path>.older_than: missing key seconds`.

## G-007 — Older-first queue ordering

A team may want a review request that has waited longer than some minutes to be offered before a member's own next work. Offers are
evaluated in file order and items in priority order, so age cannot move an item ahead.

Proposed key: an offer may carry `order: [{older_than: {field, seconds}}, "priority", "seq"]`; items matching the first entry come
first. Valid: `{"action": "review", "select": {...}, "order": [{"older_than": {"field": "review_requested_at", "seconds": 600}},
"priority", "seq"]}`. Invalid: `"order": ["age"]` → `def.json: queue.roles.member.offers[3].order[0]: matches none of the allowed
forms`.

- **Option A — an `order` key on the offer.** One offer covers old and new items and the age rule is visible where the offer is.
  The pop needs a sort step per offer.
- **Option B — two offers with the same action**, the first selecting `older_than` items (G-006), the second the rest. Nothing new
  beyond G-006 is needed. The definition repeats the select and the two offers can drift apart.
- **Recommendation:** B first (it needs only G-006 and is already readable), A only if a second ordering rule appears.

## G-008 — A numeric range in completeness

A team may cap an item's estimate (for example at 60 minutes, review included) so that larger work is split. The completeness test
`positive_integer` only checks that a number is above zero.

Proposed key: completeness rules accept `at_most` and `at_least` with `positive_integer`. Valid: `{"name": "estimate_min",
"field": "estimate_min", "test": "positive_integer", "at_most": 60}`. Invalid: `"at_most": "60"` → `def.json:
completeness[2].at_most: must be whole number`.

## G-009 — Where team templates live, and defining a team from one

Round 1 of the owner answers moved team rules out of the package into team templates kept by each team. The format has no
configuration key that names where those templates are, and `backlog team define` takes only a complete definition file.

Proposed configuration key: `team_templates` in `.backlog/config.json`, a folder relative to the backlog folder (default: absent,
no template is found). Proposed command: `backlog team define --template <name> --name <team> --lead <agent> --members
<agent>,...` reads `<team_templates>/<name>.json` (the workflow definition) and an optional `<name>-entry.example.json` (the entry
keys other than the people and lists), registers the workflow if it is not registered or is identical, and writes the entry with
the people and lists from the command line. Templates are read when a team is defined, never when an item changes. Example of use:
a new lead runs `backlog team define --template review-twice --name t-web --lead lead-1 --members member-1,member-2` and the team
starts with every default rule of the template. Invalid: `--template` naming no file → `❌ backlog: team define: template
review-twice not found in <team_templates>` (exit 2).

## G-010 — Named limits with their own counted items

A team may allow two top-level items at a time while it works at most five split items. The limits of the format count one kind
of item (`limits.active_item`) at every level, so two different counts cannot be stated.

Proposed key: `limits.named.<name>: {active_item, scope: home|team}` with the number in the entry's `limits.named.<name>`, usable
in `within_limits` as a level name. Valid: `{"named": {"top-level": {"active_item": {"field_empty": "split_from"}, "scope":
"team"}}}`. Invalid: a named limit that shadows a level (`overall`) → `def.json: limits.named.overall: is a level name`.

## G-011 — A step that files a linked follow-up item

A team may require that a non-blocking finding becomes a separate item that waits for an owner decision and holds a named gate
item (for example the branch's closing item) until decided. Today that takes three separate commands, and nothing makes the link
happen.

Proposed key: a step `effect` of kind `create_linked`: `{kind: "create_linked", status: <side status>, gate_field: <field naming
the gate item>, name_template: <text>}`; the new item depends on nothing, is bound to the team and is added to the gate item's
`depends_on`. Valid: `{"kind": "create_linked", "status": "awaiting decision", "gate_field": "closing_item", "name_template": "GAP
<seq>: <value>"}`. Invalid: a `status` that is no side status → `def.json: steps.file-gap.effect.status: ready is no side status`.

## G-012 — Rules on splitting, and tests on the parent item

A team may refuse a split of an item that is already a split item or already has children unless a reason is recorded, may require
a family map in the parent before a child can be claimed, and may put children in the queue before their parent. `create` has no
condition, and no predicate reads the parent item.

Proposed keys: `create.split_requires: [condition]` (evaluated by `backlog team new --split-from`, with `parent_has_children` and
`parent_is_split_item` as condition tests and `argument_present: "reason"`), `create.split_rank: "before_parent"`, and a predicate
`parent: <predicate>` that evaluates a predicate on the parent item. Valid: `{"split_requires": [{"unless": {"argument_present":
"reason"}, "not": {"parent_has_children": true}, "refusal": "resplit_needs_reason"}]}`. Invalid: `"split_rank": "top"` →
`def.json: create.split_rank: must be one of before_parent, end`.

## G-013 — A test on the caller's role

A lead may claim an item for a member over the dependency lock with a recorded reason. The actor of that claim is the member (the
flag value), so the existing tests (`actor_has_role`) cannot see that the caller is the lead.

Proposed predicate: `caller_has_role: <role>` (and `caller_lacks_role`). Valid: `{"unless": {"all": [{"caller_has_role": "lead"},
{"argument_present": "reason"}]}, "dependencies_finished": {"handoff_states": ["accepted"]}, "refusal": "dependencies_not_done"}`.
Invalid: `{"caller_has_role": "nobody"}` → `def.json: <path>.caller_has_role: role nobody is not defined in roles`.

## G-014 — An ordered reviewer fallback

A team may let a second outside reviewer record a verdict only after the first one recorded that it is unavailable. The existing
`last_review_rejected` reads only review histories and a fixed verdict word, so the order cannot be stated for any list field.

Proposed predicate: `last_entry_matches: {field, pattern}` (passes when the last entry of the list field matches). Valid: `{"when":
{"actor_has_role": "second-reviewer"}, "last_entry_matches": {"field": "outside_reviews", "pattern": "^\\S+ unavailable "},
"refusal": "second_reviewer_first"}`. Invalid: `{"last_entry_matches": {"field": "outside_reviews"}}` → `def.json:
<path>.last_entry_matches: missing key pattern`.

## G-015 — Timed actions

A team may want a reminder repeated every few minutes, an alert after a wait, or a warning before a run ends. The CLI acts only when
a command runs, so the format has no trigger on time.

- **Option A — keep timed actions outside the file.** The scripts that run beside a team keep them, and read the durations they need
  from their own settings. The file stays a description of what a command may do, and no scheduler enters the CLI.
- **Option B — a `timers` key that a separate scheduler reads** (`{name, select, older_than, run: <step>}`), with a read-only command
  that lists the due timers. The rules stay in one file, but a scheduler must exist and run, and the CLI would document behaviour it
  does not run itself.
- **Recommendation:** A, because the owner principle is that the CLI enforces what the file defines when a command runs; a timer is
  not a command.

## G-016 — An instruction after any step

A team may want each ending step to print its own closing line (for example a different reply word after a review request than after
a close). A step can print only the one `session.end_text`, and `notice_rules` exist only on verdicts.

Proposed key: `notice_rules` allowed on every step (the deletion of the step-level notice in R2-009 is reversed). Valid:
`{"notice_rules": [{"instruction": "reply_review_requested"}]}`. Invalid: `{"notice_rules": [{"text": "x"}]}` → `def.json:
steps.request-review.notice_rules[0]: missing key instruction`.

## G-017 — A test on the hand-off edges of the item's dependents

A team may require that the producer records a hand-off for every dependent before it asks for review, and may want a view of the
items whose hand-offs wait for acceptance. `dependents_handoffs_accepted` is a condition only (not a predicate) and checks only the
accepted state.

Proposed predicate: `dependents_handoffs_in: {states: [state]}` (every dependent's edge state is in the list; with no dependent it
passes). Valid: `{"dependents_handoffs_in": {"states": ["unaccepted", "accepted"]}, "refusal": "handoff_before_review"}`. Invalid:
`{"dependents_handoffs_in": {"states": ["done"]}}` → `def.json: <path>.dependents_handoffs_in.states[0]: must be one of accepted,
unrecorded, unaccepted, stale, rejected, missing`.

## Decisions for the owner

Each decision below is described in full in its section above; this list repeats the choice so the decisions can be taken one
after another.

1. **G-001, uniform review stages.** A refinement review can be written today only as plain steps, so it lacks the pass counts,
   entry switches, stale detection and hand-on that work review stages have. Option A puts every review stage, refinement and
   work, into `review.stages` with a group per kind; it is the larger change, and the conversion moves refinement steps into
   stages. Option B adds the missing pieces to steps; it is smaller, but every later review feature must be built twice.
   Recommendation: A.
2. **G-002, the escalation at the round cap.** After the last allowed round the item needs a final verdict from an escalation role.
   Option A lets only that role record a verdict in the same stage, which keeps the passes countable for the close rules. Option B
   moves the item to a side status and records the answer as a decision, which no pass rule can read. Recommendation: A.
3. **G-003, where the hand-off is checked.** A required note on the ending step does not cover a status change made without that
   step. Option A checks only the ending step; option B also refuses the next stage's first step until a hand-off exists since the
   last status change. Recommendation: B in addition to A.
4. **G-007, older-first ordering.** Age cannot move an item ahead in the pop today. Option A adds an `order` key to an offer;
   option B uses two offers with the time test of G-006 and needs nothing else. Recommendation: B first.
5. **G-015, timed actions.** The CLI acts only when a command runs. Option A keeps timers in the scripts beside a team; option B adds
   a `timers` key and a scheduler. Recommendation: A.
