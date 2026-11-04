Feature: Team - a team lead splits a work item, members refine it, a reviewed refinement is claimed and worked
  A team session is bound by TEAM_NAME, TEAM_LEAD, TEAM_REPOSITORY and TEAM_BRANCH. The caller is the agent part
  of its agent id (name@team). Before stage ready a split item only takes its refinement steps.

  Background:
    Given a repository with a backlog
    And the environment TEAM_NAME is "t1"
    And the environment TEAM_LEAD is "lead"
    And the environment TEAM_REPOSITORY is "acme/demo"
    And the environment TEAM_BRANCH is "main"
    And I act as agent "lead@t1"
    And I run `backlog new --name "Parser work" --objective "o" --summary "s" --depends-on none --review-refs references/review/code.md --estimate 90 --complexity medium --body "## Definition of done\n- [ ] the parser parses the sample"`
    And I run `backlog update 1 --set-team t1`

  Scenario: the lead takes its team's work item with team pop
    When I run `backlog team pop --team t1 --agent lead`
    Then the command succeeds
    And item 1 has claimed_by "lead"

  Scenario: a split item starts in stage refining and belongs to the team
    When I run `backlog new --name "Parser child" --split-from 1 --depends-on none`
    Then the command succeeds
    And item 2 has team "t1"
    And item 2 has stage "refining"

  Scenario: an unrefined split item is not claimed
    Given I run `backlog new --name "Parser child" --split-from 1 --depends-on none`
    When I act as agent "cody-a@t1"
    And I run `backlog update 2 --claim cody-a`
    Then the command fails
    And the output contains "nobody claims"

  Scenario: a member refines, the lead asks for the refinement review, the reviewer passes it, a member claims it
    Given I run `backlog new --name "Parser child" --split-from 1 --depends-on none`
    When I act as agent "cody-a@t1"
    And I have read item 2
    And I run `backlog update 2 --refine-start --by cody-a`
    Then the command succeeds
    And item 2 has refiner "cody-a"
    When I run `backlog update 2 --set-review-refs references/review/code.md --set-estimate 30 --set-complexity low --append "## Definition of done\n- [ ] the parser reads the sample"`
    Then the command succeeds
    When I run `backlog update 2 --refine-done --by cody-a --note "fields and definition of done set"`
    Then the command succeeds
    And item 2 has stage "refined"
    When I act as agent "lead@t1"
    And I have read item 2
    And I run `backlog update 2 --request-refinement-review --by lead`
    Then the command succeeds
    And item 2 has stage "refinement-review"
    When I run `backlog update 2 --refinement-review pass --by codex --comments "checkable (thread t-1)"`
    Then the command succeeds
    And item 2 has stage "ready"
    When I act as agent "cody-b@t1"
    And I have read item 2
    And I run `backlog update 2 --claim cody-b`
    Then the command succeeds
    And item 2 has claimed_by "cody-b"

  Scenario: a member acts only as itself
    Given I run `backlog new --name "Parser child" --split-from 1 --depends-on none`
    When I act as agent "cody-a@t1"
    And I run `backlog update 2 --refine-start --by cody-b`
    Then the command fails
    And the output contains "acts only as itself"

  Scenario: a refinement question for the owner holds the item until the decision is recorded
    Given I run `backlog new --name "Parser child" --split-from 1 --depends-on none`
    When I run `backlog update 2 --request-decision "Which format? Options A, B. Recommendation A." --by lead`
    Then the command succeeds
    And item 2 has stage "review-hitl"
    When I run `backlog query --decisions`
    Then the output contains "Which format?"
    When I run `backlog update 2 --decision "A"`
    Then the command succeeds
    And item 2 has stage "refining"
    And item 2 has refiner "lead"
