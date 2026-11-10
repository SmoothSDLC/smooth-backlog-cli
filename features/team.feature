Feature: Team - a team lead splits a work item, members refine it, a reviewed refinement is claimed, worked, reviewed by rule and closed
  Teams, their members and leads, and their review rules are configuration of the backlog folder (teams.json): nothing
  about them is built into the CLI. A team session is bound by SMOOTH_BACKLOG_CLI_TEAM_NAME and SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY/SMOOTH_BACKLOG_CLI_TEAM_BRANCH; the caller is
  SMOOTH_BACKLOG_CLI_AGENT and acts only as itself. Before stage ready a split item only takes its refinement steps.

  Background:
    Given a repository with a backlog
    And a team "t1" with lead "lead" and members "ann, bob"
    And a team "reviewers" with lead "rex" and members "rex, ria"
    And team "t1" work needs 1 pass by "t1" and 1 pass by "reviewers"
    And team "t1" refinements are reviewed by "reviewers"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY is "this repository"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_BRANCH is "main"
    And I act as agent "lead"
    And I run `backlog new --name "Parser work" --objective "o" --summary "s" --estimate 90 --complexity medium --body "## Definition of done\n- [ ] the parser parses the sample"`
    And I run `backlog team update 1 --set-team t1 --set-review-refs docs/review/code.md`

  Scenario: the lead takes its team's work item with team pop
    When I run `backlog team pop --team t1 --agent lead`
    Then the command succeeds
    And item 1 has owner "lead"

  Scenario: a split item starts in stage refining and belongs to the team
    When I run `backlog team new --name "Parser child" --split-from 1`
    Then the command succeeds
    And item 2 has team "t1"
    And item 2 has stage "refining"

  Scenario: an unrefined split item is not claimed
    Given I run `backlog team new --name "Parser child" --split-from 1`
    When I act as agent "ann"
    And I run `backlog team update 2 --claim ann`
    Then the command fails
    And the output contains "nobody claims"

  Scenario: a member refines, the lead asks for the refinement review, a configured reviewer passes it, a member claims it
    Given I run `backlog team new --name "Parser child" --split-from 1`
    When I act as agent "ann"
    And I have read item 2
    And I run `backlog team update 2 --refine-start --by ann`
    Then the command succeeds
    And item 2 has refiner "ann"
    When I run `backlog team update 2 --set-review-refs docs/review/code.md --set-estimate 30 --set-complexity low --set-depends-on none --append "## Definition of done\n- [ ] the parser reads the sample"`
    Then the command succeeds
    When I run `backlog team update 2 --refine-done --by ann --note "fields and definition of done set"`
    Then the command succeeds
    And item 2 has stage "refined"
    When I act as agent "lead"
    And I have read item 2
    And I run `backlog team update 2 --request-refinement-review --by lead`
    Then the command succeeds
    And item 2 has stage "refinement-review"
    When I run `backlog team update 2 --refinement-review pass --by bob --comments "bob is no refinement reviewer"`
    Then the command fails
    And the output contains "reviewed by a member of reviewers"
    When I run `backlog team update 2 --refinement-review pass --by rex --comments "checkable (thread t-1)"`
    Then the command succeeds
    And item 2 has stage "ready"
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog team update 2 --claim bob`
    Then the command succeeds
    And item 2 has owner "bob"

  Scenario: the review rules of the team decide when a worked item closes
    Given I run `backlog team new --name "Parser child" --split-from 1`
    And I act as agent "ann"
    And I have read item 2
    And I run `backlog team update 2 --refine-start --by ann`
    And I run `backlog team update 2 --set-review-refs docs/review/code.md --set-estimate 30 --set-complexity low --set-depends-on none --append "## Definition of done\n- [ ] the parser reads the sample"`
    And I run `backlog team update 2 --refine-done --by ann --note "refined"`
    And I act as agent "lead"
    And I have read item 2
    And I run `backlog team update 2 --request-refinement-review --by lead`
    And I run `backlog team update 2 --refinement-review pass --by rex --comments "ok"`
    And I act as agent "bob"
    And I have read item 2
    And I run `backlog team update 2 --claim bob`
    When I run `backlog team update 2 --request-review ann --note "commit abc123"`
    Then the command succeeds
    When I act as agent "ann"
    And I have read item 2
    And I run `backlog team update 2 --review pass --by ann --comments "docs/review/code.md: fine"`
    Then the command succeeds
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog team update 2 --close --summary "delivered"`
    Then the command fails
    And the output contains "members of team reviewers"
    When I run `backlog team update 2 --request-review ria --note "commit abc123"`
    Then the command succeeds
    When I act as agent "ria"
    And I have read item 2
    And I run `backlog team update 2 --review pass --by ria --comments "docs/review/code.md: fine"`
    Then the command succeeds
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog team update 2 --close --summary "delivered"`
    Then the command succeeds
    And item 2 has status "closed"

  Scenario: a member acts only as itself
    Given I run `backlog team new --name "Parser child" --split-from 1`
    When I act as agent "ann"
    And I run `backlog team update 2 --refine-start --by bob`
    Then the command fails
    And the output contains "acts only as itself"

  Scenario: a refinement question for the owner holds the item until the decision is recorded
    Given I run `backlog team new --name "Parser child" --split-from 1`
    When I run `backlog team update 2 --request-decision "Which format? Options A, B. Recommendation A." --by lead`
    Then the command succeeds
    And item 2 has stage "review-hitl"
    When I run `backlog team query --team t1 --decisions`
    Then the output contains "Which format?"
    When I run `backlog team update 2 --decision "A"`
    Then the command succeeds
    And item 2 has stage "refining"
    And item 2 has refiner "lead"
