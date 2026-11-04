// 097 (slice B of 050): pin the class-free state repository-wide and prove the test suite leaves the
// shared backlog store clean.
// The class words are the retired work/review class fields (items 035/049). The table below pins every
// permitted occurrence: {file: {exact line, trimmed: max count}} - an upper bound (item 050 refinement,
// rounds 4-6): a line missing from the table for its file, a count above the bound, or a file outside
// the table is a violation; a removed line is not. The table is generated from the checkout at this
// item's commit with the same git grep the test runs.
// The guard's own file is the one file excluded from the search (F1, refinement review round 3), so its
// table may hold the words literally.
// The store-guard tests run the guard script (.agents/scripts/check-real-backlog-clean.mjs) with a
// temporary git repository as the store: no live store, no shared fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const SELF_PATH = relative(repoRoot, fileURLToPath(import.meta.url));
const PATTERN = 'work[_ -]?class|review[_ -]?class'; // the 049 pattern (ERE)

// The allow-list table: {file: {exact line, trimmed: max count}}.
// The table below is generated from the checkout at this item's commit (one git grep with the same
// pattern and pathspec the test runs); it is an upper bound, so a line may be removed, never added.
const TABLE = {
 ".agents/docs/analysis/2026-10-25-pr3-use-cases-interaction-behavior-matrix.md": {
  "| SHARED new | --name --objective --summary --context --priority --severity normal/critical --split-from --body --work-class --review-classes --review-refs --depends-on --estimate --complexity --layer --force --dry-run | Pull, validate dependency/DoD/class refs, allocate unique seq + slug, write phase and scan DB, priority reflow, commit+push; dry run zero mutation. Unique flag prefixes accepted **only here** | C:src/shared/new.js:20-49,83-188; shared-new.test.js |": 1,
  "| SHARED update | selector; setters --status --branch (refused) --commit --location --summary --priority --name --objective --seq --size_score; --append --replan --note --set-work-class --set-review-classes --set-review-refs --set-depends-on --set-estimate --set-complexity --set-layer --dry-run | File/FM+event+DB, replan and reflow; can refuse archived, dependent/duplicate seq, external branch; commit+push before result | C:src/shared/update.js:19-27,57-80,100-123,145-290; shared-update.test.js |": 1,
  "| SHARED query | --next --status --critical --phase ITEM --events [ITEM] --by-branch --all --branch --json --claimable --reviewable --blocked --classes --agent --review-classes --roster --scope branch/repo/all --pop --claim-now; --plan/--headless refused | Pull and inspect SQLite/Markdown, live Git branches, per-agent read hash; some query --pop paths perform claim, so not universally read-only | C:src/shared/query.js:16-38,116-256; src/shared/views.js:13-131; shared-query/team-scope.test.js |": 1,
  "| SHARED pop | --agent NAME --classes CSV --review-classes CSV [--claim-now --roster --scope --json] | Pick one action continue>review>claim>refine>chunk>idle; --claim-now spawns child CLI update, takes re-entrant clone lock, changes remote; idle exit3 | C:src/shared/pop.js:20-43,82-130,170-211; shared-team-pop.test.js |": 1,
  "1. ABSENT -> draft/incomplete -> refined READY pending; item has clear objective, summary, DoD, work_class, review_classes, review_refs, explicit depends_on (none permitted), estimate_min, complexity/layer where required. Too-large work split into <=45m internal sections in same item, not unapproved new backlog items.": 1,
  "| UC-113 | LOCAL disposable | A solo | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | A single valid action; no racing writer | claim instruction agrees with persisted item and event; INV-01/05/09 | F/D/G/R complete and mutually consistent; unrelated paths/index \u00d8 | C:src/shared/pop.js:82-130,170-211 | shared-team-pop.test.js | reg_pop_claim_normal | SOURCE-DERIVED | P1 |": 1,
  "| UC-114 | LOCAL disposable | A solo | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | Malformed flags/selector, wrong owner/branch, missing dep or unsupported state | Refuse with code1/2 and INV-06; no partial user mutation | F/D/G/R/V/U=\u00d8 except read-pull if allowed | C:src/shared/pop.js:82-130,170-211 | shared-team-pop.test.js | reg_pop_claim_invalid | HYPOTHESIS | P1 |": 1,
  "| UC-115 | 2 clones A/B | A then B | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster; A cached target | B changes target after A's explicit read, before A action | A must see B's new hash; stale code5 or justified explicit business refusal; INV-04 | R B edit retained, A did not silently overwrite B | C:src/shared/pop.js:82-130,170-211;C:src/shared/seen.js:84-115 | shared-stale.test.js | reg_pop_claim_stale | HYPOTHESIS | P1 |": 1,
  "| UC-116 | LOCAL disposable | A process | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | SIGKILL at F-03/04 after file write/SQLite, launch separate recovery process | Either rollback to original or full origin success; INV-06/11 | F/D/G/R same before or complete after; journal/index consistent | C:src/shared/pop.js:82-130,170-211;C:src/shared/store.js:130-185 | shared-audit.test.js | reg_pop_claim_kill | HYPOTHESIS | P1 |": 1,
  "| UC-117 | 2 clones A/B | A &#124;&#124; B | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | Hold A at prepush; B writes same item/identity, pushes; release A | Both success only for valid merged state, else stale/conflict; INV-03/08 | R valid single identity/graph; event notes and DB preserved; A/B exit asserted | C:src/shared/pop.js:82-130,170-211;C:src/shared/sync.js:389-482 | shared-sync.test.js | reg_pop_claim_twowriter_same | HYPOTHESIS | P1 |": 1,
  "| UC-118 | 2 clones A/B | B &#124;&#124; A | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | Swap A/B arrival and touch another item or acme/dst folder | Independent valid writes survive or one clean refusal; INV-01/07/08 | R contains both legal changes, no stray mirror/seq or cross-folder deletion | C:src/shared/pop.js:82-130,170-211;C:src/shared/db.js:219-295 | MISSING | reg_pop_claim_twowriter_different | HYPOTHESIS | P1 |": 1,
  "| UC-119 | LOCAL+CLOUD | A+C | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster | C ephemeral clone and A owner-workstation clone; A commits during cloud fetch/credential loss | No assumptions about shared run lock or cache, remote serialized; INV-08/11 | R valid; cloud logs redacted; no transient inconsistent commit | C:src/shared/pop.js:82-130,170-211;C:src/shared/sync.js:455-469 | MISSING | reg_pop_claim_cloud_race | HYPOTHESIS | P1 |": 1,
  "| UC-120 | LOCAL shared clone | A+B | pop --agent amy --classes app-code --review-classes code --claim-now | complete unclaimed eligible item, clean roster; stray.txt staged outside repository folder | Both commands start; cooperative run lock, git auto-stash/index stage attempt | Only permitted folder(s) published; unrelated staged/index bytes preserved; INV-07 | R stray=absent, Git index unchanged for stray; F/D exact | C:src/shared/pop.js:82-130,170-211;C:src/shared/store.js:64-80 | shared-sync.test.js (candidate) | reg_pop_claim_shared_checkout_index | HYPOTHESIS | P1 |": 1,
 },
 ".agents/docs/dependency-handoffs/035-remove-work-and-review-classes.md": {
  "# 035 Remove work and review classes - dependency hand-off for item 84": 1,
  "(995f6b5, fae5660: the work and review classes out of the CLI code of src/shared,": 1,
  "CONTRACT: no part of the CLI reads, writes, accepts, documents or suggests work_class, review_classes, --classes, --review-classes or class profiles; an item carrying old class fields behaves exactly like one without them; chunk work is chunk: true. On the branch: 048 (995f6b5, fae5660) removed the classes from src/shared (team.js, update.js, new.js); 049 (89cbd9b, 9971eaa, e498d34) removed the class options from the help, COMMANDS.md and the built-in skill and committed the negative test .agents/test/shared-no-classes.test.js, which pins the class options out of every help text, COMMANDS.md and the public files (src, README.md, templates, CHANGELOG.md); 050 (not done at the record time) class-frees the five shared team test files and migrates the legacy class fields out of the open items; 074 (not done at the record time) removes the Python script names from the commit subjects and the source comments.": 1,
  "VERIFICATION: at the record time (clean tree at c6bdb53, Node 24, BACKLOG_HEADLESS unset): the class git grep over src, COMMANDS.md, README.md, templates and CHANGELOG.md prints nothing; node --test .agents/test/shared-team-compat.test.js .agents/test/shared-no-classes.test.js is 9 pass 0 fail 0 skipped, including 'an item with old work_class and review_classes fields behaves exactly like one without them (owner 2026-10-28)'; grep -rnE '\\.py\\b' src still hits the commit subjects (update.js line 118, move.js line 47, archive.js line 104) and the source comments - 074's remaining work; the full suite (npm test) is 837 tests, 810 pass, 27 fail, 0 skipped: the 23 failures named in the item 082 commit at this tree (ten reflow, eight 059.4 hand-off gate, three shared-update, one 088 two-stage, one 047 long-name) plus four queue-view tests that failed only under the concurrent shared-store runs of the in-flight items 049 and 082 (the 042 across-repositories test in shared-foreign-deps, the 075 --next plan test and '`backlog next` is --next' in shared-query, test_no_new_flags_unchanged in shared-team-pop); none of the failures is in a file item 035 owns (it owns none). 035's close, after 049, 050 and 074 are done, re-runs all four section-3 checks on a clean tree and records them in its close summary with the four items' commits; item 084's gate re-verifies the same state.": 1,
 },
 ".agents/docs/dependency-handoffs/049-no-classes-test.md": {
  "tests only): .agents/test/shared-no-classes.test.js asserts (1) no work or review class": 1,
  "VERIFICATION: on Node 24 (the agent shell's BACKLOG_HEADLESS unset): the item's own test file (node --test .agents/test/shared-no-classes.test.js) 3 pass 0 fail 0 skipped; the full suite (npm test, the shared checkout at 41645bd127c942743cab11c92b866ca9afb12ed8 with this item's SKILL.md line and this document uncommitted in the tree): tests 798, pass 711, fail 86, skipped 1 - the 86 failures are in other items' test files (shared-foreign-deps, shared-long-name, shared-team-flow, shared-stale, shared-handoff-commands, shared-handoff-gate, shared-handoff-e2e, shared-query, shared-session-review, shared-sync-db, shared-team-lifecycle and the other slice's untracked .agents/test/shared-twostage.test.js), which run on the other slice's uncommitted changes (src/shared/lifecycle.js, new.js and update.js modified); the two spot-checked files pass on the clean tree at 41645bd (shared-handoff-gate 8 pass 0 fail, shared-query 23 pass 0 fail); the 1 skip is item 86's guard test (no-private-details.test.js), which self-skips while BACKLOG_PRIVATE_DENYLIST is unset; npm run check exits 0. The fail-before check (049's own): a temporary work_class word in the update help line made the help test and the git grep test fail (recorded in the item's CHUNK 2026-10-31T23:08Z); the word was restored, not committed.": 1,
 },
 ".agents/docs/dependency-handoffs/050-migrate-legacy-class-fields.md": {
  "implementation: item 096 strips the two legacy front-matter keys (work_class": 1,
  "and review_classes) from every item the CLI next writes (src/shared/store.js": 1,
  "CONTRACT: the CLI's write() drops the two legacy front-matter keys work_class and review_classes from every item it writes (child 096); the five shared team test files are class-free (048, 995f6b5); the repository-wide class-word allow-list test and the real-backlog-clean guard exist and pass (child 097); the help text (src/help.js) carries the stored-field migration sentence without naming the class keys, so 049's frozen git-grep over src stays green; the documentation per AGENTS.md (SKILL.md, the help, COMMANDS.md via the sync script, CHANGELOG.md) lands in the children's changes. At the record time 0 open items of the shared store carry the legacy front-matter keys (front-matter-anchored grep: 0 of 470 phase files; the plain word grep's hits are body text - e.g. a status-done item of another store whose field line reads 'work_class ... | review_classes ...' - dated records), so the migration is per-write behaviour: items written after the change lose the keys, and items still carrying them lose them on their next write.": 1,
 },
 ".agents/docs/handoffs/2026-10-25-pr3-test-first-implementation-handoff.md": {
  "The lead accepts **source item 030** and inspects latest source, other open work items (notably existing backlog-cli 025 and 027), reviewers, files/tests and dependency edges. If <=45 min inclusive of review is not realistic, it **creates new named backlog items** through supported backlog commands. Each child: `--split-from 030`, explicit `--depends-on <id...|none>`, `work_class`, `review_classes`, `review_refs`, `estimate_min <=45`, file ownership, inputs/outputs, environment, precise red/green test evidence, review and rollback/DoD. Publish and re-query each item; maintain a parent -> actual child ID registry; never guess child numbers or regenerate existing children.": 1,
 },
 ".agents/docs/specs/2026-10-22-shared-backlog-mode.md": {
  "| `new` | src/shared/new.js (10, NEW) | new_phase.py | `--name --objective --summary --context --priority <rank> --severity normal\\|critical --split-from <item> --body <text> --work-class a,b --review-classes a,b --review-refs <paths> --depends-on <items>\\|none --estimate <minutes> --complexity --layer --force --dry-run` (new_phase.py:31-58) | missing `--name` :65-67; missing `--depends-on` :69-71; `--review-refs` not covering a review class :76-79; `--body` without a definition of done in team mode :81-85; a dependency not in the backlog :90-93; `--split-from` not found :98-101; target file exists without `--force` :115-118 |": 1,
  "| `update` | src/shared/update.js (11, UPDATE) + src/shared/lifecycle.js (15, TEAM) | update.py | `<item>` (omitted only for `--replan`, update.py:109) with SETTABLE values `--status --branch --commit --location --summary --priority --name --objective --seq --size_score` (update.py:23-24), `--append :113`, `--replan :114-115`, `--note :116`; team flags `--claim --force --release --request-review --start-review --review --by --comments --close --waiting --waiting-done --set-review-refs --set-work-class --set-review-classes --set-depends-on --set-estimate --set-complexity --set-layer` (update.py:117-140, semantics update.py:27-104) | no phase argument :165-168; item not found :171-174; `--branch` :184-187; clearing `--commit` :188-191; `--set-estimate` not > 0 :207-210; `--set-depends-on` item missing :215-219; uncovered review refs :225-230; more than one team step :236-239; a team step outside the team scope :241-245; an incomplete item worked by the team :247-255; a team step's own refusal :258-261; `--status done` without a passing review :267-272 |": 1,
  "| `query` | src/shared/query.js (12, QUERY) | query.py | read views: `--next --status --critical --phase <item> --events [item] --by-branch <branch> --all --branch <branch> --json` (query.py:364-372); team views `--claimable --reviewable --blocked --classes` (job 16, query.py:373-380) and `--pop --agent --review-classes --claim-now --roster --scope` (job 20, query.py:381-396) | `--phase <item>` not found :546-549 (exit 1); `--pop` without `--agent` :403-404 (exit 2); detached HEAD :416-417 (exit 2); `--claimable`/`--reviewable` without `--classes` :450-451 (exit 2) |": 1,
  "| `pop` | src/shared/pop.js (20, POP) | query.py `--pop` (query.py:170-263) | `--agent <name>` (required, :383), `--classes`, `--review-classes`, `--claim-now`, `--roster <file>`, `--scope branch\\|repo\\|all`, `--json` | `--pop` needs `--agent` :403-404 (exit 2); idle \u2192 exit 3 (query.py:73, 263) |": 1,
  "  location, created, updated`, then `work_class`, `review_classes`, `review_refs` only when": 1,
  "| `--claimable` / `--reviewable` / `--blocked`: array of `{\u2026row, work_class, review_classes, depends_on, claimed_by, claimed_at, review_state, reviewer, waiting_on}` | query.py:474-479 | src/shared/views.js (16) |": 1,
  "| `src/shared/team.js` | job 15 (TEAM) | `heldItems(folder, agent)` (lib_db.py:658-670); `claimRefusal(folder, agent)` (lib_db.py:673-680); `undoneDependencies(folder, fm)` (lib_db.py:648-655); `uncoveredReviewClasses(classes, refs)` (lib_db.py:683-686); `loadRoster(path)` (lib_db.py:689-697); `fallbackReview(fm, roster)` (lib_db.py:700-707); `describeDependency(dep)` (lib_db.py:745-749) |": 1,
  "| `src/shared/lifecycle.js` | job 15 (TEAM) | `claim(item, agent, {force})`, `release(item, agent)`, `requestReview(item, reviewer, note)`, `review(item, verdict, {by, comments})`, `waiting(item, by, what)`, `waitingDone(item, by)`, `closeItem(item, by, summary)` \u2014 one per `team_action` branch (update.py:27-104). Each returns `{event, text}` or throws `Rejected(message)` with the Python refusal text; the caller writes the front matter and appends the text to the body exactly as update.py:262-266; the close gate (review_classes requires `review_state: passed`) is update.py:97-99 |": 1,
  "| `src/shared/pop.js` | job 20 (POP) | `pop(folder, agent, {workClasses, reviewClasses, claimNow, roster, scope})` \u2192 the action object of section 4 (query.py:170-263; precedence and the 300 s review-first timer query.py:171-190; claim refusal lib_db.py:673-680); `idle` exits 3 (query.py:73, 263) |": 1,
 },
 ".agents/docs/specs/2026-10-28-pr1-learnings.md": {
  "## 1. No work classes and no review classes": 1,
  "- Owner 2026-10-28, said three times: work classes and review classes are dead. They are never added, suggested, kept": 1,
  "  or revived in any form. The CLI must not read, write, accept, document or suggest `work_class`, `review_classes`,": 1,
  "  `--classes`, `--review-classes`, class profiles in a roster, or class-based claim or review rules.": 1,
 },
 ".agents/test/fixtures/shared/item-realistic.json": {
  "  \"work_class\": [": 1,
  "  \"review_classes\": [": 1,
 },
 ".agents/test/fixtures/shared/item-realistic.md": {
  "work_class:": 1,
  "review_classes:": 1,
 },
 ".agents/test/shared-frontmatter.test.js": {
  "  const { fm } = parse('---\\nwork_class:\\n- app-code\\n- tests\\n---\\n');": 1,
  "  assert.deepEqual(fm, { work_class: ['app-code', 'tests'] });": 1,
 },
 ".agents/test/shared-legacy-fields.test.js": {
  "const KEYS = ['work_class', 'review_classes'];": 1,
  "  writeFileSync(pathOf(f, slug), s.replace(/^---\\n/, '---\\nwork_class:\\n- chunk\\nreview_classes:\\n- security\\n'));": 1,
  "  store.write({ path: pathOf(f, s), fm: { ...fm, work_class: ['chunk'], review_classes: ['security'] }, body }, f.folder);": 1,
  "  assert.match(shown, /^-work_class:/m);": 1,
  "  assert.match(shown, /^-review_classes:/m);": 1,
 },
 ".agents/test/shared-new.test.js": {
  "  ['a work class (the classes are gone)', [...NONE, '--work-class', 'docs'], 2, '', '\u274c backlog: unrecognized arguments: --work-class docs\\n'],": 1,
  "  ['a review class (the classes are gone)', [...NONE, '--review-classes', 'code'], 2, '', '\u274c backlog: unrecognized arguments: --review-classes code\\n'],": 1,
  "  for (const args of [[...NONE, '--work-class', 'https://user:tok3n@host/x'], [...NONE, 'https://user:tok3n@host/x'], [...BASE, '--depends-on', 'https://user:tok3n@host/x']]) {": 1,
  "  assert.ok(!('work_class' in item.fm) && !('review_classes' in item.fm) && !('chunk' in item.fm));": 1,
 },
 ".agents/test/shared-no-classes.test.js": {
  "// The class options removed from the CLI: the work and review class fields and the --classes / --review-classes options.": 1,
  "test('the help of every command names no work or review class option', () => {": 1,
 },
 ".agents/test/shared-team-compat.test.js": {
  "  for (const flag of ['--work-class', '--review-classes']) { // work and review classes are gone": 1,
  "  const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer'];": 1,
  "test('an item with old work_class and review_classes fields behaves exactly like one without them ', () => {": 1,
  "  writeFileSync(path, readFileSync(path, 'utf8').replace(/^---\\n/, '---\\nwork_class:\\n- chunk\\n- docs\\nreview_classes:\\n- security\\n'));": 1,
  "  assert.ok(/^work_class:/m.test(readFileSync(path, 'utf8')) && /^review_classes:/m.test(readFileSync(path, 'utf8')), 'the seeded file carries both keys');": 1,
  "  assert.deepEqual([pop('eve').action, pop('eve').item], ['claim', old]); // work_class chunk does not make it a chunk item": 1,
  "    assert.ok(q(f, '--reviewable', '--agent', 'zed').includes(s), s); // any member but the author reviews; no review class counts": 1,
 },
 ".agents/test/shared-team-done.test.js": {
  "const OLD = ['work_class', 'review_classes', 'depends_on', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']; // test_team_compat.OLD": 1,
  "  for (const k of ['work_class', 'review_classes', 'claimed_by', 'claimed_at', 'review_state', 'reviewer']) delete fm[k];": 1,
 },
 ".agents/test/shared-team-lifecycle.test.js": {
  "  assert.ok(!('work_class' in fm) && !('review_classes' in fm)); // no class field is written": 1,
  "  assert.equal(team.isChunk({ work_class: ['chunk'] }), false); // the old class field means nothing": 1,
  "  assert.equal(team.needsReview({ review_classes: ['code'] }), false);": 1,
  "  for (const name of ['WORK_CLASSES', 'REVIEW_CLASSES', 'parseClasses', 'uncoveredReviewClasses', 'fallbackReview']) assert.ok(!(name in team), name);": 1,
  "  writeFileSync(file, JSON.stringify({ ann: { work_classes: 'app-code,tests', review_classes: ['code'] }, bob: [1] }));": 1,
  "  assert.deepEqual(team.loadRoster(file), { ann: { work_classes: 'app-code,tests', review_classes: ['code'] }, bob: {} }); // lib_db.load_roster": 1,
  "  const gone = update(n, [C, '--claim', 'ann', '--set-work-class', 'docs']);": 1,
  "  assert.deepEqual([gone.status, gone.stderr], [2, '\u274c backlog: unrecognized arguments: --set-work-class\\n']);": 1,
 },
 ".agents/test/shared-team-pop.test.js": {
  "  writeFileSync(roster, JSON.stringify({ ann: { work_classes: ['app-code'], review_classes: ['code'] }, bob: {} })); // old class profiles mean nothing": 1,
 },
 ".agents/test/shared-team-scope.test.js": {
  "  const old = roster({ amy: { review_classes: ['code'] }, dan: { review_classes: ['code'] }, eve: { review_classes: [] } });": 1,
 },
 ".agents/test/shared-update.test.js": {
  "// a review class, one done. ids: the mirror db is built by the Node scan; the item files are fixed text.": 1,
  "test('the class options are gone: --set-work-class and --set-review-classes are unrecognized, nothing is written', () => {": 1,
  "  for (const flag of ['--set-work-class', '--set-review-classes']) {": 1,
 },
};

