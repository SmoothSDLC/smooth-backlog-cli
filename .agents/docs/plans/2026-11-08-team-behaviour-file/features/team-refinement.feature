Feature: Refinement - refinement steps, decisions, edit rules and completeness come from the definition
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-501 @S-501-1
  Scenario: the lead does not refine in the first round
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refine-start`
    Then the command fails with exit code 1
      And the output contains "a member, not the team lead, refines in the first round"

  @REQ-501 @S-501-2
  Scenario: refine-done needs a complete item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refine-done --note done`
    Then the command fails with exit code 1
      And the output contains "still missing review_refs, depends_on, estimate_min, definition_of_done"

  @REQ-502 @S-502-1
  Scenario: anyone reviews a refinement when the entry has no rule
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`
      And I act as agent "zed"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refinement-review complete --comments ok --by zed`
    Then item 1 has status "ready"

  @REQ-503 @S-503-1
  Scenario: a question is needed
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-decision ""`
    Then the command fails with exit code 1
      And the output contains "001-work: --request-decision needs the question: what, why, how it came up, the options and a recommendation"

  @REQ-504 @S-504-1
  Scenario: frozen during the refinement review
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --name changed`
    Then the command fails with exit code 1
      And the output contains "the item stays as the reviewer reads it"

  @REQ-504 @S-504-2
  Scenario: an incomplete item is refined only by the lead
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --note hello`
    Then the command fails with exit code 1
      And the output contains "only the team lead (lead) refines it, not ann"

  @REQ-504 @S-504-3
  Scenario: a note is allowed while the refinement review is frozen
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refinement review","refiner":""}`
    When I run `backlog team update 1 --team t1 --agent lead --refinement-review complete --comments ok`
    Then the command succeeds

  @REQ-504 @S-504-4
  Scenario: a field edit before ready is refused
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refining","refiner":"ann"}`
    When I run `backlog team update 1 --team t1 --agent bob --claim bob`
    Then the command fails with exit code 1
      And the output contains "is not ready"

  @REQ-504 @S-504-5
  Scenario: the owner may close before ready
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refining","refiner":"ann"}`
    When I run `backlog team update 1 --team t1 --agent owner --close --by owner --reason r --summary s`
    Then the command succeeds

  @REQ-504 @S-504-6
  Scenario: the lead edits a refining item only as its refiner
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refining","refiner":"ann"}`
    When I run `backlog team update 1 --team t1 --agent lead --set-estimate 5`
    Then the command fails with exit code 1
      And the output contains "refiner"

  @REQ-504 @S-504-7
  Scenario: the lead may set dependencies of a refining item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refining","refiner":"ann"}`
    When I run `backlog team update 1 --team t1 --agent lead --set-depends-on none`
    Then the command succeeds

  @REQ-504 @S-504-8
  Scenario: a member may not work an incomplete item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"ready","refiner":""}`
    When I run `backlog team update 1 --team t1 --agent bob --note n`
    Then the command fails with exit code 1
      And the output contains "incomplete"

  @REQ-504 @S-504-9
  Scenario: the owner may close an incomplete item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"ready","refiner":""}`
    When I run `backlog team update 1 --team t1 --agent owner --close --by owner --reason r --summary s`
    Then the command succeeds

  @REQ-504 @S-504-10
  Scenario: an estimate line is allowed on an incomplete refining item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"refining","refiner":"ann"}`
    When I run `backlog team update 1 --team t1 --agent ann --append "ESTIMATE: 5"`
    Then the command succeeds

  @REQ-505 @S-505-1
  Scenario: team query shows the missing fields
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready"}`
    When I run `backlog team query --team t1 --agent ann --json --phase 001-work`
    Then the output contains "\"missing\""

  @REQ-505 @S-505-2
  Scenario: user show has no missing key
    Given a repository with a backlog
      And an item "User" exists
    When I run `backlog show 1 --json`
    Then the output does not contain "\"missing\""
