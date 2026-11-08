Feature: Limits - numbers in the team entry, counting rules in the definition
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-601 @S-601-1
  Scenario: the team limit refuses a second start
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key limits set to `{"team":1}`
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And an item "Second" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "the team work-in-progress limit of t1 is 1 and 1 item(s) are in progress"

  @REQ-601 @S-601-2
  Scenario: wip-limits.json is not read
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And the file "wip-limits.json" of the backlog home is `{"team":0}`
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann`
    Then the command succeeds

  @REQ-602 @S-602-1
  Scenario: a refinement counts as work in progress
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key limits set to `{"member":1}`
      And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann"}`
      And an item "Second" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann --force`
    Then the command fails with exit code 1
      And the output contains "the member work-in-progress limit of ann is 1"

  @REQ-602 @S-602-2
  Scenario: count_scope team ignores items of other teams
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `limits.count_scope = "team"`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And team "t1" has the entry key limits set to `{"overall":1}`
      And I run `backlog new --name x --status "in progress"`
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 2 has the front-matter fields `{"status":"ready","refiner":"","review_refs":"r.md","depends_on":"none","estimate_min":5}`
      And item 2 has a definition of done in its body
    When I run `backlog team update 2 --team t1 --agent ann --claim ann`
    Then the command succeeds

  @REQ-604 @S-604-1
  Scenario: the lead lifts the team limit for one item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key limits set to `{"team":1}`
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And an item "Second" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 2 has a definition of done in its body
      And I act as agent "lead"
      And I have read item 2
      And I run `backlog team update 2 --team t1 --wip-override "urgent fix"`
      And I act as agent "ann"
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann`
    Then the command succeeds

  @REQ-604 @S-604-2
  Scenario: a member cannot override
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --wip-override x`
    Then the command fails with exit code 1
      And the output contains "only the team lead (lead) lifts the team and agent work-in-progress limits"

  @REQ-605 @S-605-1
  Scenario: the wip view shows the team level
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And team "t1" has the entry key limits set to `{"team":4}`
    When I run `backlog team query --team t1 --agent ann --wip`
    Then the command succeeds
      And the output contains "team t1: 0 of 4"

  @REQ-605 @S-605-2
  Scenario: the wip view lists a stale item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `views.wip.stale_hours = 1`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And team "t1" has the entry key limits set to `{"team":4}`
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann","last_updated":"2000-01-01T00:00:00Z"}`
    When I run `backlog team query --team t1 --agent ann --wip`
    Then the command succeeds
      And the output contains "stale"
      And the output contains "001-a"
