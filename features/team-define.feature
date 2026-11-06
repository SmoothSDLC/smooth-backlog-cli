Feature: Team definitions - a team and its flow enter the backlog as validated JSON, committed and shared
  A team is defined through backlog team define from a JSON file. The CLI checks the fields, writes the entry into the
  backlog configuration beside the others, commits and pushes it, so every checkout sees it after its next pull.

  Background:
    Given a repository with a backlog
    And the team configuration is a committed file

  Scenario: a defined team is published and another checkout sees it
    When I define the team from the JSON `{"name":"gold","lead":"ann","members":["bob","cy"]}`
    Then the command succeeds
    And the output contains "team gold defined: lead ann, 2 members, flow team"
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees team "gold" with lead "ann"

  Scenario: a definition with a missing field is refused and nothing is written
    When I define the team from the JSON `{"name":"gold","members":["bob"]}`
    Then the command fails
    And the output contains "lead"