function classWordMatches(dir) {
  const r = spawnSync('git', ['grep', '--untracked', '-n', '-i', '-E', PATTERN, '--', '.', `:(exclude)${SELF_PATH}`], { cwd: dir, encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, `git grep exit ${r.status}: ${r.stderr}`);
  const out = {};
  for (const line of String(r.stdout).split('\n')) {
    if (line === '') continue;
    const m = /^([^:]+):(\d+):(.*)$/.exec(line);
    if (!m) {
      // a git grep line the file:line:text shape does not cover (a binary match, a colon in
      // the file name) is a violation, never noise to discard
      out[line] = { [line]: 1 };
      continue;
    }
    out[m[1]] ??= {};
    out[m[1]][m[3]] = (out[m[1]][m[3]] ?? 0) + 1;
  }
  return out;
}

function violations(matches, table) {
  const bad = [];
  for (const [file, lines] of Object.entries(matches)) {
    const allowed = table[file];
    if (!allowed) { bad.push(`${file}: file not in the allow-list`); continue; }
    for (const [text, count] of Object.entries(lines)) {
      if (allowed[text] === undefined) bad.push(`${file}: line not in the allow-list: ${text}`);
      else if (count > allowed[text]) bad.push(`${file}: line occurs ${count} times, bound ${allowed[text]}`);
    }
  }
  return bad;
}

// ---------- allow-list guard (repository-wide) ----------

test('097: the class words of the repository are all in the table', () => {
  const bad = violations(classWordMatches(repoRoot), TABLE);
  assert.deepEqual(bad, [], `class words outside the table:\n${bad.join('\n')}`);
});

test("097: the excluded file is exactly the guard's own path", () => {
  assert.equal(SELF_PATH, '.agents/test/shared-no-classes-repo.test.js');
});

function tempStore(base = tmpdir()) {
  const dir = mkdtempSync(join(base, 'bl97-'));
  const git = (...gargs) => {
    const r = spawnSync('git', gargs, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } });
    assert.equal(r.status, 0, `git ${gargs.join(' ')}: ${r.stderr}`);
    return r;
  };
  git('init', '-q');
  git('config', 'user.email', 'guard@example.invalid');
  git('config', 'user.name', 'guard');
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  git('add', '.');
  git('commit', '-qm', 'seed');
  return { dir, git };
}

