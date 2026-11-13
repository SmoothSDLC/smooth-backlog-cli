Feature: Team rules - a lead reads what the rules say, edits the team file and is told what is wrong with the edit

  Background:
    Given a repository with a backlog
    And a team file from the template "parallel"
    And I act as agent "lead-1"

  Scenario: a lead reads the rules and the steps, breaks the team file and validate says where and how to fix it
    When I run `backlog team query rules --team parallel`
    Then the command succeeds
    And the output contains "\"people\""
    When I run `backlog team query steps --team parallel`
    Then the command succeeds
    And the output contains "claim  takes:"
    When I remove the field "holder" from the item definition of the team "parallel" in the team file
    And I run `backlog team validate --team parallel`
    Then the command fails with exit code 2
    And the output contains "holder is no field of the item definition"
    And the output contains "fix: add holder to parallel.item"
