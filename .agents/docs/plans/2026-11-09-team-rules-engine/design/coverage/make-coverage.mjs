// Builds design/coverage.tsv and design/coverage-counts.tsv from the inventories of reference/ (node coverage/make-coverage.mjs, run
// from design/). Every input row gets exactly one terminal state; the script stops when a row is missing, doubled, unmapped, or names
// an example or pattern rule that does not exist. States: BAKE-IN (coded CLI behaviour, a language construct, a field, a command or a
// rule of a shipped example), LAZY-LOAD (an ordinary rule a team writes when it wants it; the pattern rule that states it is named and
// tested), SKIP (dropped, with the reason), DEFERRED-WITH-EXPLICIT-BLOCKER (the blocker is named).
import { readFileSync, writeFileSync } from 'node:fs';

const REF = '../reference/';
const tsv = f => { const [head, ...rows] = readFileSync(REF + f, 'utf8').trimEnd().split('\n').map(l => l.split('\t')); return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))); };
const md = f => readFileSync(REF + f, 'utf8');
const B = 'BAKE-IN', L = 'LAZY-LOAD', S = 'SKIP', D = 'DEFERRED-WITH-EXPLICIT-BLOCKER';
const T8 = 'entry plan Task 8 (gap review of the branch backlog) files it as its own backlog item: a user-command feature, outside the rules engine';
const T6 = 'entry plan Task 6 (the team rule set and the lead and member skills in the backlog repo) changes this consumer; chapter 07 fixes what it reads from the CLI';
const open = q => `owner question ${q} stays open in reference/08-owner-questions.md: a user-command question outside the rules engine`;
const CHUNK = 'entry plan Task 6 states whether the owner\'s team keeps chunk work across repository folders; if it does, the pop table gains a folders key before Task 5 (chapter 03 section 12)';

