Feature: Creation and dependencies - team new, binding and dependency waits
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-701 @S-701-1
  Scenario: an unaccepted hand-off blocks the claim
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"closed","refiner":"","handoffs":"none"}`
      And an item "Dep" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[1],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "dependencies not done: 001-work (done, hand-off missing"

  @REQ-702 @S-702-1
  Scenario: a team item starts with the initial word and the placeholder
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I act as agent "lead"
    When I run `backlog team new --team t1 --name "Child" --objective o --summary s`
    Then item 1 has status "new"
      And item 1 has refiner ""
      And item 1 body contains "## Definition of done"

  @REQ-702 @S-702-2
  Scenario: team new refuses --status
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I act as agent "lead"
    When I run `backlog team new --team t1 --name "Child" --status ready`
    Then the command fails with exit code 1
      And the output contains "--status cannot be combined with --team"

  @REQ-702 @S-702-3
  Scenario: priority_by_severity puts a critical item first
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
    When I run `backlog team new --team t1 --agent lead --name b --severity critical`
    Then the command succeeds
      And I run `backlog list --json`
      And the output contains "\"priority\": 0"

  @REQ-702 @S-702-4
  Scenario: create.ask asks for the field it names
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `create.ask = [{"field":"estimate_min","label":"Minutes"}]`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team new --team t1 --agent lead --name a --ask` and answer "7"
    Then the command succeeds
      And item 1 has estimate_min "7"

  @REQ-703 @S-703-1
  Scenario: binding a user item sets the initial word
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "User" exists
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --set-team t1`
    Then item 1 has status "new"
      And item 1 has team "t1"

  @REQ-703 @S-703-2
  Scenario: binding to an unknown team is refused
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "User" exists
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --set-team ghost`
    Then the command fails with exit code 1
      And the output contains "team ghost is not configured"

  @REQ-704 @S-704-1
  Scenario: a dependency on an unknown item is refused
    Given a repository with a backlog
      And an item "A" exists
    When I run `backlog update 1 --set-depends-on 99`
    Then the command fails with exit code 1
      And the output contains "no item '99' in this backlog"
