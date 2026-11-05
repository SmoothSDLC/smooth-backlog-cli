Feature: Repair - an item that cannot be read is named with its field and can be set again or restored
  An item file that cannot be read after the latest version was pulled makes every command of that backlog say which field cannot be
  read, and offer two ways out: set the field again, or bring back the item's previous version. The same in both storage locations.

  Background:
    Given a repository with a backlog
    And an item "Broken" exists

  Scenario: an unreadable field is named and can be set again
    Given the status of item 1 is damaged in the backlog repository
    When I run `backlog query`
    Then the command fails with exit code 2
    And the output contains "item 001-broken: the field status cannot be read"
    And the output contains "backlog update 001-broken --status <value>"
    And the output contains "backlog update 001-broken --restore"
    And the output does not contain "phases/"
    And the output does not contain the backlog folder path
    When I run `backlog update 1 --status pending`
    Then the command succeeds
    And item 1 has status "pending"
    And the backlog repository has no uncommitted or unpushed change

  Scenario: an unreadable item is restored to its previous version
    Given I run `backlog update 1 --summary "the good summary"`
    And the status of item 1 is damaged in the backlog repository
    When I run `backlog update 1 --restore`
    Then the command succeeds
    And item 1 has summary "the good summary"
    And item 1 has status "pending"
    And the backlog repository has no uncommitted or unpushed change

  Scenario: every command of the backlog refuses while one item cannot be read
    Given an item "Fine" exists
    And the status of item 1 is damaged in the backlog repository
    When I run `backlog query --phase 2 --json`
    Then the command fails with exit code 2
    And the output contains "item 001-broken: the field status cannot be read"
    When I run `backlog new --name "More" --objective "o" --summary "s" --depends-on none`
    Then the command fails with exit code 2
    And the output contains "backlog update 001-broken --restore"
