Feature: User guarantee - user commands enforce nothing and meet a team item only through the definition
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-901 @S-901-1
  Scenario: user update of a bound item is refused by the file
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "Bound" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I take a snapshot of the backlog repository
    When I run `backlog update 1 --name x`
    Then the command fails with exit code 1
      And the output contains "use backlog team update: a team item is changed only there"
      And the backlog repository is unchanged since the snapshot

  @REQ-901 @S-901-2
  Scenario: a definition that allows user update
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `user_commands.update = {"allow":true}`
      And a team "t1" with lead "lead" and members "ann" using the workflow "team"
      And an item "Bound" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress"}`
    When I run `backlog update 1 --name x`
    Then the command succeeds

  @REQ-901 @S-901-3
  Scenario: move of a bound item is allowed by the template
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "Bound" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And a branch "other" exists on the origin
    When I run `backlog move 1 --to-branch other`
    Then the command succeeds

  @REQ-901 @S-901-4
  Scenario: clean is refused while a bound item is in scope
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "Bound" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
    When I run `backlog clean` and answer "yes"
    Then the command fails with exit code 1
      And the output contains "001-bound belongs to a team, and no command deletes a team item"

  @REQ-902 @S-902-1
  Scenario: user new writes no team keys
    Given a repository with a backlog
    When I run `backlog new --name "User" --objective o --summary s`
    Then item 1 has team ""
      And item 1 has refiner ""
      And item 1 has claimed_by ""
      And item 1 body does not contain "Definition of done"

  @REQ-902 @S-902-2
  Scenario: user update accepts any status word
    Given a repository with a backlog
      And an item "User" exists
    When I run `backlog update 1 --status bogus`
    Then the command succeeds
      And item 1 has status "bogus"

  @REQ-903 @S-903-1
  Scenario: a changed refusal text is printed
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `refusals.claimed_by_other = "<item> is taken by <holder>"`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the output contains "001-w is taken by ann"

  @REQ-903 @S-903-2
  Scenario: without texts.team_step the how-text prints only the flags
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `texts.team_step = <delete>`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
    When I run `backlog team pop --team t1 --agent lead --dry-run`
    Then the command succeeds
      And the output does not contain "backlog team update 001-a --team t1"

  @REQ-928 @S-928-1
  Scenario: list --json has no derived fields
    Given a repository with a backlog
      And I run `backlog new --name a`
    When I run `backlog list --json`
    Then the command succeeds
      And the output does not contain "review_state"
