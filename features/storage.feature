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
    When I run `backlog team --help`
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
    When I run `backlog query`
    Then the command succeeds
    And the output does not contain the backlog folder path
    When I run `backlog next`
    Then the output does not contain the backlog folder path
    Given an item "Hidden file" exists
    When I run `backlog query`
    Then the command succeeds
    And the output does not contain "phases/"
    And the output does not contain ".md"
    And the output does not contain the backlog folder path
    When I run `backlog next`
    Then the command succeeds
    And the output does not contain "phases/"
    And the output does not contain ".md"

  Scenario: the version is printed
    When I run `backlog --version`
    Then the command succeeds
    And the output matches /\d+\.\d+\.\d+/

  Scenario: every change is committed and pushed, wherever the items live
    Given an item "Published" exists
    When I run `backlog update 1 --status in_progress`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change
    When I run `backlog update 1 --status done`
    And I run `backlog archive 1`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change

  Scenario: a change that cannot be pushed is reported
    Given an item "Stranded" exists
    And the backlog repository's origin is unreachable
    When I run `backlog update 1 --status in_progress`
    Then the command fails with exit code 3
    And the output matches /could not update .* from origin|was not published/