test('097: a class word added to an allowed file fails the guard', () => {
  const { dir, git } = tempStore();
  try {
    writeFileSync(join(dir, 'allowed.txt'), 'one work_class line\n');
    git('add', '.'); git('commit', '-qm', 'x');
    const table = { 'allowed.txt': { 'one work_class line': 1 } };
    assert.deepEqual(violations(classWordMatches(dir), table), []);
    writeFileSync(join(dir, 'allowed.txt'), 'one work_class line\ntwo review_class line\n');
    git('add', '.'); git('commit', '-qm', 'y');
    const bad = violations(classWordMatches(dir), table);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('allowed.txt') && bad[0].includes('not in the allow-list'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: an allowed line replaced by another class-word line (same count) fails the guard', () => {
  const { dir, git } = tempStore();
  try {
    writeFileSync(join(dir, 'allowed.txt'), 'one work_class line\n');
    git('add', '.'); git('commit', '-qm', 'x');
    const table = { 'allowed.txt': { 'one work_class line': 1 } };
    writeFileSync(join(dir, 'allowed.txt'), 'other work_class line\n');
    git('add', '.'); git('commit', '-qm', 'y');
    const bad = violations(classWordMatches(dir), table);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('not in the allow-list'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a permitted line duplicated in an allowed file fails the count bound', () => {
  const { dir, git } = tempStore();
  try {
    writeFileSync(join(dir, 'allowed.txt'), 'one work_class line\n');
    git('add', '.'); git('commit', '-qm', 'x');
    const table = { 'allowed.txt': { 'one work_class line': 1 } };
    writeFileSync(join(dir, 'allowed.txt'), 'one work_class line\none work_class line\n');
    git('add', '.'); git('commit', '-qm', 'y');
    const bad = violations(classWordMatches(dir), table);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('bound 1'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a class word in a new untracked file fails the guard', () => {
  const { dir } = tempStore();
  try {
    writeFileSync(join(dir, 'untracked.txt'), 'new work_class leak\n'); // not committed
    const bad = violations(classWordMatches(dir), {});
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('untracked.txt') && bad[0].includes('not in the allow-list'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a class word in a file whose name contains a colon fails the guard', () => {
  // the temp store lives on the repository filesystem (not tmpdir, which is tmpfs and
  // rejects colon file names here): git grep prints the line as <name>:<n>:<text>, the
  // file part holds a colon, and the parser must treat it as a violation, not drop it
  const { dir, git } = tempStore(repoRoot);
  try {
    writeFileSync(join(dir, 'we:ird.txt'), 'one work_class line\n');
    git('add', '.'); git('commit', '-qm', 'x');
    // the table names the right file and line: the failure must come from the parser
    const bad = violations(classWordMatches(dir), { 'we:ird.txt': { 'one work_class line': 1 } });
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('we:ird.txt'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a class word in a binary file fails the guard', () => {
  // git grep prints a binary match as one line, "Binary file <path> matches", with no
  // file:line: prefix; the parser must treat it as a violation, not drop it
  const { dir, git } = tempStore();
  try {
    writeFileSync(join(dir, 'bin.dat'), Buffer.from('one work_class line\x00tail\n'));
    git('add', '.'); git('commit', '-qm', 'x');
    const bad = violations(classWordMatches(dir), { 'bin.dat': { 'one work_class line': 1 } });
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].includes('bin.dat'), bad[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- store guard (the script, temporary git repositories as the store) ----------

const SCRIPT = join(repoRoot, '.agents', 'scripts', 'check-real-backlog-clean.mjs');

function runGuard(store, command, env) {
  const argv = typeof command === 'string' ? [command] : command; // a list keeps each word a separate argument
  const r = spawnSync(process.execPath, [SCRIPT, '--', ...argv], { cwd: store, encoding: 'utf8', env });
  const lines = String(r.stdout).split('\n').filter(Boolean);
  let json = null;
  try { json = JSON.parse(lines.at(-1) ?? 'null'); } catch { /* no JSON final line */ }
  return { code: r.status, stdout: String(r.stdout), stderr: String(r.stderr), json };
}
const plainEnv = store => ({ PATH: process.env.PATH, HOME: process.env.HOME, BACKLOG_HOME: store });

test('097: a clean store before and after gives unchanged and exit 0', () => {
  const { dir } = tempStore();
  try {
    const r = runGuard(dir, 'node -e "process.exit(0)"', plainEnv(dir));
    assert.equal(r.code, 0, r.stdout + '\n' + r.stderr);
    assert.deepEqual(r.json, { store: 'unchanged', command_exit: 0 }, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a dirty store before gives dirty-before and the command is not run', () => {
  const { dir } = tempStore();
  try {
    writeFileSync(join(dir, 'leak.txt'), 'untracked\n');
    const marker = join(dir, 'ran.txt');
    const r = runGuard(dir, `node -e "require('fs').writeFileSync('${marker}', '1')"`, plainEnv(dir));
    assert.equal(r.code, 1, r.stdout + '\n' + r.stderr);
    assert.deepEqual(r.json, { store: 'dirty-before', command_exit: null }, r.stdout);
    assert.equal(existsSync(marker), false, 'the wrapped command must not run on a dirty store');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a command that adds an untracked file to the store gives changed', () => {
  const { dir } = tempStore();
  try {
    const r = runGuard(dir, `node -e "require('fs').writeFileSync('${join(dir, 'leak.txt')}', '1')"`, plainEnv(dir));
    assert.equal(r.code, 1, r.stdout + '\n' + r.stderr);
    assert.equal(r.json?.store, 'changed', r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: HEAD moved during the run gives changed and prints the old to new HEAD range', () => {
  const { dir, git } = tempStore();
  try {
    const old = git('rev-parse', 'HEAD').stdout.trim();
    const r = runGuard(dir, "node -e \"require('fs').writeFileSync('move.txt', 'm')\" && git add -A && git commit -qm move", plainEnv(dir));
    assert.equal(r.code, 1, r.stdout + '\n' + r.stderr);
    assert.equal(r.json?.store, 'changed', r.stdout);
    assert.ok(r.stdout.includes(`${old}..`), `expected the HEAD range starting at ${old} in: ${r.stdout}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a failing wrapped command is reported with its exit code and the store unchanged', () => {
  const { dir } = tempStore();
  try {
    const r = runGuard(dir, 'node -e "process.exit(7)"', plainEnv(dir));
    assert.equal(r.code, 1, r.stdout + '\n' + r.stderr);
    assert.deepEqual(r.json, { store: 'unchanged', command_exit: 7 }, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a store that is not a git repository is unreadable and the command is not run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bl97-'));
  try {
    writeFileSync(join(dir, 'plain.txt'), 'x\n');
    const r = runGuard(dir, 'node -e "process.exit(0)"', plainEnv(dir));
    assert.equal(r.code, 1, r.stdout + '\n' + r.stderr);
    assert.deepEqual(r.json, { store: 'unreadable', command_exit: null }, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: BACKLOG_HOME selects the store', () => {
  const { dir } = tempStore();
  try {
    const r = runGuard(dir, 'node -e "process.exit(0)"', plainEnv(dir));
    assert.ok(r.stdout.includes(`store: ${dir}`), r.stdout);
    assert.deepEqual(r.json, { store: 'unchanged', command_exit: 0 }, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: the per-user record under a temporary XDG_CONFIG_HOME selects the store', () => {
  const { dir } = tempStore();
  const xdg = mkdtempSync(join(tmpdir(), 'bl97-xdg-'));
  const home2 = mkdtempSync(join(tmpdir(), 'bl97-home-'));
  try {
    mkdirSync(join(xdg, 'backlog-repo'));
    writeFileSync(join(xdg, 'backlog-repo', 'home'), dir);
    const r = runGuard(dir, 'node -e "process.exit(0)"', { PATH: process.env.PATH, HOME: home2, XDG_CONFIG_HOME: xdg });
    assert.ok(r.stdout.includes(`store: ${dir}`), r.stdout);
    assert.deepEqual(r.json, { store: 'unchanged', command_exit: 0 }, r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
    rmSync(home2, { recursive: true, force: true });
  }
});

test('097: a --help after -- is part of the wrapped command, not the guard help', () => {
  // --help is a separate argument after --: the guard must not intercept it
  const { dir } = tempStore();
  try {
    const marker = join(dir, 'help-ran.txt');
    const r = runGuard(dir, ['echo', '1', '>', marker, '--help'], plainEnv(dir));
    assert.ok(r.json, `expected the JSON final line, got: ${r.stdout}`);
    assert.equal(r.json.command_exit, 0, r.stdout);
    assert.equal(existsSync(marker), true, 'the wrapped command must run');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('097: a --help before -- prints the guard help and runs no command', () => {
  const { dir } = tempStore();
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--help'], { cwd: dir, encoding: 'utf8', env: plainEnv(dir) });
    assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
    assert.ok(String(r.stdout).includes('Usage: node .agents/scripts/check-real-backlog-clean.mjs'), r.stdout);
    assert.throws(() => JSON.parse(String(r.stdout).trim().split('\n').at(-1)), 'the final line is usage text, not the JSON result');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
