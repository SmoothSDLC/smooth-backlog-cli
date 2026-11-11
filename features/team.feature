Feature: Team - a lead splits work for a team, its members take it and the rules of the team file decide each step
  The team file of a repository (.backlog/teams.json) names the people of a team, the fields of its items and the rules of every step. These scenarios use
  the parallel template: a lead splits an item and files its children, members claim, hand to check, check and close.

  Background:
    Given a repository with a backlog
    And a team file from the template "parallel"

  Scenario: a lead files an item, splits it and files a child under it
    Given I act as agent "lead-1"
    When I run `backlog team new --team parallel --name "Parser" --estimate 45`
    Then the command succeeds
    And the output contains "001-parser"
    When I run `backlog team update 1 split-start --team parallel`
    Then the command succeeds
    When I run `backlog team new --team parallel --name "Tokens" --estimate 20 --parent 1`
    Then the command succeeds
    And the output contains "002-tokens"
    When I run `backlog team update 1 split-done --team parallel`
    Then the command succeeds
    And the output contains "split-done"

  Scenario: a member who asks for work is given the first ready item
    Given a ready item "Tokens" for the team "parallel"
    When I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    Then the command succeeds
    And the output contains "claim 001-tokens"
    And the output contains "holder: member-1"
    And the output contains "status: in progress"

  Scenario: a refused step prints the reason and nothing changes
    Given a ready item "Tokens" for the team "parallel"
    When I act as agent "lead-1"
    And I run `backlog team update 1 claim --team parallel`
    Then the command fails
    And the output contains "the lead does not claim work; a member does"

  Scenario: the check of a step names the rule that decides
    Given a ready item "Tokens" for the team "parallel"
    When I act as agent "lead-1"
    And I run `backlog team query check 1 claim --team parallel`
    Then the command succeeds
    And the output contains "refused by rule claim-lead"
    When I act as agent "member-1"
    And I run `backlog team query check 1 claim --team parallel`
    Then the command succeeds
    And the output contains "allowed by rule claim"

  Scenario: a person who is not in the team is refused
    Given a ready item "Tokens" for the team "parallel"
    When I act as agent "stranger"
    And I run `backlog team update 1 claim --team parallel`
    Then the command fails
    And the output contains "stranger is not a person of team parallel"

  Scenario: the end of the queue is idle
    Given I act as agent "member-1"
    When I run `backlog team pop --team parallel`
    Then the command fails with exit code 3
    And the output contains "idle"
