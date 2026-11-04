Feature: Storage - where the item files live changes nothing about the commands
  The items of a repository live either inside the repository or in a clone of a backlog repository.
  Every command exists, reads the same options and prints the same output in both places.

  Background:
    Given a repository with a backlog

  Scenario: the help lists one command set, with no mode
    When I run `backlog --help`
    Then the command succeeds
    And the output contains "backlog new"
    And the output contains "backlog query"
    And the output contains "backlog update"
    And the output does not contain "shared mode"
    And the output does not contain "local mode"
    And the output does not contain "--use-backlog-repo"
    And the output does not contain "--use-local-repo"

  Scenario: every documented command answers --help
    When I run `backlog new --help`
    Then the command succeeds
    When I run `backlog update --help`
    Then the command succeeds
    When I run `backlog query --help`
    Then the command succeeds
    When I run `backlog next --help`
    Then the command succeeds
    When I run `backlog pop --help`
    Then the command succeeds
    When I run `backlog work --help`
    Then the command succeeds
    When I run `backlog team pop --help`
    Then the command succeeds
    When I run `backlog move --help`
    Then the command succeeds
    When I run `backlog archive --help`
    Then the command succeeds
    When I run `backlog setup --help`
    Then the command succeeds

  Scenario: list is the queue
    Given an item "One" exists
    When I run `backlog list`
    Then the command succeeds
    And the output contains "001-one"

  Scenario: an unknown command is refused without naming a mode
    When I run `backlog frobnicate`
    Then the command fails
    And the output does not contain "mode"

  Scenario: the output never names the item files or their folder
    Given an item "Hidden file" exists
    When I run `backlog query`
    Then the command succeeds
    And the output does not contain "phases/"
    And the output does not contain ".md"

  Scenario: the version is printed
    When I run `backlog --version`
    Then the command succeeds
    And the output matches /\d+\.\d+\.\d+/
