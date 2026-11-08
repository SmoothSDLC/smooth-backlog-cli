Feature: Review - stages, passes and the close come from the definition and the entry
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-401 @S-401-1
  Scenario: a team without review stages
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key review set to `[]`
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-review any --note c`
    Then item 1 has status "review complete"

  @REQ-401 @S-401-2
  Scenario: a team with only the external stage
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key review set to `[{"stage":"external","count":1}]`
      And team "t1" has the entry list external_reviewers set to `["xia"]`
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-review any --note c`
    Then item 1 has status "ready for external review"

  @REQ-402 @S-402-1
  Scenario: a rule naming another team counts only its members
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And a team "reviewers" with lead "rex" and members "ria" using the workflow "team"
      And team "t1" has the entry key review set to `[{"stage":"peer","count":1,"team":"reviewers"}]`
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","work_commit":"abc","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review complete --comments "d.md ok"`
    Then item 1 has status "ready for review"

  @REQ-403 @S-403-1
  Scenario: a review request while reviewed is refused
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"reviewing","claimed_by":"ann","reviewer":"bob","review_started":"2026-11-08T10:00:00Z","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-review any --note c`
    Then the command fails with exit code 1
      And the output contains "bob is reviewing it since 2026-11-08T10:00:00Z: wait for the verdict"

  @REQ-404 @S-404-1
  Scenario: a reject sends the item back to work
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","work_commit":"abc","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review changes --comments "d.md: fix it"`
    Then item 1 has status "in progress"
      And item 1 has reviews ""

  @REQ-404 @S-404-2
  Scenario: an unknown verdict is invalid input
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review maybe --comments x`
    Then the command fails with exit code 2
      And the output contains "invalid choice: 'maybe'"

  @REQ-404 @S-404-3
  Scenario: without reject_clears a reject keeps the passes
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `review.reject_clears = <delete> ; steps.review.verdicts.reject.clears = []`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"reviewing","reviewer":"bob","reviews":["x c1"],"work_commit":"c1","review_refs":"r.md"}`
    When I run `backlog team update 1 --team t1 --agent bob --review changes --comments "see r.md"`
    Then the command succeeds
      And item 1 has reviews "x c1"

  @REQ-405 @S-405-1
  Scenario: a close before the passes
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","work_commit":"abc","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close --summary done`
    Then the command fails with exit code 1
      And the output contains "review rule not met - 1 pass(es) by members of the team on the current work commit needed, 0 recorded"

  @REQ-406 @S-406-1
  Scenario: a review in the author session
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And the environment BACKLOG_SESSION is "s9"
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","author_session":"s9","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review complete --comments "d.md ok"`
    Then the command fails with exit code 1
      And the output contains "ann reviews in the author session"

  @REQ-407 @S-407-1
  Scenario: the stale time comes from the file
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `review.stale_after_seconds = 1`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And the environment BACKLOG_REVIEW_STALE_SECONDS is "999999"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"reviewing","claimed_by":"bob","reviewer":"ann","review_started":"2020-01-01T00:00:00Z","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
    When I run `backlog team pop --team t1 --agent lead --dry-run --json`
    Then the output contains "reassign-review"

  @REQ-408 @S-408-1
  Scenario: the owner closes on a decision
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","handoffs":"none","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close --by owner --reason "owner says so" --summary "dropped"`
    Then the command succeeds
      And item 1 body contains "owner decision: owner says so"

  @REQ-408 @S-408-2
  Scenario: a member who does not hold the item cannot close it
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","handoffs":"none","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close --summary x`
    Then the command fails with exit code 1
      And the output contains "only the claimer (ann) closes it, else the team lead (lead); not bob"
