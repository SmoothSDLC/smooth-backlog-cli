Feature: Queue - team pop, the plan and the views follow the definition
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-802 @S-802-1
  Scenario: a member is offered the ready item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5,"branch":"main"}`
      And item 1 has a definition of done in its body
    When I run `backlog team pop --team t1 --agent ann --dry-run --json`
    Then the output contains "\"action\": \"claim\""

  @REQ-802 @S-802-2
  Scenario: nothing to do is idle with exit 3
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team pop --team t1 --agent ann --dry-run`
    Then the command fails with exit code 3

  @REQ-802 @S-802-3
  Scenario: queue.scope_default repo offers another branch's item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `queue.scope_default = "repo"`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a --branch dev`
      And item 1 has the front-matter fields `{"status":"ready","refiner":"","review_refs":"r.md","depends_on":"none","estimate_min":5}`
      And item 1 has a definition of done in its body
    When I run `backlog team pop --team t1 --agent ann --dry-run --json`
    Then the command succeeds
      And the output contains "001-a"

  @REQ-803 @S-803-1
  Scenario: the lead takes the work item with team pop
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new","review_refs":["d.md"],"depends_on":[],"estimate_min":5,"branch":"main"}`
      And item 1 has a definition of done in its body
    When I run `backlog team pop --team t1 --agent lead`
    Then the command succeeds
      And item 1 has claimed_by "lead"

  @REQ-804 @S-804-1
  Scenario: the plan gives a claim to a free member
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5,"branch":"main"}`
      And item 1 has a definition of done in its body
    When I run `backlog team query --team t1 --agent lead --plan --json`
    Then the output contains "\"action\": \"claim\""

  @REQ-805 @S-805-1
  Scenario: the decisions view
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"awaiting decision","decision_question":"which?","branch":"main"}`
    When I run `backlog team query --team t1 --decisions`
    Then the output contains "which?"

  @REQ-805 @S-805-2
  Scenario: an undefined view is invalid input
    Given a repository with a backlog
      And the backlog registers the workflow "minimal" from the template "minimal.json"
      And a team "m" with lead "lead" and members "ann, bob" using the workflow "minimal"
    When I run `backlog team query --team m --agent ann --claimable`
    Then the command fails with exit code 2
      And the output contains "view claimable is not defined by workflow minimal"

  @REQ-806 @S-806-1
  Scenario: chunk scope off offers no chunk work
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And team "t1" has the entry key chunk_scope set to `"off"`
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","chunk":true,"refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5,"branch":"main"}`
      And item 1 has a definition of done in its body
    When I run `backlog team pop --team t1 --agent ann --dry-run --json`
    Then the output does not contain "\"action\": \"chunk\""

  @REQ-807 @S-807-1
  Scenario: a team re-orders only its own items
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog new --name x`
      And I run `backlog team new --team t1 --agent lead --name a`
    When I run `backlog team update 2 --team t1 --agent lead --priority 0`
    Then the command succeeds
      And I run `backlog list --json`
      And the output contains "x"

  @REQ-807 @S-807-2
  Scenario: with reorder_scope all every item is re-ordered
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `queue.reorder_scope = "all"`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog new --name x`
      And I run `backlog team new --team t1 --agent lead --name a`
    When I run `backlog team update 2 --team t1 --agent lead --priority 0`
    Then the command succeeds