// ---- inventory.tsv: one terminal state per group (reference/01-inventory.md section 3 gives each group's rule)
const MACH = (what, ch) => [B, `machinery: ${what} (chapter ${ch})`, ''];
const GROUP = {
  'DI-ERR': MACH('exit codes 0, 1, 2, 3, 5', '04'), 'DI-CLI': MACH('command syntax', '04'), 'DI-SYNTAX': MACH('command syntax; the arguments of a team step are the $arg names its rules read', '04'),
  'DI-LOCK': MACH('one writer per clone', '04'), 'DI-UPGRADE': MACH('package upgrade', '04'), 'DI-SETUP': MACH('storage location', '02'), 'DI-STORE': MACH('JSON item store', '02'),
  'DI-SYNC': MACH('publication; a team step is evaluated again on the rebased items', '04'), 'DI-SAFETY': MACH('path safety and secrecy', '02'),
  'DI-FM': MACH('the markdown reader survives only inside backlog team migrate; items are JSON', '06'), 'DI-STALE': MACH('stale-read guard of user commands; team commands re-run on the upstream files instead (R1)', '04'), 'DI-REPAIR': MACH('unreadable JSON item repair', '02'),
  'DI-INDEX': MACH('the index, structure unchanged', '05'), 'DI-HELP': MACH('help texts', '04'), 'DI-FIELDS': [B, 'field: backlog fields prints the built-in user item definition; backlog team query rules prints a team\'s (chapter 02)', ''],
  'DI-ITEMSCHEMA': MACH('the JSON item envelope', '02'), 'DI-REF': MACH('referential integrity of item and items fields, by type', '02'), 'DI-ARCHIVE': MACH('the archive folder; archived items take no step', '04'),
  'DI-IDENTITY-FIELD': MACH('seq and slug in the envelope', '02'), 'DI-PUBLISH-HOOK': MACH('the step is evaluated again after the rebase, in place of the publish hook', '04'), 'DI-GIT': [B, 'language: $session.commit (chapter 03)', ''],
  'DI-HANDOFF-FORMAT': [S, '-', 'no coded hand-off record: a team states hand-offs as fields, and a new record withdraws the acceptance with a related remove instead of a digest (pattern patterns/record-handoff)'],
  'DI-HANDOFF-GRAPH': [S, '-', 'no coded hand-off graph: dependents are found with some/every over $team.items (pattern patterns/close-dependents-accepted)'],
  'DI-DEFINE-IO': [S, '-', 'owner ruling R5: the CLI never writes the team file'], 'DI-DEFINE-INUSE': [S, '-', 'owner rulings R5 and R6: no registration; a team edits its own rule set and the rules apply at each step'],
  'DI-MACHINE': MACH('the evaluator', '03'), 'DI-CONCURRENCY': MACH('concurrency', '04'), 'DI-FINDINGS': MACH('index findings', '05'), 'DI-INPUT-IDENTITY': MACH('the writer of the stale guard is the agent for team commands and the user for user commands (R3b)', '04'),
  'CFG-TEAMS': MACH('team file reader at the location .backlog/config.json resolves (R22)', '01'), 'CFG-TEAMS-SILENT': MACH('an unreadable or invalid teams.json stops a team command (exit 2), never an empty file', '01'),
  'CFG-WORKFLOW-LOAD': [S, '-', 'owner ruling R5: no workflows.json and no shipped workflow; the rules are in teams.json'], 'SHIP-TEAMCACHE': [S, '-', 'owner rulings R1 and R5: the shipped workflow is deleted'],
  'CFG-SCOPEFILE': [D, CHUNK, 'backlog.scope set the chunk scope across repository folders, which the pop table cannot state yet'],
  'CFG-WIPFILE': [B, 'example: parallel/claim-limit-person, parallel/claim-limit-team', 'wip-limits.json is no longer read; a limit is a count rule'],
  'ST-VOCAB': [B, 'field: status.values and status.final of the team item definition (chapter 02)', ''], 'ST-FINISHED': [B, 'field: status.final (chapter 02)', ''],
  'ST-SOLO': [S, '-', 'owner ruling R3: user items have no review'], 'ST-STAGERULES': [L, 'pattern: patterns/review-pass-peer, patterns/review-pass-outside, patterns/close-passes', ''],
  'ST-ELIGIBLE': [B, 'example: parallel/check-not-own, scrum/take-review', ''], 'ST-LEGACY': [S, '-', 'owner ruling R4: no translation on read; backlog team migrate converts every item once'],
  'ST-NORMALISE': [S, '-', 'decision D-19: a user status is stored as typed; a team value is checked against the field values (chapter 02)'],
  'ST-CANSTEP': [B, 'language: the rule table, when on $item.status (chapter 03)', ''], 'ST-NEXT': [B, 'language: do.set.status (chapter 03)', ''], 'ST-VALIDATE': [B, 'command: backlog team validate (chapter 08)', ''],
  'ST-FILL': [B, 'language: {$...} placeholders in deny and say texts (chapter 03)', ''],
  'BIND-TEXTS': [S, '-', 'owner rulings R3a, R16, R19: without --show-all a user command never meets a team item, with it the item is allowed, so no refusal text remains'],
  'BIND-UPDATE': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'), 'BIND-REPLAN': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'), 'BIND-ARCHIVE': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'),
  'BIND-IMPORT': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'), 'BIND-CLEAN': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'), 'BIND-SPLIT': MACH('user commands see only items without a team unless --show-all is given; with it they may change team items (R3a, R16, R19)', '04'),
  'BIND-NOSTATUS': MACH('default refusal when no rule matches', '03'), 'BIND-ENTRYOF': MACH('a team command acts on the items of its team and on items without a team', '04'),
  'BIND-UNBOUND': [B, 'example: parallel/adopt, patterns/release-to-users', 'language: effect team; only a rule that binds an item without a team may change it (Q-19 answer B, chapter 03)'], 'BIND-CLOSESTATUS': [S, '-', 'no status step in code (R1)'],
  'PC-LISTWORDS': [B, 'field: default words of the built-in user item definition (decision D-33, chapter 02)', ''], 'PC-FINISHED': [B, 'field: default words of the built-in user item definition (decision D-33, chapter 02)', ''],
  'PC-DEFAULT': [B, 'field: default words of the built-in user item definition (decision D-33, chapter 02)', ''], 'PC-DONE': [B, 'field: default words of the built-in user item definition (decision D-33, chapter 02)', ''],
  'PC-SEVERITY': [B, 'field: severity of the built-in user item definition (chapter 02)', ''], 'PC-ARCHIVE-CLOSED': [S, '-', 'decision D-19: user archive never refuses because of the status'],
  'PC-NEWKEYS': [S, '-', 'owner ruling R3: user new writes only the built-in user fields; team new writes the team item definition defaults'],
  'PC-STEP': [S, '-', 'decision D-20: the user refusals are deleted; the field writes stay as user defaults'], 'PC-WIP': [S, '-', 'decision D-18: no limit on user commands'],
  'PC-DEPGATE': [S, '-', 'decision D-18: no dependency gate on user commands'], 'PC-SEAM': [S, '-', 'decision D-17: the user-command code has no team seam'],
  'PC-HOOKS': [S, '-', 'decision D-17: team commands own their code path'], 'PC-HELD': [S, '-', 'held is the user holder field only; team roles are not read by user commands'],
  'PC-FIELDDOCS': [B, 'field: the built-in user item definition documents data only (chapter 02)', ''], 'PC-ARCHIVE-WORD': MACH('archived is the folder (envelope key archived), no status is written', '02'),
  'ENV-INPUT': MACH('session inputs: flag, then variable, then configuration key; $session.* references', '04'), 'ENV-LEAD': [S, '-', 'the lead is a role in people; SMOOTH_BACKLOG_CLI_TEAM_LEAD and --lead are not read'],
  'ENV-STALE': [L, 'pattern: patterns/take-over-stale-review', 'the wait is a number in the rule (function age)'], 'ENV-OPS': MACH('operator inputs', '04'),
  'ENV-SOURCE': [D, open('Q-12'), ''], 'ENV-TESTSEAM': [S, '-', 'production code reads no test variable'],
  'RO-MEMBERS': MACH('people: name to roles; $caller.roles', '01'), 'RO-AUTHOR': [L, 'pattern: patterns/review-own-session', ''],
  'RO-SAMEWORKER': [L, 'pattern: patterns/review-own-session, patterns/ended-session', 'a session is SMOOTH_BACKLOG_CLI_SESSION ($session.id); the agent name stays stable'],
  'RO-CALLER': [S, '-', 'owner ruling R15: a flag that differs from the variable is not refused; the caller is the resolved agent (chapter 01 section 5)'], 'RO-ACTSAS': [S, '-', 'no acting-as: a step that names another person takes it as an argument its rules check (example extreme-programming/pair-needs-navigator)'],
  'SC-SCOPE': [L, 'pattern: patterns/scope-branch', ''], 'SC-BRANCHBOUND': [L, 'pattern: patterns/scope-branch', ''], 'SC-INTEAM': MACH('a team command acts on the items of its team and on items without a team', '04'),
  'STEP-GATE': [B, 'language: the rule table and its deny texts (chapter 03)', ''], 'STEP-CLAIM': [B, 'example: parallel/claim, parallel/claim-not-ready', ''],
  'STEP-RELEASE': [B, 'example: parallel/release, parallel/release-who', ''], 'STEP-REASSIGN': [L, 'pattern: patterns/reassign', ''], 'STEP-WAIT': [L, 'pattern: patterns/wait, patterns/resume', ''],
  'STEP-RECHECK': MACH('the step is evaluated again on the rebased items', '04'), 'STEP-ACTIVE': [B, 'example: parallel/claim-limit-person', ''],
  'HO-RECORD': [L, 'pattern: patterns/record-handoff', ''], 'HO-RECEIPT': [L, 'pattern: patterns/accept-input, patterns/accept-input-recorded, patterns/accept-input-reviewed, patterns/reject-input', ''],
  'HO-EDGE': [L, 'pattern: patterns/claim-inputs-accepted', ''], 'HO-GATE': [L, 'pattern: patterns/claim-inputs-accepted, patterns/close-dependents-accepted', ''], 'HO-TEXTS': [L, 'pattern: patterns/accept-input-recorded', 'the texts are the deny texts of the team'],
  'RV-REQUEST': [B, 'example: parallel/hand-to-check, scrum/request-review', ''], 'RV-START': [B, 'example: parallel/start-check, scrum/take-review', ''],
  'RV-REVIEW': [B, 'example: parallel/check-reject, parallel/check-pass, scrum/review-reject, scrum/review-pass', ''], 'RV-RULES': [L, 'pattern: patterns/close-passes, patterns/close-same-commit, patterns/review-own-session', 'the commit rule compares the commit the review saw with the close\'s HEAD; a reading of commit subjects in git history is not offered (chapter 03 section 12)'],
  'RV-REASSIGN': [L, 'pattern: patterns/take-over-stale-review', ''], 'RV-STALE': [L, 'pattern: patterns/take-over-stale-review', ''], 'RV-CLOSE': [B, 'example: parallel/close, parallel/close-holder', ''],
  'RV-HISTORY': MACH('every step appends a history entry; effect note', '02'), 'RV-NOTICE': [B, 'language: effect say (chapter 03)', ''], 'RV-VERDICTS': [B, 'example: parallel/check-verdict, scrum/review-verdict', ''],
  'RF-STEPS': [L, 'pattern: patterns/review-pass-peer, patterns/review-pass-outside', 'a refinement review is review stages over statuses, the same rule shape as a work review'],
  'RF-DECISION': [L, 'pattern: patterns/ask-decision, patterns/decide', ''], 'RF-EDITS': [L, 'pattern: patterns/edit, patterns/edit-only-before-ready', ''],
  'RF-COMPLETE': [B, 'example: parallel/new-needs-estimate', 'other required fields are the same rule shape (pattern patterns/request-review-needs-done-when, which also reads the body)'],
  'RF-LEGACYSTAGE': [S, '-', 'owner ruling R4: no translation on read'], 'RF-JOIN': MACH('migrate keeps teamless split items as user items linked by parent (Q-19 answer B)', '06'),
  'RF-HOWTEXT': [B, 'language: deny texts with placeholders, written by the team (chapter 03)', ''],
  'WIP-LEVELS': [B, 'example: parallel/claim-limit-person, parallel/claim-limit-team', 'an overall limit across teams and user items is not stated: user items take no rule (D-18) and a team limits only its own items'],
  'WIP-ACTIVE': [B, 'example: parallel/claim-limit-person', 'the count condition says what counts'], 'WIP-OVERRIDE': [L, 'pattern: patterns/lift-limit, patterns/limit-top-level', ''],
  'WIP-VIEW': [B, 'example: parallel/filter:in-progress', 'command: backlog team query filter <name>'], 'WIP-SETTEAM': [B, 'example: parallel/adopt', ''], 'WIP-START': [S, '-', 'no coded start on an item without a team'],
  'DEP-FINISHED': [B, 'example: parallel/claim-dependencies', ''], 'CR-TEAMNEW': [B, 'command: backlog team new evaluates the step new (chapter 04)', ''],
  'CR-DOD': [L, 'pattern: patterns/request-review-needs-done-when', 'user new writes no definition-of-done placeholder (R3)'],
  'Q-POP': [B, 'language: the pop table (chapter 03)', ''], 'Q-LEADWORK': [B, 'example: parallel/lead-splits', ''], 'Q-PLAN': [B, 'command: backlog team query plan (chapter 04)', ''],
  'Q-VIEWS': [B, 'language: filters; command: backlog team query filter <name> (chapter 04)', ''], 'Q-ROWS': MACH('the team queue is the index entries of the team\'s items', '05'),
  'Q-REVIEWONLY': [B, 'example: scrum/claim-developer-only', ''], 'DEF-TEAM': [B, 'command: backlog team validate (chapter 08)', ''], 'DEF-ENTRY': [B, 'command: backlog team validate (chapter 08)', ''],
  'DEF-NOTCONF': MACH('coded text: team <name> has no entry in teams.json', '04'), 'DEF-WFREG': [S, '-', 'owner ruling R5: no registration'], 'DEAD': [S, '-', 'dead code'],
  'Q-REORDER': [B, 'language: effect place; user reordering moves only user entries (chapter 05)', ''], 'ST-CODEC-LEGACY': [S, '-', 'decision D-30: every item is migrated once'],
  'DEF-DEFAULTWF': [S, '-', 'no workflow names (R5)'], 'HO-DEFAULTS': [S, '-', 'no coded hand-off record'], 'STEP-ONESTEP': MACH('one step per command: backlog team update <item> <step>', '04'),
  'Q-HOLDERFIELD': [B, 'language: the holder is a field the team names; conditions read it (chapter 03)', ''], 'Q-VIEWFIELDS': [B, 'command: backlog team query filter <name> --json prints the whole items (chapter 04)', ''],
  'Q-CLAIMNOW': [S, '-', 'pop runs the offered step through the evaluator itself; no internal flag'], 'Q-MARKTEXT': [S, '-', 'the pop entry names its step; no text test'],
};

