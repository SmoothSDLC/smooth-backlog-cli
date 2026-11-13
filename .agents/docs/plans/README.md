# Plans

Every plan of this repository, newest work first. Plans are named `YYYY-MM-DD-<name>.md` (the creation date first); a plan made of several documents has a folder with the same dated name next to its entry file. A finished plan moves to [completed/](completed/) at once (AGENTS.md, section Plans).

## Index

| Plan | Status | What it is |
|---|---|---|
| [2026-11-12-simplify-branch-completion.md](2026-11-12-simplify-branch-completion.md) | active | The one plan of the whole working branch: 52 tasks (the remaining team rules engine tasks, the row-level checks, the documents, phases 8 and 9, the final review, the cut-over and the work outside this repository) and the use-case status table with one row per use case of every source. |
| [2026-11-11-team-rules-engine-remaining-work.md](completed/2026-11-11-team-rules-engine-remaining-work.md) | superseded | Superseded by the 2026-11-12 plan, which keeps its task numbers. The remaining work of the team rules engine as 33 tasks: fixes of the merged publication and numbering code, pop, query, removals, concurrency, the `--show-all` view, the migration, removal of the old team code, the final documentation pass and verification. |
| [2026-11-09-team-rules-engine.md](2026-11-09-team-rules-engine.md) | active | The CLI evaluates a team's rule set over JSON items; all team behaviour is in the team file. The earlier 2026-11-08 analysis was replaced and removed (last in git at commit a507443). |
| [2026-11-04-pr3-simplification-log.md](2026-11-04-pr3-simplification-log.md) | active | Decision log and ledger of the whole PR #3 simplification: phase table, owner decisions and rules, outcome and lessons per phase. |
| [2026-11-04-simplification-plan.md](2026-11-04-simplification-plan.md) | active | The simplification plan behind PR #3: one backlog, one CLI, the same commands wherever the item files live. |
| [2026-11-04-phase-8-documentation.md](completed/2026-11-04-phase-8-documentation.md) | superseded | Superseded by Task 39 of the 2026-11-12 plan. Phase 8: every document describes the one CLI; the review records are complete; `.agents/docs` removed except the plans. |
| [2026-11-04-phase-9-final-verification-and-pr.md](completed/2026-11-04-phase-9-final-verification-and-pr.md) | superseded | Superseded by Task 40 of the 2026-11-12 plan. Phase 9: final verification, push, the one pull request. |
| [completed/2026-11-08-phase-7c-2c-team-item-refusals-ask-and-update-notice.md](completed/2026-11-08-phase-7c-2c-team-item-refusals-ask-and-update-notice.md) | completed | Phase 7c-2c: user commands and team items, `--ask`, and the update notice. |
| [completed/2026-11-07-phase-7c-2b-read-commands-and-no-aliases.md](completed/2026-11-07-phase-7c-2b-read-commands-and-no-aliases.md) | completed | Phase 7c-2b: the read commands, real commands for the kept behaviours, no aliases. |
| [completed/2026-11-07-phase-7c-2a-team-new-and-team-items.md](completed/2026-11-07-phase-7c-2a-team-new-and-team-items.md) | completed | Phase 7c-2a: `backlog team new`, and one door for a team's items. |
| [completed/2026-11-07-phase-7c-1-team-boundary.md](completed/2026-11-07-phase-7c-1-team-boundary.md) | completed | Phase 7c-1: team behaviour lives only under `backlog team`. |
| [completed/2026-11-05-phase-6c-team-commands.md](completed/2026-11-05-phase-6c-team-commands.md) | completed | Phase 6c: the `backlog team` hierarchy, the configuration's user and team, the item template. |
| [completed/2026-11-05-phase-6b-status-order.md](completed/2026-11-05-phase-6b-status-order.md) | completed | Phase 6b: one status order, the workflow definition, two verdicts. |
| [completed/2026-11-05-phase-6-committed-index.md](completed/2026-11-05-phase-6-committed-index.md) | completed | Phase 6: the committed per-repository index is the order of the backlog; a readable answer for an unreadable item. |
| [completed/2026-11-04-phase-7b-command-aliases-b.md](completed/2026-11-04-phase-7b-command-aliases-b.md) | completed | Phase 7b: the body-section editor, import, archive done, the self-update (the aliases were later removed in 7c-2b). |
| [completed/2026-11-04-phase-7-command-aliases.md](completed/2026-11-04-phase-7-command-aliases.md) | completed | Phase 7: the 1.x command names as aliases (later removed in 7c-2b). |
| [completed/2026-11-04-phase-5-sync-parity.md](completed/2026-11-04-phase-5-sync-parity.md) | completed | Phase 5: pull before every command, push after every change, retry, reject stale writes, in both storage locations. |
| [completed/2026-11-04-phase-4-remove-mirror-repair.md](completed/2026-11-04-phase-4-remove-mirror-repair.md) | completed | Phase 4: delete what only the committed database needed. |
| [completed/2026-11-04-phase-3-database-as-cache.md](completed/2026-11-04-phase-3-database-as-cache.md) | completed | Phase 3: the database becomes a per-clone cache (superseded by Phase 6). |
| [completed/2026-11-04-phase-2-events-in-item-files.md](completed/2026-11-04-phase-2-events-in-item-files.md) | completed | Phase 2: the item history lives in the item file. |
| [completed/2026-11-04-phase-1-duplicates-and-output.md](completed/2026-11-04-phase-1-duplicates-and-output.md) | completed | Phase 1: exact duplicates out, no folder path in output, wording-pinning test out. |
| [completed/2026-11-04-recommendations.md](completed/2026-11-04-recommendations.md) | completed | The review, analysis and recommendations behind the simplification phases. |
| [completed/2026-10-16-smooth-backlog-cli.md](completed/2026-10-16-smooth-backlog-cli.md) | completed | The first implementation plan: the branch-aware backlog CLI, agent integrations, release and update support. |
| [completed/2026-10-16-smooth-backlog-cli-progress.md](completed/2026-10-16-smooth-backlog-cli-progress.md) | completed | The execution ledger of the first implementation plan. |

Related records of the simplification: the analyses in [../analysis/](../analysis/) and the handoff in [../handoffs/2026-11-06-pr3-simplification-handoff.md](../handoffs/2026-11-06-pr3-simplification-handoff.md).
