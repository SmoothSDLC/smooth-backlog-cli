Feature: Team migrate - a schema 1 backlog is converted once, or the command fails with the reason
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-011 @S-011-1
  Scenario: migrate converts a schema 1 backlog
    Given a repository with a backlog
      And the file "teams.json" of the backlog home is `{"t1":{"people":{"lead":"lead"},"lists":{"members":["ann"]},"wip":{"agent":1,"team":4}}}`
      And an item "Old" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"pending","stage":"ready"}`
    When I run `backlog team migrate`
    Then the command succeeds
      And the file "teams.json" of the backlog home has the JSON value "team" at "teams.t1.workflow"
      And item 1 has status "ready"
      And item 1 has stage ""

  @REQ-011 @S-011-2
  Scenario: migrate is idempotent
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team migrate`
    Then the command succeeds
      And the output contains "nothing to migrate"

  @REQ-011 @S-011-3
  Scenario: migrate leaves unbound items alone
    Given a repository with a backlog
      And the file "teams.json" of the backlog home is `{"t1":{"people":{"lead":"lead"},"lists":{"members":["ann"]}}}`
      And an item "User" exists
      And I run `backlog update 1 --status in_progress`
    When I run `backlog team migrate`
    Then the command succeeds
      And item 1 has status "in_progress"

  @REQ-011 @S-011-4
  Scenario: migrate gives a legacy slice its refiner key
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "a" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"pending","stage":"refining"}`
    When I run `backlog team migrate`
    Then the command succeeds
      And item 1 has refiner ""
      And item 1 has status "new"

  @REQ-011 @S-011-5
  Scenario: migrate keeps a requested change as a history line
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "a" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in_progress","review_state":"changes-requested","reviewer":"bob","reviewed_at":"2026-11-01T10:00:00Z","work_commit":"abc"}`
    When I run `backlog team migrate`
    Then the command succeeds
      And item 1 has status "in progress"
      And item 1 has review_history containing "2026-11-01T10:00:00Z peer reject bob abc: changes requested before the history was kept"

  @REQ-011 @S-011-6
  Scenario: migrate --file converts the topology definition
    Given a repository with a backlog
      And a file "old.json" outside the backlog is the fixture "example-team-v1.json"
    When I run `backlog team migrate --file old.json --dry-run`
    Then the command succeeds
      And the output contains "\"stages_order\": [\n    \"local\",\n    \"external\"\n  ]"

  @REQ-016 @S-016-1 @conditional @Q-16
  Scenario: A: an entry without workflow gets the template workflow
    Given a repository with a backlog
      And the file "teams.json" of the backlog home is `{"t1":{"lead":"lead","members":["ann"]}}`
    When I run `backlog team migrate`
    Then the command succeeds
      And the file "teams.json" of the backlog home has the JSON value "team" at "teams.t1.workflow"

  @REQ-017 @S-017-1 @conditional @Q-17
  Scenario: A: an item of a team without an entry is unbound
    Given a repository with a backlog
      And an item "a" exists
      And item 1 has the front-matter fields `{"team":"ghost","status":"done"}`
      And the file "teams.json" of the backlog home is `{"t1":{"lead":"lead","members":["ann"]}}`
    When I run `backlog team migrate`
    Then the command succeeds
      And the output contains "unbound (team ghost has no entry)"
      And item 1 has team ""

  @REQ-018 @S-018-1 @conditional @Q-18
  Scenario: A: an archived item is migrated too
    Given a repository with a backlog
      And an item "a" exists
      And item 1 has the front-matter fields `{"status":"closed","review_state":"passed"}`
      And I run `backlog archive 1`
    When I run `backlog team migrate`
    Then the command succeeds
      And I run `backlog show 1 --json`
      And the output does not contain "review_state"

  @REQ-019 @S-019-1 @conditional @Q-19
  Scenario: A: a teamless slice joins its parent's team
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "parent" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new"}`
      And an item "slice" exists
      And item 2 has the front-matter fields `{"status":"pending","stage":"refining"}`
      And item 2 body contains "Split from `001-parent`"
    When I run `backlog team migrate`
    Then the command succeeds
      And item 2 has team "t1"