// rows of a group whose behaviour differs from the group's (found by review B, section 3)
const ROW = {
  'INV-704': [L, 'pattern: patterns/review-cites-document', 'the comments must cite a review document (test contains)'],
  'INV-784': MACH('pop exits 1 on a synchronisation failure, never 3 (idle)', '04'),
  'INV-798': MACH('a detached HEAD with no branch given stops new, update and pop (exit 2)', '01'),
  'INV-858': [D, CHUNK, 'the item-less chunk action and chunk items of other folders'],
  'INV-588': [L, 'pattern: patterns/request-review-needs-done-when', 'a rule reads $item.body (a definition-of-done section, an ESTIMATE line)'],
  'INV-589': [L, 'pattern: patterns/request-review-needs-done-when', 'a rule reads $item.body'],
  'INV-590': [L, 'pattern: patterns/request-review-needs-done-when', 'a rule reads $item.body'],
  'INV-591': [L, 'pattern: patterns/request-review-needs-done-when', 'a rule reads $item.body'],
};

// ---- tests.tsv: by disposition first, then by theme
const THEME = {
  'T-BINDING': [B, 'machinery: user commands see only items without a team (cases COD-06, COD-07)', 'the test is rewritten: a refusal becomes "no such item"'],
  'T-CLAIM': [B, 'example: parallel/claim, parallel/claim-limit-person', 'cases PAR-02, PAR-19 to PAR-23'], 'T-DEPS': [B, 'example: parallel/claim-dependencies', 'cases PAR-05, PAR-06'],
  'T-FILE': [S, '-', 'owner ruling R5: team define and team workflow --file are removed; backlog team validate is tested by cases VAL-01 to VAL-12'],
  'T-HANDOFF': [L, 'pattern: patterns/record-handoff, patterns/accept-input, patterns/close-dependents-accepted', 'cases PAT-36 to PAT-41'],
  'T-LEGACY': [B, 'machinery: backlog team migrate drops the retired keys (chapter 06)', ''], 'T-USERCONV': [B, 'machinery: user commands, unchanged behaviour on items without a team (chapter 04)', ''],
  'T-QUEUE': [B, 'language: the pop table; example: parallel/member-claims, parallel/member-checks', 'cases PAR-49 to PAR-53'],
  'T-REFINE': [L, 'pattern: patterns/review-pass-peer, patterns/edit-only-before-ready', ''], 'T-REVIEW': [B, 'example: parallel/check-pass, parallel/check-reject, parallel/check-not-own', ''],
  'T-ROLES': MACH('people and roles', '01'), 'T-SCOPE': [L, 'pattern: patterns/scope-branch', 'case PAT-01'],
  'T-STATUS': [B, 'field: status values of a team, default words of the user commands (chapter 02)', ''], 'T-STEPS': [B, 'example: parallel (every step rule)', 'cases PAR-01 to PAR-48'],
  'T-WIP': [B, 'example: parallel/claim-limit-team', 'case PAR-22'],
};
const testState = r => {
  if (r.class === 'OTHER') return r.file_line.startsWith('shared-frontmatter.test.js') ? MACH('the markdown reader of backlog team migrate', '06') : MACH('kept; item fixtures move to JSON where the test reads item files', '04');
  if (r.disposition === 'misclassified') return r.theme === 'T-HANDOFF' ? [S, '-', 'no coded hand-off record format (pattern patterns/record-handoff states hand-offs as fields)'] : MACH('path safety of the archive folder', '02');
  if (r.disposition === 'deleted') return [S, '-', r.reason];
  return THEME[r.theme];
};

