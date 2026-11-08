Feature: Team statuses and steps - the words, the steps and their effects come from the registered definition
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-101 @S-101-1
  Scenario: a team with its own words
    Given a repository with a backlog
      And the backlog registers the workflow "minimal" from the template "minimal.json"
      And a team "t2" with lead "lead" and members "ann" using the workflow "minimal"
      And I act as agent "lead"
      And I run `backlog team new --team t2 --name "Mini" --objective o --summary s`
    Then item 1 has status "ready"
    When I act as agent "ann"
      And I run `backlog team update 1 --team t2 --claim ann`
    Then item 1 has status "in progress"
    When I run `backlog team update 1 --team t2 --close --summary "done"`
    Then item 1 has status "closed"

  @REQ-101 @S-101-2
  Scenario: a finished word of the definition lets a dependent go
    Given a repository with a backlog
      And the backlog registers the workflow "minimal" from the template "minimal.json" with `finished = ["closed","dropped","archived"] ; statuses = ["ready","in progress","closed","dropped","archived"] ; steps.claim.requires = [{"field_empty_or_actor":"claimed_by","refusal":"claimed_by_other"},{"dependencies_finished":{"handoff_states":null},"refusal":"dependencies_not_done"}] ; refusals.dependencies_not_done = "<item>: waits on <list>" ; refusals.dep_status = "<id> (<status>)" ; refusals.dep_foreign = "<id> (<repository>, <status>)" ; refusals.dep_missing = "<id> (missing)"`
      And a team "m" with lead "lead" and members "ann, bob" using the workflow "minimal"
      And I run `backlog team new --team m --agent lead --name p`
      And item 1 has the front-matter fields `{"status":"dropped"}`
      And I run `backlog team new --team m --agent lead --name d --depends-on 1`
    When I run `backlog team update 2 --team m --agent ann --claim ann`
    Then the command succeeds

  @REQ-101 @S-101-3
  Scenario: an unfinished dependency blocks the claim of the patched definition
    Given a repository with a backlog
      And the backlog registers the workflow "minimal" from the template "minimal.json" with `steps.claim.requires = [{"field_empty_or_actor":"claimed_by","refusal":"claimed_by_other"},{"dependencies_finished":{"handoff_states":null},"refusal":"dependencies_not_done"}] ; refusals.dependencies_not_done = "<item>: waits on <list>" ; refusals.dep_status = "<id> (<status>)" ; refusals.dep_foreign = "<id> (<repository>, <status>)" ; refusals.dep_missing = "<id> (missing)"`
      And a team "m" with lead "lead" and members "ann, bob" using the workflow "minimal"
      And I run `backlog team new --team m --agent lead --name p`
      And I run `backlog team new --team m --agent lead --name d --depends-on 1`
    When I run `backlog team update 2 --team m --agent ann --claim ann`
    Then the command fails with exit code 1
      And the output contains "002-d: waits on 001-p (ready)"

  @REQ-102 @S-102-1
  Scenario: a side word returns to its returns_to word
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"awaiting decision","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --decision "go"`
    Then item 1 has status "refining"

  @REQ-103 @S-103-1
  Scenario: team update --status is refused by the template
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --status closed`
    Then the command fails with exit code 1
      And the output contains "backlog team update takes no --status"

  @REQ-103 @S-103-2
  Scenario: a step the definition does not define
    Given a repository with a backlog
      And the backlog registers the workflow "minimal" from the template "minimal.json"
      And a team "t2" with lead "lead" and members "ann" using the workflow "minimal"
      And the environment TEAM_NAME is "t2"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t2","status":"in progress","claimed_by":"ann"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t2 --waiting "ci"`
    Then the command fails with exit code 1
      And the output contains "waiting is not a step of workflow minimal"

  @REQ-104 @S-104-1
  Scenario: a claim from a word outside from
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refined","refiner":"ann"}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command fails with exit code 1
      And the output contains "is refined; claim needs ready or in progress"

  @REQ-104 @S-104-2
  Scenario: the hint for an unrefined item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command fails with exit code 1
      And the output contains "refine it first"

  @REQ-104 @S-104-3
  Scenario: a registered definition changes from
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.claim.from = ["refined","ready","in progress"]`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refined","refiner":"ann","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "bob"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command succeeds

  @REQ-105 @S-105-1
  Scenario: release keeps a review word
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"ann","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --release ann`
    Then item 1 has status "ready for review"

  @REQ-105 @S-105-2
  Scenario: release of a slice goes to ready
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --release ann`
    Then item 1 has status "ready"

  @REQ-105 @S-105-3
  Scenario: release of a work item goes to new
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"lead"}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --release lead`
    Then item 1 has status "new"

  @REQ-106 @S-106-1
  Scenario: a claim writes the holder and the author list
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann`
    Then item 1 has claimed_by "ann"
      And item 1 has session_authors "ann"

  @REQ-106 @S-106-2
  Scenario: sets_rules picks the first matching rule
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.waiting.sets_rules = [{"when":{"actor_has_role":"lead"},"sets":{"wait_on":"text:lead"}},{"sets":{"wait_on":"flag_value"}}]`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann"}`
    When I run `backlog team update 1 --team t1 --agent ann --waiting x`
    Then the command succeeds
      And item 1 has wait_on "x"

  @REQ-107 @S-107-1
  Scenario: a review records its verdict text
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review complete --comments "d.md fine"`
    Then item 1 body contains "## Review by ann: COMPLETE"

  @REQ-107 @S-107-2
  Scenario: records_rules picks the first matching record
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.waiting.records = <delete> ; steps.waiting.records_rules = [{"when":{"actor_has_role":"lead"},"records":"LEAD WAIT <value>"},{"records":"WAIT <value>"}]`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann"}`
    When I run `backlog team update 1 --team t1 --agent ann --waiting x`
    Then the command succeeds
      And item 1 body contains "WAIT x"

  @REQ-108 @S-108-1
  Scenario: a close without summary
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"review complete","claimed_by":"ann","refiner":"","handoffs":"none"}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --close`
    Then the command fails with exit code 1
      And the output contains "--close needs --summary"

  @REQ-108 @S-108-2
  Scenario: a review must cite a review document
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready for review","claimed_by":"bob","review_author":"bob","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And item 1 has a definition of done in its body
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --review complete --comments "fine"`
    Then the command fails with exit code 1
      And the output contains "--comments must cite at least one of the item's review_refs (d.md)"

  @REQ-109 @S-109-1
  Scenario: a refusal writes nothing
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "bob"
      And I have read item 1
      And I take a snapshot of the backlog repository
    When I run `backlog team update 1 --team t1 --claim bob`
    Then the command fails with exit code 1
      And the output contains "claimed by ann"
      And the backlog repository is unchanged since the snapshot

  @REQ-110 @S-110-1
  Scenario: two steps in one call
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann --waiting x`
    Then the command fails with exit code 1
      And the output contains "one team-work step at a time (got --claim, --waiting)"

  @REQ-110 @S-110-2
  Scenario: a verdict alone
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann"}`
      And I act as agent "rex"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refinement-review complete --comments ok --name changed`
    Then the command fails with exit code 1
      And the output contains "records the verdict alone"

  @REQ-110 @S-110-3
  Scenario: a third step made combinable runs with another step
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.waiting-done.combinable = true`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
      And item 1 has the front-matter fields `{"status":"in progress","claimed_by":"ann","wait_on":"x"}`
    When I run `backlog team update 1 --team t1 --agent ann --waiting-done --note n`
    Then the command succeeds

  @REQ-111 @S-111-1
  Scenario: a member ends its session after a review request
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-review any --note "c1"`
    Then the output contains "🛑 ann: END THE SESSION NOW"

  @REQ-111 @S-111-2
  Scenario: the lead does not end its session
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "Work" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"lead"}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --request-review any --note "c1"`
    Then the output does not contain "END THE SESSION"

  @REQ-112 @S-112-1
  Scenario: team update on a user item is refused
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And an item "User" exists
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --note x`
    Then the command fails with exit code 1
      And the output contains "001-user belongs to no team"

  @REQ-112 @S-112-2
  Scenario: an item of another team
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And a team "t2" with lead "l2" and members "cy" using the workflow "team"
      And an item "Other" exists
      And item 1 has the front-matter fields `{"team":"t2","status":"ready","refiner":""}`
      And I act as agent "ann"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "the item belongs to team t2, not to this session's team t1"

  @REQ-112 @S-112-3
  Scenario: a step without binds refuses an item outside a team
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.set-team.binds = false`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog new --name x`
    When I run `backlog team update 1 --team t1 --agent lead --set-team t1`
    Then the command fails with exit code 1
      And the output contains "belongs to no team"

  @REQ-113 @S-113-1
  Scenario: a definition that allows the lead to set a word
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.set-status = {"actor":"by","from":["*"],"to":"flag_value","by":["lead"]}`
      And a team "t1" with lead "lead" and members "ann" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"ready","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --status "in progress"`
    Then item 1 has status "in progress"

  @REQ-113 @S-113-2
  Scenario: a step to a word the definition does not have is invalid input
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `steps.status = {"value":"word","from":["*"],"to":"flag_value","by":["lead"]} ; undefined_step_refusals = <delete>`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And I run `backlog team new --team t1 --agent lead --name a`
    When I run `backlog team update 1 --team t1 --agent lead --status gone`
    Then the command fails with exit code 2
      And the output contains "argument --status: invalid choice: 'gone'"

  @REQ-114 @S-114-1
  Scenario: an ended session is refused when the file says so
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json" with `session.block_after_end = true`
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And the environment BACKLOG_SESSION is "s1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"in progress","claimed_by":"ann","refiner":""}`
      And an item "V" exists
      And item 2 has the front-matter fields `{"team":"t1","status":"ready","refiner":"","review_refs":["d.md"],"depends_on":[],"estimate_min":5}`
      And I act as agent "ann"
      And I have read item 1
      And I run `backlog team update 1 --team t1 --request-review any --note c`
      And I have read item 2
    When I run `backlog team update 2 --team t1 --claim ann`
    Then the command fails with exit code 1
      And the output contains "this session handed its item on and ended"
