Feature: Done, clean, import and archive done are commands of their own
  Background:
    Given a repository with a backlog

  Scenario: done finishes an item and refuses one that is not there
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog done 1`
    Then the command succeeds
    And item 1 has status "closed"
    And the queue is 2
    When I run `backlog done 9`
    Then the command fails
    And the queue is 2

  Scenario: done without an item says what it needs
    When I run `backlog done`
    Then the command fails with exit code 2
    And the output contains "done needs an item"

  Scenario: clean asks first and changes nothing without a yes
    Given an item "Kept" exists
    When I run `backlog clean` and answer "no"
    Then the command fails with exit code 2
    And the output contains "This will remove every backlog item of"
    And the queue is 1

  Scenario: clean empties the branch after a yes
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog clean` and answer "yes"
    Then the command succeeds
    And the output contains "2 items removed from branch main"
    And the queue is empty

  Scenario: clean refuses a word it does not know and names itself
    When I run `backlog clean everything` and answer "yes"
    Then the command fails with exit code 2
    And the output contains "usage: clean [all-branches]"

  Scenario: import and archive done have their own help
    When I run `backlog import --help`
    Then the command succeeds
    And the output contains "backlog import — move the open items of another branch"
    When I run `backlog archive done --help`
    Then the command succeeds
    And the output contains "backlog archive done — archive every finished item"