// ---- consumers.tsv, gaps.tsv, owner questions, format gaps, findings, earlier decisions: one row each
const ONE = {
  'CON-01': [D, T6, 'SMOOTH_BACKLOG_CLI_TEAM_LEAD is not read; the lead is a role in people'], 'CON-02': [D, T6, 'list --json no longer shows team items; the consumer reads backlog team query --json'],
  'CON-03': [D, T6, 'plan entries are the team\'s step names from backlog team query plan'], 'CON-04': [D, T6, 'instruction texts come from the team\'s deny and say texts'],
  'CON-05': [B, 'command: backlog team pop --json keeps the key action; idle exits 3 (chapter 04)', ''], 'CON-06': [D, T6, 'SMOOTH_BACKLOG_CLI_TEAM_LEAD fallback dropped'],
  'CON-07': [D, T6, 'final values are status.final of the team item definition (backlog team query definition)'],
  'CON-08': [B, 'machinery: backlog archive of an item without a team needs no --force (decision D-19)', ''],
  // review-b.md section 3: sampled behaviours of today's code that the first version did not carry or named a wrong target for
  'B3-3': MACH('an unknown team subcommand: exit 2 naming the six', '04'), 'B3-10': MACH('SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY must be owner/name (exit 2)', '01'),
  'B3-11': MACH('a detached HEAD with no branch given stops new, update and pop', '01'),
  'B3-19': [D, 'entry plan Task 6: the owner\'s team writes the dependency rule for items migrated without hand-off records (a closed producer with no record)', 'expressible with any and empty on the producer\'s hand-off field'],
  'B3-20': [S, '-', 'no digest: the record is fields only the team\'s step writes, and a new record withdraws the acceptance (chapter 03 section 12)'],
  'B3-27': [B, 'language: owner/name#seq references are read across folders (chapter 03 section 5)', 'cases PAR-64, PAR-65'],
  'B3-30': [B, 'language: placeholders in a literal note text (chapter 03 section 8)', ''],
  'B3-41': [L, 'pattern: patterns/close-same-commit', 'commit equality, not a reading of commit subjects'],
  'B3-46': [L, 'pattern: patterns/review-cites-document', ''], 'B3-55': [S, '-', 'owner ruling R15: the refusal is removed'], 'B3-60': [L, 'pattern: patterns/accept-input-reviewed', ''],
  'B3-61': [L, 'pattern: patterns/reject-input', ''], 'B3-62': [S, '-', 'owner ruling R15: the flag wins, no refusal'], 'B3-63': [S, '-', 'owner ruling R15: the flag wins, no refusal'],
  'B3-64': MACH('pop exits 1 on a synchronisation failure', '04'), 'B3-66': MACH('a detached HEAD with no branch given stops pop', '01'),
  'B3-67': [D, CHUNK, ''], 'B3-71': [B, 'field: claimed_by and claimed_at of the built-in user item definition (chapter 02 section 4)', ''],
  'B3-72': [B, 'field: backlog done writes closed (decision D-33; today done is stored as closed through normalise, finding F9)', ''],
  'B3-73': MACH('the migration builds the index of a folder without one from priority', '06'), 'B3-74': MACH('references to team items are hidden from user commands unless --show-all is given; with it they are seen and refusals may name them (R16)', '04'), 'CON-09': [D, T6, 'verdict words are the team\'s arguments'],
  'CON-10': [D, T6, 'already broken today; the binding step is a team rule (example parallel/adopt)'], 'CON-11': [D, T6, 'decisions are a filter of the team (pattern patterns/filter:decisions)'],
  'CON-12': [D, T6, 'show the status value; final values from the team item definition'], 'CON-13': [D, T6, 'the team writes its rule set in teams.json; no workflow file is registered'],
  'CON-14': [D, T6, 'the skills point at backlog team query rules and backlog team validate; no rule text duplicated'], 'CON-15': [D, T6, 'final values from the team item definition'],
  'CON-16': [D, T6, 'a session-end marker is a team rule (pattern patterns/ended-session)'], 'CON-17': [D, T6, 'review_state is a field of the team, if the team keeps it'],
  'CON-18': [D, T6, 'status values of the team'], 'CON-19': [D, T6, 'team define is removed; the lead edits teams.json and runs backlog team validate'], 'CON-20': [D, T6, 'status values of the team'],
  'CON-21': [D, T6, 'final values from the team item definition'], 'CON-22': [D, T6, 'SMOOTH_BACKLOG_CLI_TEAM_LEAD assertions dropped with the export'],
  // gaps.tsv
  S29b: [L, 'pattern: patterns/set-status-lead', 'without such a rule the step is refused by default'], S82: [L, 'pattern: patterns/ended-session', ''],
  S92: [B, 'command: backlog team query check <item> <step> names the rule that refuses (chapter 04)', ''],
  L09: [B, 'field: default words of the built-in user item definition (decision D-33)', ''], L29: [B, 'field: default words of the built-in user item definition (decision D-33)', ''],
  L12: [D, T8, ''], S06: [D, T8, ''], S87: [D, T8, ''], S88: [D, T8, ''], L13: [D, T8, ''], L43: [D, T8, ''], L33: [D, T8, ''], L52: [D, T8, ''], L56: [D, T8, ''], S101: [D, T8, ''],
  L55: MACH('exit codes 0, 1, 2, 3, 5; an uncaught error exits 1', '04'), L27: MACH('new --ask exists', '04'), L51: MACH('update notice exists', '04'),
  L32: [D, open('Q-09'), ''], L53: [D, open('Q-10'), 'team commands keep raw JSON payloads until it is answered (chapter 04)'], L54: [D, open('Q-11'), ''], L57: [D, open('Q-12'), ''], L58: [D, open('Q-12'), ''], L59: [D, open('Q-13'), ''], S95: [D, open('Q-14'), ''],
  // owner questions of reference/08-owner-questions.md
  'Q-04': MACH('session inputs stay, prefixed SMOOTH_BACKLOG_CLI_ (R20); each is also a flag on every team command, the flag first (answered A, R15)', '01'), 'Q-05': [B, 'language: declared rules are ordinary evaluated rules (example parallel/check-round-cap)', 'answered: rules in the team\'s file, generic CLI'],
  'Q-06': [B, 'language: effect delete; a team deletes only by a rule of its own; numbers are never reused (chapter 03, 05)', ''], 'Q-07': [B, 'language: effect branch; user move never sees a team item (R3a)', 'a move to another repository folder is not offered: the item would need a new number there'],
  'Q-08': [B, 'example: parallel/abandon', ''], 'Q-09': [D, open('Q-09'), ''], 'Q-10': [D, open('Q-10'), ''], 'Q-11': [D, open('Q-11'), ''], 'Q-12': [D, open('Q-12'), ''], 'Q-13': [D, open('Q-13'), ''],
  'Q-14': [D, open('Q-14'), ''], 'Q-15': [D, open('Q-15'), ''], 'Q-16': [S, '-', 'owner rulings R5 and R6: no workflow registry; the team writes its rule set in teams.json and migrate converts items only'],
  'Q-17': MACH('migrate unbinds items of a team without an entry and writes a timestamped record naming the former team (answered A)', '06'),
  'Q-18': MACH('archived items are converted to JSON with their keys and values unchanged and are subject to no rule (answered B, with R4)', '06'),
  'Q-19': MACH('teamless split items stay user items, linked by parent (answered B)', '06'), 'Q-20': [S, '-', 'no registration; backlog team validate reports items whose values the edited definition no longer allows (chapter 08)'],
  // format gaps of reference/13-format-gaps.md
  'G-001': [L, 'pattern: patterns/review-pass-peer, patterns/review-pass-outside', 'every stage is a status and the same rule shape'], 'G-002': [B, 'example: parallel/check-round-cap, scrum/review-cap', 'both options of the gap are ordinary rules; a team picks one'],
  'G-003': [B, 'example: parallel/hand-to-check-note, parallel/start-check-handoff', ''], 'G-004': [B, 'example: extreme-programming/integrate-needs-commit', 'language: regex'],
  'G-005': [L, 'pattern: patterns/blocked-by-decision', ''], 'G-006': [B, 'language: function age (chapter 03)', 'pattern patterns/take-over-stale-review'], 'G-007': [L, 'pattern: patterns/old-reviews-first', ''],
  'G-008': [B, 'example: parallel/new-size-cap, scrum/refine-points-cap', ''], 'G-009': [S, '-', 'owner ruling R5: the CLI never reads a template and never writes the team file'],
  'G-010': [L, 'pattern: patterns/limit-top-level, patterns/limit-split', ''], 'G-011': [L, 'pattern: patterns/new-linked', ''], 'G-012': [B, 'example: parallel/new-child-parent-splitting, parallel/new-child', 'language: effect place before'],
  'G-013': MACH('the caller is the only actor; $caller.roles and roles_of for a named person', '03'), 'G-014': [L, 'pattern: patterns/start-review-fallback, patterns/unavailable', ''],
  'G-015': [S, '-', 'owner ruling R1: the CLI decides when a command runs; a timer is not a command, so timed actions stay with the scripts beside a team'],
  'G-016': [B, 'language: effect say (pattern patterns/request-review)', ''], 'G-017': [L, 'pattern: patterns/close-dependents-accepted', ''],
  // findings F1 to F14 of reference/01-inventory.md section 5
  F1: MACH('the team\'s rules in teams.json are the only enforcement', '03'), F2: [B, 'command: backlog team validate refuses unknown keys, so every key is evaluated (chapter 08)', ''], F3: [B, 'example: parallel/claim-limit-team', 'a limit is a rule that is evaluated'],
  F4: [S, '-', 'the key is gone with the old entry'], F5: [B, 'language: function age with the number in the rule', ''], F6: [S, '-', 'SMOOTH_BACKLOG_CLI_TEAM_LEAD and --lead are not read'],
  F7: MACH('an unreadable teams.json stops a team command (exit 2)', '01'), F8: [S, '-', 'verdicts are arguments the team\'s rules read'], F9: [B, 'field: a user status is stored as typed (D-19)', ''],
  F10: MACH('user new writes only the built-in user fields', '02'), F11: [S, '-', 'decision D-18'], F12: [S, '-', 'dead code'], F13: MACH('only a rule that binds an item without a team may change it', '03'),
  F14: [S, '-', 'no shipped definition; the team\'s rule set in teams.json is the only one (R5)'],
  // earlier decisions listed in reference/08-owner-questions.md part 1
  'D-17': MACH('team commands own their code path', '04'), 'D-18': [S, '-', 'no limit or dependency gate on user commands (kept as ruled)'], 'D-19': [B, 'field: user values stored as typed', ''],
  'D-20': [S, '-', 'the user claim, release and close refuse nobody (kept as ruled)'], 'D-21': MACH('the team entry is people, item and rules', '01'), 'D-22': MACH('no role name in the CLI', '01'),
  'D-23': MACH('no field name of a team in the CLI', '02'), 'D-24': MACH('no step name in the CLI except the command name new', '03'), 'D-25': MACH('no verdict word in the CLI', '03'),
  'D-26': MACH('archive writes no status; archived is the folder', '02'), 'D-27': MACH('one cutover: migrate or fail', '06'), 'D-28': [S, '-', 'a process rule of the private repositories; nothing in the CLI'],
  'D-29': [S, '-', 'owner ruling R5: the CLI never converts the team file'], 'D-30': MACH('every item is migrated once', '06'), 'D-31': MACH('exit codes', '04'), 'D-32': MACH('an absent field reads as its definition default', '02'),
  'D-33': [B, 'field: default words of the built-in user item definition', ''],
};

