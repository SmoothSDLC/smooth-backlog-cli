# 07 — How the lead and member skills use the same rule set

Context: a team's agents follow instructions (skills) that tell them how to work: a lead skill (coordinate, split, accept) and a member
skill (take work, hand it on). Owner ruling R8 says the lead and member skills use the team's rule set directly, so the rules are written
once, in `teams.json`, and never restated in a skill. This chapter fixes what a skill reads, in which order it acts, and what the public
backlog skill of the CLI repository (`templates/skills/backlog/SKILL.md`) says about team work. The rule set of a particular team and its
skills are built in that team's own repository (entry plan Task 6), not here.

## 1. What a skill reads (every read is a CLI command, never the file)

| need | command | what comes back |
|---|---|---|
| the team's whole rule set, as written | `backlog team query rules --json` | the entry exactly as stored: people, item definition with descriptions, rule table, pop table, filters |
| which steps exist and what each takes | `backlog team query steps` | per step: its arguments (`--note`, `--verdict`, ...) and its rule ids in table order |
| the next action | `backlog team pop --json` | `action` (a step name), `item`, `entry`, `rule`, the whole item after the step; or `{"action": "idle"}`, exit 3 |
| why a step is refused | `backlog team query check <item> <step> [--<arg> <value>]` | the deciding rule's id and its text, or the changes it would make |
| a list the team named | `backlog team query filter <name>` | the items of that filter |
| the current state of one item | `backlog team query <item> --json` | envelope, fields, body, history |

A skill reads `backlog team query rules` once per session, at the start, and treats the table the way chapter 03 section 3 says a person
reads it: for a step, the rules naming it from the top; the first whose condition holds decides. Field descriptions in the item definition
tell the agent what each field means; rule ids and deny texts tell it why it was refused.

## 2. The session loop of a member

1. `backlog team pop --json`. Idle (exit 3): nothing to do now; the skill's own wait behaviour applies.
2. Do the work the step stands for (the step name and the item's fields say what; the team's descriptions explain them).
3. Take the next step with `backlog team update <item> <step> --<arg> <value>`, for example
   `backlog team update 42 hand-to-check --note "parser done; run the unit tests"`.
4. A refusal (exit 1) prints the text and the rule id; the agent fixes what the text names (writes the note, waits for a dependency) and
   does not retry blindly. `backlog team query check` answers the same question without acting.
5. A `say` text after a success is an instruction of the team (for example "end this session now"); the skill obeys it.

## 3. The lead

- The lead changes the rules by editing `teams.json` in its working copy of the backlog repository, running `backlog team validate` until it
  reports no error, then committing and pushing with git. The CLI never writes the file.
- `backlog team query plan` shows what pop would offer each person; the lead uses it to see idle members and blocked work, and filters for
  the team's own lists (decisions, waiting items).
- Splitting is a step and a creation: the lead's step that opens a split (in the parallel-work example `split-start`), then
  `backlog team new --parent <item> --name "<child>" --<arg> <value>` per child; the team's rules update the parent's child list and the
  queue order.

## 4. What a skill must not do

- Restate a rule ("the holder closes", "at most three in progress"): the rule is in the file; a restated copy drifts.
- Read or write item files, `index.json`, `numbers.json` or `teams.json` directly (writing `teams.json` is the lead's edit described in
  section 3, then validate).
- Name a status, stage or role word in instructions as if the CLI knew it: the words are the team's and come from
  `backlog team query rules`.

## 5. The public backlog skill of the CLI repository

The "Team work" section of `templates/skills/backlog/SKILL.md` (lines 49 to 79 today) is replaced by a generic text: a team is defined in
`teams.json`; the commands of chapter 04 section 1 with their scenarios; the session loop of section 2; how to read a refusal; and a pointer
to the example rule sets (shipped as documentation, never read by the CLI). The lines that describe today's per-step flags, `wip-limits.json`,
`team define` and `team workflow` are removed. The "Working alone" section loses the sentence about user commands refusing team items
(line 43 today): user commands no longer see team items.

## 6. The scripts and skills beside a team

The consumer rows of `reference/consumers.tsv` (scripts that parse `list --json`, read status words, export TEAM_LEAD, call
`team define`) change with the team's rule set in entry plan Task 6; `design/coverage.tsv` gives each its state and what it reads from the
CLI afterwards. Two contracts stay as they are for them: `backlog team pop --json` keeps the key `action` and exits 3 when idle.
