Feature: Claims and hand-offs - conditions of the definition decide claims, releases, waits and hand-offs
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-301 @S-301-1
  Scenario: --force passes the one-active-item rule
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And an item "Next" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann --force`
    Then the command succeeds

  @REQ-301 @S-301-2
  Scenario: without --force the active item blocks
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And an item "Next" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "ann holds 1 active item(s): 001-work"

  @REQ-302 @S-302-1
  Scenario: a claim of an item held by another
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","claimed_at":"2026-11-08T10:00:00Z","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command fails with exit code 1
      And the output contains "claimed by ann since 2026-11-08T10:00:00Z; message ann or pick another item"

  @REQ-303 @S-303-1
  Scenario: the lead claims the team work item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim lead`
    Then the command succeeds
      And item 1 has status "in progress"

  @REQ-303 @S-303-2
  Scenario: the lead never claims a slice
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim lead`
    Then the command fails with exit code 1
      And the output contains "the team lead (lead) never claims an item of its team's split"

  @REQ-303 @S-303-3
  Scenario: a finished item is not claimed
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"closed","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "status is closed; a finished item cannot be claimed"

  @REQ-304 @S-304-1
  Scenario: waiting by someone else
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --waiting ci --by bob`
    Then the command fails with exit code 1
      And the output contains "--waiting needs --by <the agent holding it> (claimed by ann)"

  @REQ-304 @S-304-2
  Scenario: reassign by the lead
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --reassign bob --reason "ann away"`
    Then the command succeeds
      And item 1 has claimed_by "bob"

  @REQ-304 @S-304-3
  Scenario: with cleared_by_note false a note keeps the wait
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `waiting.cleared_by_note = false`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann","wait_on":"x"}`
    When I run `backlog team update 1 --team t1 --agent ann --note n`
    Then the command succeeds
      And item 1 has wait_on "x"

  @REQ-305 @S-305-1
  Scenario: a note ends the wait
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":"","wait_on":"ci"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --note "ci green"`
    Then item 1 has wait_on ""
      And item 1 body contains "WAIT DONE"

  @REQ-307 @S-307-1
  Scenario: a hand-off by someone other than the claimer
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And an item "Dep" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","depends_on":[1]}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --handoff 2 --handoff-commit 0123456789012345678901234567890123456789 --handoff-contract c --handoff-verification v --by bob`
    Then the command fails with exit code 1
      And the output contains "a hand-off is recorded by the claimer: the item is claimed by ann, not by bob"

  @REQ-308 @S-308-1
  Scenario: a member cannot accept a hand-off
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --accept-handoff 2 --checks ok --by bob`
    Then the command fails with exit code 1
      And the output contains "a hand-off is accepted by the team lead (lead), not by bob"

  @REQ-309 @S-309-1
  Scenario: close refused while a dependent edge is open
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`
      And an item "Dep" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","depends_on":[1]}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close --summary done`
    Then the command fails with exit code 1
      And the output contains "close refused for 001-work: 2 edge missing"

  @REQ-309 @S-309-2
  Scenario: a close without dependents records NONE
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":""}`
      And team "t1" has the entry key review set to `[]`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close --summary done`
    Then the command succeeds
      And item 1 body contains "DEPENDENCY_HANDOFF: NONE"
