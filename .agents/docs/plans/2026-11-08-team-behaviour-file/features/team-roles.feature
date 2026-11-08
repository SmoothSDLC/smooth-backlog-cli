Feature: Team roles and identity - who may take a step comes from the definition and the team entry
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-201 @S-201-1
  Scenario: a role from another team decides the refinement reviewer
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And a team "reviewers" with lead "rex" and members "ria" using the workflow "team"
      And team "t1" has the entry rule refinement_review set to `[{"team":"reviewers","count":1}]`
      And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refinement-review complete --comments ok`
    Then the command fails with exit code 1
      And the output contains "is reviewed by a member of reviewers"

  @REQ-201 @S-201-2
  Scenario: roles with other names work
    Given a repository with a backlog
      And the backlog registers the workflow "boat" from the template "minimal.json" with `roles = {"captain":{"entry_person":"skipper"},"crew":{"entry_list":"hands"},"holder":{"item_field":"claimed_by"}} ; entry_constraints = [{"non_empty":"hands"}] ; steps.claim.by = ["captain"] ; steps.close.by = ["holder","captain"]`
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"b1":{"workflow":"boat","people":{"skipper":"sam"},"lists":{"hands":["ann"]}}}}`
      And I run `backlog team new --team b1 --agent sam --name a`
    When I run `backlog team update 1 --team b1 --agent ann --claim ann`
    Then the command fails with exit code 1
      And the output contains "claim on 001-a is for captain, not ann"

  @REQ-202 @S-202-1
  Scenario: an external stage review by a member
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for external review","claimed_by":"bob","review_author":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And team "t1" has the entry list external_reviewers set to `["xia"]`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --start-review`
    Then the command fails with exit code 1
      And the output contains "start-review on 001-work is for external, not ann"

  @REQ-202 @S-202-2
  Scenario: the author cannot review
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --start-review`
    Then the command fails with exit code 1
      And the output contains "bob: the same session cannot review its own work"

  @REQ-203 @S-203-1
  Scenario: the lead releases a member's item with a reason
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --release ann --by lead --reason "ann is away"`
    Then the command succeeds
      And item 1 body contains "Released by lead for ann"

  @REQ-204 @S-204-1
  Scenario: a member acts only as itself
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command fails with exit code 1
      And the output contains "you are ann (BACKLOG_AGENT): a member acts only as itself, not as bob"

  @REQ-205 @S-205-1
  Scenario: a new session of the same worker continues its item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann:1","refiner":""}`
      And team "t1" has the entry list members set to `["ann:1","ann:2","bob"]`
      And I act as agent "ann:2"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann:2`
    Then the command succeeds

  @REQ-205 @S-205-2
  Scenario: without same_worker_pattern a numbered session is another worker
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `identity.same_worker_pattern = <delete>`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann:1"}`
    When I run `backlog team update 1 --team t1 --agent ann:2 --claim ann:2`
    Then the command fails with exit code 1
      And the output contains "claimed by ann:1"

  @REQ-206 @S-206-1
  Scenario: TEAM_LEAD is not read
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And the environment TEAM_LEAD is "ann"
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"bob","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --reassign ann --reason r`
    Then the command fails with exit code 1
      And the output contains "only the lead (lead) gives one agent's item to another"

  @REQ-206 @S-206-2
  Scenario: --lead is no option of team pop
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
    When I run `backlog team pop --team t1 --agent ann --lead ann`
    Then the command fails with exit code 2
      And the output contains "unrecognized arguments: --lead"

  @REQ-207 @S-207-1
  Scenario: an item of another branch is outside the session
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And the environment TEAM_REPOSITORY is "this repository"
      And the environment TEAM_BRANCH is "other"
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","branch":"main"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "but this team session is bound to"

  @REQ-207 @S-207-2
  Scenario: without bind_session the session scope is ignored
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `scope.bind_session = false`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a --branch dev`
      And the environment TEAM_BRANCH is "main"
    When I run `backlog team update 1 --team t1 --agent lead --note n`
    Then the command succeeds

  @REQ-208 @S-208-1
  Scenario: another repository offers only chunk work
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the item "c" of repository "other/repo" is bound to team "t1" with the front-matter fields `{"status":"ready","chunk":true}`
      And the item "p" of repository "other/repo" is bound to team "t1" with the front-matter fields `{"status":"ready"}`
    When I run `backlog team pop --team t1 --agent ann --scope all --dry-run`
    Then the command succeeds
      And the output contains "c"
      And the output does not contain "001-p"

  @REQ-208 @S-208-2
  Scenario: without foreign_items another repository offers nothing
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `scope.foreign_items = <delete>`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the item "c" of repository "other/repo" is bound to team "t1" with the front-matter fields `{"status":"ready","chunk":true}`
    When I run `backlog team pop --team t1 --agent ann --scope all --dry-run`
    Then the command fails with exit code 3

  @REQ-209 @S-209-1
  Scenario: the lead cannot be a member
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And the file "teams.json" of the backlog home is `{"schema":"backlog-teams/2","teams":{"t1":{"workflow":"team","people":{"lead":"ann"},"lists":{"members":["ann"]}}}}`
    When I run `backlog team validate`
    Then the command fails with exit code 2
      And the output contains "teams.t1: lead and members must not share a name (b)"
