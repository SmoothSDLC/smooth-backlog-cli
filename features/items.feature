Feature: Items - a person creates, reads, changes and finishes backlog items
  The backlog of one repository and branch. The person works alone: no team, no agent names.

  Background:
    Given a repository with a backlog

  Scenario: create the first item
    When I run `backlog new --name "Fix the login redirect" --objective "Users land on their page after login" --summary "login redirect" --depends-on none`
    Then the command succeeds
    And the output contains "created phase 001-fix-the-login-redirect"
    And the output does not contain "rescan"
    And item 1 has status "pending"
    And item 1 has priority 0

  Scenario: read the queue and one item
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog list`
    Then the command succeeds
    And the output contains "001-one"
    And the output contains "002-two"
    When I run `backlog show 2 --json`
    Then the command succeeds
    And the output contains "\"name\": \"Two\""

  Scenario: the next item is the first of the queue
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog next`
    Then the command succeeds
    And the output contains "001-one"
    And the output does not contain "002-two"

  Scenario: change the text fields of an item
    Given an item "Draft" exists
    When I run `backlog update 1 --name "Final" --objective "new objective" --summary "new summary"`
    Then the command succeeds
    And item 1 has name "Final"
    And item 1 has objective "new objective"
    And item 1 has summary "new summary"

  Scenario: add a note and body text to an item
    Given an item "Notes" exists
    When I run `backlog update 1 --note "talked to the owner"`
    Then the command succeeds
    When I run `backlog update 1 --append "## Findings"`
    Then the command succeeds
    And item 1 body contains "## Findings"

  Scenario: record progress on an item
    Given an item "Progress" exists
    When I run `backlog update 1 --status in_progress --location src/login.js`
    Then the command succeeds
    And item 1 has status "in progress"
    And item 1 has location "src/login.js"

  Scenario: an unfinished item is not archived without force
    Given an item "Still open" exists
    When I run `backlog archive 1`
    Then the command fails
    And the output contains "not 'closed'"
    When I run `backlog archive 1 --force`
    Then the command succeeds
    And item 1 has status "pending"
    When I run `backlog list archive`
    Then the output contains "001-still-open"

  Scenario: a finished item can be reopened into the queue
    Given an item "Done" exists
    And I run `backlog update 1 --close --by owner --reason "decided" --summary "closed by decision"`
    When I run `backlog update 1 --status pending`
    Then the command succeeds
    And item 1 has status "pending"
    And the queue is 1

  Scenario: a split item inherits the context of its parent
    Given an item "Parent" exists
    When I run `backlog new --split-from 1 --name "Child" --depends-on none`
    Then the command succeeds
    And item 2 has objective "do Parent"
    And item 2 body contains "Split from"
