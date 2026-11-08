Feature: Team files - registries, schema versions, discovery, validation and migration
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-001 @S-001-1
  Scenario: team define writes the schema 2 teams file
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And the team configuration is a committed file
    When I define the team from the JSON `{"schema":"backlog-team-definition/2","name":"gold","workflow":"team","people":{"lead":"ann"},"lists":{"members":["bob","cy"]}}`
    Then the command succeeds
      And the file "teams.json" of the backlog home has the JSON value "backlog-teams/2" at "schema"
      And the file "teams.json" of the backlog home has the JSON value "ann" at "teams.gold.people.lead"

  @REQ-001 @S-001-2
  Scenario: team workflow writes the schema 2 workflows file
    Given a repository with a backlog
    When I run `backlog team workflow --file <template:team.full.json>`
    Then the command succeeds
      And the file "workflows.json" of the backlog home has the JSON value "backlog-workflows/2" at "schema"

  @REQ-002 @S-002-1
  Scenario: a schema 1 teams file stops every team command
    Given a repository with a backlog
      And the file "teams.json" of the backlog home is `{"t1":{"people":{"lead":"lead"},"lists":{"members":["ann"]}}}`
    When I run `backlog team query --team t1 --agent ann --claimable`
    Then the command fails with exit code 2
      And the output contains "teams.json is schema 1; run backlog team migrate"

  @REQ-002 @S-002-2
  Scenario: a schema 1 workflow stops team commands
    Given a repository with a backlog
      And the file "workflows.json" of the backlog home is `{"team":{"workflow":"team","version":1}}`
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","people":{"lead":"lead"},"lists":{"members":["ann"]}}}}`
    When I run `backlog team pop --team t1 --agent ann --dry-run`
    Then the command fails with exit code 2
      And the output contains "workflows.json is schema 1; run backlog team migrate"

  @REQ-002 @S-002-3
  Scenario: an item with schema 1 fields stops every command
    Given a repository with a backlog
      And an item "a" exists
      And item 1 has the front-matter fields `{"stage":"ready"}`
    When I run `backlog show 1`
    Then the command fails with exit code 2
      And the output contains "carries schema 1 fields (stage); run backlog team migrate"

  @REQ-003 @S-003-1
  Scenario: an unregistered workflow is not taken from the CLI package
    Given a repository with a backlog
      And the file "workflows.json" of the backlog home is `{"schema":"backlog-workflows/2","workflows":{}}`
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","people":{"lead":"lead"},"lists":{"members":["ann"]}}}}`
    When I run `backlog team query --team t1 --agent ann --claimable`
    Then the command fails with exit code 2
      And the output contains "teams.t1.workflow: team is not registered in workflows.json"

  @REQ-004 @S-004-1
  Scenario: a broken entry of another team still stops the command
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","people":{"lead":"lead"},"lists":{"members":["ann"]}},"t2":{"workflow":"team","people":{"lead":"x"},"lists":{"members":[]}}}}`
    When I run `backlog team query --team t1 --agent ann --claimable`
    Then the command fails with exit code 2
      And the output contains "teams.t2.lists.members: must not be empty (workflow team)"

  @REQ-005 @S-005-1
  Scenario: a team without an entry is refused
    Given a repository with a backlog
    When I run `backlog team query --team nobody --agent ann --claimable`
    Then the command fails with exit code 1
      And the output contains "team nobody is not configured in the backlog configuration"

  @REQ-005 @S-005-2
  Scenario: user commands do not need team files
    Given a repository with a backlog
      And an item "User" exists
    When I run `backlog update 1 --name "User 2"`
    Then the command succeeds

  @REQ-006 @S-006-1
  Scenario: a non-JSON teams file stops a team command
    Given a repository with a backlog
      And the file "teams.json" of the backlog home is `{not json`
    When I run `backlog team pop --team t1 --agent ann --dry-run`
    Then the command fails with exit code 2
      And the output contains "invalid team configuration"

  @REQ-006 @S-006-2
  Scenario: a user command on a bound item fails closed with a broken file
    Given a repository with a backlog
      And an item "Bound" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new"}`
      And the file "teams.json" of the backlog home is `{not json`
      And I take a snapshot of the backlog repository
    When I run `backlog update 1 --name x`
    Then the command fails with exit code 2
      And the backlog repository is unchanged since the snapshot

  @REQ-006 @S-006-3
  Scenario: an item bound to a team without an entry fails closed
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And an item "a" exists
      And item 1 has the front-matter fields `{"team":"ghost","status":"new"}`
    When I run `backlog show 1`
    Then the command fails with exit code 2
      And the output contains "is bound to team ghost, which has no entry"

  @REQ-007 @S-007-1
  Scenario: validate reports every problem
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","people":{"lead":""},"lists":{"members":[]}}}}`
    When I run `backlog team validate`
    Then the command fails with exit code 2
      And the output contains "teams.json: teams.t1.people.lead: must match"
      And the output contains "teams.json: teams.t1.lists.members: must not be empty (workflow team)"

  @REQ-007 @S-007-2
  Scenario: validate passes a valid configuration
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team validate`
    Then the command succeeds
      And the output contains "valid (1 teams, 1 workflows)"

  @REQ-007 @S-007-3
  Scenario: validate --json
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team validate --json`
    Then the command succeeds
      And the output contains "\"ok\": true"

  @REQ-008 @S-008-1
  Scenario: a definition file with an unknown status is refused
    Given a repository with a backlog
      And a definition file "def.json" from the template "team.full.json" with `initial = "draft"`
    When I run `backlog team validate --file def.json`
    Then the command fails with exit code 2
      And the output contains "def.json: initial: draft is not one of statuses"

  @REQ-008 @S-008-2
  Scenario: a team definition file validates
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a file "team.json" outside the backlog contains `{"schema":"backlog-team-definition/2","name":"gold","workflow":"team","people":{"lead":"ann"},"lists":{"members":["bob"]}}`
    When I run `backlog team validate --file team.json`
    Then the command succeeds

  @REQ-009 @S-009-1
  Scenario: a valid definition is registered
    Given a repository with a backlog
    When I run `backlog team workflow --file <template:minimal.json>`
    Then the command succeeds
      And the output contains "✅ workflow minimal registered"

  @REQ-009 @S-009-2
  Scenario: --show never falls back to the package
    Given a repository with a backlog
    When I run `backlog team workflow --show team`
    Then the command fails with exit code 2
      And the output contains "workflow team is not registered"

  @REQ-010 @S-010-1
  Scenario: refinement_review is definable
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And the team configuration is a committed file
    When I define the team from the JSON `{"schema":"backlog-team-definition/2","name":"gold","workflow":"team","people":{"lead":"ann"},"lists":{"members":["bob"]},"refinement_review":[{"team":"gold","count":1}]}`
    Then the command succeeds
      And the file "teams.json" of the backlog home has the JSON value "gold" at "teams.gold.refinement_review.0.team"

  @REQ-010 @S-010-2
  Scenario: a team definition without workflow is refused
    Given a repository with a backlog
      And the team configuration is a committed file
    When I define the team from the JSON `{"schema":"backlog-team-definition/2","name":"gold","people":{"lead":"ann"},"lists":{"members":["bob"]}}`
    Then the command fails with exit code 2
      And the output contains "missing key workflow"

  @REQ-010 @S-010-3
  Scenario: a team without external reviewers is defined on the template workflow
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
    When I define the team from the JSON `{"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]}}`
    Then the command succeeds
      And the output contains "team t9 defined: lead a, 1 members, flow team"
      And I run `backlog team validate`
      And the command succeeds

  @REQ-014 @S-014-1
  Scenario: the full template validates
    Given a repository with a backlog
    When I run `backlog team validate --file <template:team.full.json>`
    Then the command succeeds

  @REQ-014 @S-014-2
  Scenario: the minimal template validates
    Given a repository with a backlog
    When I run `backlog team validate --file <template:minimal.json>`
    Then the command succeeds

  @REQ-015 @S-015-1
  Scenario: a team with open items is not redefined
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the team configuration is a committed file
      And I act as agent "lead"
      And I run `backlog team new --team t1 --name "Open" --objective o --summary s`
    When I define the team from the JSON `{"schema":"backlog-team-definition/2","name":"t1","workflow":"team","people":{"lead":"lead"},"lists":{"members":["ann"]}}`
    Then the command fails with exit code 2
      And the output contains "has 1 open items; register the new composition under another name"

  @REQ-020 @S-020-1 @conditional @Q-20
  Scenario: A: a compatible upgrade of a definition in use is registered
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And a definition file "v2.json" from the template "team.full.json" with `description = "v2"`
    When I run `backlog team workflow --file v2.json`
    Then the command succeeds