// ---- the rows
const rows = [];
const add = (source, id, ref, [state, target, reason]) => rows.push({ source, id, ref, state, target, reason });
const inv = tsv('inventory.tsv'); for (const r of inv) { if (!GROUP[r.group]) throw new Error(`inventory group ${r.group} unmapped`); add('inventory.tsv', r.id, r.site, ROW[r.id] ?? GROUP[r.group]); }
const tests = tsv('tests.tsv'); for (const r of tests) { r.file_line = r['file:line']; const s = testState(r); if (!s) throw new Error(`test ${r.id} unmapped`); add('tests.tsv', r.id, r.file_line, s); }
const cons = tsv('consumers.tsv'); for (const r of cons) add('consumers.tsv', r.id, '', ONE[r.id] ?? (() => { throw new Error(`consumer ${r.id} unmapped`); })());
// an accepted loss of gaps.tsv stays dropped under the ruling its resolution column cites
const gaps = tsv('gaps.tsv'); for (const r of gaps) add('gaps.tsv', r.impact_id, r.old_form.slice(0, 80), ONE[r.impact_id] ?? (r.terminal === 'ACCEPTED-LOSS' ? [S, '-', `accepted loss under ${r.resolution}`] : (() => { throw new Error(`gap ${r.impact_id} unmapped`); })()));
const ids = (text, re) => [...new Set([...text.matchAll(re)].map(m => m[1]))];
for (const q of ids(md('08-owner-questions.md'), /^## (Q-\d+)/gm)) add('08-owner-questions.md', q, '', ONE[q] ?? (() => { throw new Error(`${q} unmapped`); })());
for (const g of ids(md('13-format-gaps.md'), /^## (G-\d+)/gm)) add('13-format-gaps.md', g, '', ONE[g] ?? (() => { throw new Error(`${g} unmapped`); })());
for (const f of ids(md('01-inventory.md'), /^- \*\*(F\d+)\./gm)) add('01-inventory.md', f, '', ONE[f] ?? (() => { throw new Error(`${f} unmapped`); })());
const part1 = md('08-owner-questions.md').split('## Part 2')[0];
const dec = new Set(ids(part1, /\b(D-\d+)\b/g));
for (const [, a, b] of part1.matchAll(/D-(\d+) to D-(\d+)/g)) for (let n = Number(a); n <= Number(b); n++) dec.add(`D-${n}`);
for (const d of [...dec].sort((x, y) => Number(x.slice(2)) - Number(y.slice(2)))) add('08-owner-questions.md part 1', d, '', ONE[d] ?? (() => { throw new Error(`${d} unmapped`); })());
// review B section 3: every sampled row whose verdict is M (missed) or X (wrong target)
const sampled = readFileSync('review-b.md', 'utf8').split('## 3.')[1].split('\n## ')[0].split('\n').filter(l => /^\| \d+ \|/.test(l)).map(l => l.split('|').map(c => c.trim()));
for (const c of sampled.filter(c => /^(M|X)|\/ M/.test(c[4]))) add('review-b.md section 3', `B3-${c[1]}`, c[2], ONE[`B3-${c[1]}`] ?? (() => { throw new Error(`B3-${c[1]} unmapped`); })());

// ---- checks: one row per input, allowed states, every named example or pattern rule exists
const STATES = [B, L, S, D];
// the owner rulings of rounds 5 to 8 (R14 to R21), one row each, and the scope note
const RULING = {
  R14: MACH('a specific team for every team command; --show-all accepted by query, validate and migrate, refused by new, update and pop (cases R14-01 to R14-09)', '01'),
  R15: MACH('flag, then variable, then configuration; a differing flag is not refused; the consequence is stated once (cases R15-01 to R15-03)', '01'),
  R16: MACH('user commands ignore team items and hide references to them unless --show-all is given; the flag is derived for every user command that selects or lists items (cases R16-01 to R16-03)', '04 section 8'),
  R17: MACH('backlog team migrate reports every missing, invalid or undeclared field per item; --ask repairs one field at a time on a terminal (cases R17-01, R17-02)', '06 section 2'),
  R18: MACH('a team whose entry fails validation takes no action; the migration needs every entry valid; the checks cover required keys, shape, definition, coherence (case VAL-21)', '01 section 4 and 08'),
  R19: MACH('with --show-all a user command may set values on a team item, with a history entry by the user (cases R19-01, R19-02)', '04 section 8'),
  R19a: MACH('SMOOTH_BACKLOG_CLI_TEAM_NAME set: every user command fails with the blanket text; help and version are not blocked (cases R19A-01, R19A-02)', '04 section 8'),
  R20: MACH('every CLI-owned environment variable is prefixed SMOOTH_BACKLOG_CLI_, the two internal ones the inventory missed included', '01 section 5'),
  R21: MACH('the SHA in .backlog/config.json, the per-user record of the valid teams with the validated copy, 24 hours, validate refreshes, update only when valid (spike teams-load.test.mjs)', '01 section 4'),
  R22: MACH('the team file per repository and branch: the teams_file key, else <backlog repository>/<owner>/<name>/teams.json beside the folder index, else .backlog/teams.json; teams_file_sha in .backlog/config.json; the migration per repository folder (cases R22-01 to R22-05, spike teams-load.test.mjs)', '01 section 1.1'),
  'scope note': MACH('several teams at once: one clone per user serialises one machine; across machines the re-run with a random growing wait (measured with contention.mjs)', '04 section 7'),
};
// the targets name decisions that exist
const decisions = (readFileSync('decisions.md', 'utf8').match(/^## \d+\./gm) ?? []).length;
for (const id of [...readFileSync('../00-owner-rulings.md', 'utf8').matchAll(/^- (R1[4-9]a?|R2[0-2])\./gm)].map(m => m[1])) add('00-owner-rulings.md', id, '', RULING[id] ?? (() => { throw new Error(`${id} unmapped`); })());
if (/^## Scope note/m.test(readFileSync('../00-owner-rulings.md', 'utf8'))) add('00-owner-rulings.md', 'scope note', '', RULING['scope note']);
const files = Object.fromEntries(['parallel', 'scrum', 'extreme-programming', 'single-agent', 'patterns'].map(n => [n, Object.values(JSON.parse(readFileSync(`examples/${n}.json`, 'utf8')))[0]]));
const known = new Set(Object.entries(files).flatMap(([n, e]) => [...e.rules.table.map(r => r.id), ...e.rules.pop.map(o => o.id), ...Object.keys(e.rules.filters).map(v => `filter:${v}`)].map(id => `${n}/${id}`)));
const seen = new Set();
for (const r of rows) {
  const key = `${r.source}\t${r.id}`;
  if (seen.has(key)) throw new Error(`${key} twice`); seen.add(key);
  if (!STATES.includes(r.state)) throw new Error(`${key}: state ${r.state}`);
  if ((r.state === S || r.state === D) && !(r.reason || r.target !== '-')) throw new Error(`${key}: no reason or blocker`);
  for (const m of `${r.target} ${r.reason}`.matchAll(/decision (\d+) of design/g)) if (Number(m[1]) > decisions) throw new Error(`${key}: decision ${m[1]} does not exist`);
  for (const m of `${r.target} ${r.reason}`.matchAll(/\b((?:parallel|scrum|extreme-programming|single-agent|patterns)\/[a-z:-]+)/g)) if (!known.has(m[1])) throw new Error(`${key}: ${m[1]} is no rule of the examples`);
}
const inputs = { 'inventory.tsv': inv.length, 'tests.tsv': tests.length, 'consumers.tsv': cons.length, 'gaps.tsv': gaps.length };
for (const [src, n] of Object.entries(inputs)) if (rows.filter(r => r.source === src).length !== n) throw new Error(`${src}: ${n} input rows`);

const clean = s => String(s).replace(/[\t\n]/g, ' ');
writeFileSync('coverage.tsv', ['source\tid\tref\tstate\ttarget\treason', ...rows.map(r => [r.source, r.id, r.ref, r.state, r.target, r.reason].map(clean).join('\t'))].join('\n') + '\n');
const sources = [...new Set(rows.map(r => r.source))];
const count = (src, st) => rows.filter(r => (!src || r.source === src) && (!st || r.state === st)).length;
const lines = ['source\tinput rows\t' + STATES.join('\t') + '\ttotal', ...sources.map(src => [src, inputs[src] ?? count(src), ...STATES.map(st => count(src, st)), count(src)].join('\t')), ['all', rows.length, ...STATES.map(st => count(null, st)), rows.length].join('\t')];
for (const src of sources) if (STATES.reduce((n, st) => n + count(src, st), 0) !== count(src)) throw new Error(`${src} does not reconcile`);
writeFileSync('coverage-counts.tsv', lines.join('\n') + '\n');
process.stdout.write(lines.join('\n') + '\n');
