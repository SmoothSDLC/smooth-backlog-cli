Feature: Aliases - every command name of the first release still works and runs the one command set
  Background:
    Given a repository with a backlog

  Scenario: init sets the repository up and keeps the items
    Given an item "Kept" exists
    When I run `backlog init`
    Then the command succeeds
    And the queue is 1

  Scenario: a first-release new creates an item
    When I run `backlog new "Fix the login" --description "users land on their page" --state open`
    Then the command succeeds
    And item 1 has name "Fix the login"
    And item 1 has objective "users land on their page"
    And item 1 has status "in progress"

  Scenario: set, priority and done change the item
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog set 2 name "Two renamed"`
    Then item 2 has name "Two renamed"
    When I run `backlog priority 2 0`
    Then the queue is 2, 1
    When I run `backlog 2 done`
    Then item 2 has status "closed"

  Scenario: list filters the queue
    Given an item "Open one" exists
    And an item "Done one" exists
    And I run `backlog done 2`
    When I run `backlog list done`
    Then the command succeeds
    And the output contains "002-done-one"
    And the output does not contain "001-open-one"
    When I run `backlog list open`
    Then the output contains "001-open-one"
    And the output does not contain "002-done-one"

  Scenario: branch lists the branches with counts
    Given an item "On main" exists
    When I run `backlog branch`
    Then the command succeeds
    And the output contains "main  open 1  done 0"

  Scenario: move with a positional branch
    Given an item "Mover" exists
    And a branch "release" exists on the origin
    When I run `backlog move 1 release`
    Then the command succeeds
    And the queue is empty

  Scenario: the headless switch and the question switch are accepted and ignored
    Given an item "Quiet" exists
    When I run `backlog query --headless --ask`
    Then the command succeeds
    And the output contains "001-quiet"

  Scenario: query --pop and next --agent point to the team command
    When I run `backlog query --pop --agent ada`
    Then the command fails with exit code 2
    And the output contains "backlog team pop --team <team> --agent <name>"
    When I run `backlog next --agent ada`
    Then the command fails with exit code 2

  Scenario: init backup is not a command
    When I run `backlog init backup`
    Then the command fails with exit code 2
    And the output contains "is not a backlog command"

  Scenario: init clean asks first and changes nothing without a yes
    Given an item "Kept" exists
    When I run `backlog init clean` and answer "no"
    Then the command fails with exit code 2
    And the output contains "This will destroy all configuration and current backlog items for"
    And the queue is 1
    When I run `backlog init clean`
    Then the command fails with exit code 2
    And the queue is 1

  Scenario: init clean empties this repository's backlog as one published change
    Given an item "Gone" exists
    And an item "Gone too" exists
    When I run `backlog init clean` and answer "yes"
    Then the command succeeds
    And the output contains "2 items removed"
    And the queue is empty
    And the backlog repository has no uncommitted or unpushed change

  Scenario: import brings the open items of another branch here, after the ones already queued
    Given an item "Mine" exists
    And an item "Theirs one" exists
    And an item "Theirs two" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 feature`
    And I run `backlog move 3 feature`
    When I run `backlog import --branch feature`
    Then the command succeeds
    And the output contains "imported 2 open item(s) of feature"
    And the queue is 1, 2, 3
    And item 2 has branch "main"

  Scenario: import --higher puts the imported items first, in their original order
    Given an item "Mine" exists
    And an item "Theirs one" exists
    And an item "Theirs two" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 feature`
    And I run `backlog move 3 feature`
    When I run `backlog import --branch feature --higher`
    Then the command succeeds
    And the queue is 2, 3, 1

  Scenario: import leaves finished items and an empty branch alone
    Given an item "Mine" exists
    And an item "Theirs" exists
    And a branch "feature" exists on the origin
    And I run `backlog done 2`
    And I run `backlog move 2 feature`
    When I run `backlog import --branch feature`
    Then the command succeeds
    And the output contains "nothing to import"
    And the queue is 1
    When I run `backlog import --branch main`
    Then the command fails with exit code 2
    And the output contains "that is the current branch"

  Scenario: archive done archives every finished item and leaves the open ones
    Given an item "One" exists
    And an item "Two" exists
    And an item "Three" exists
    And I run `backlog done 1`
    And I run `backlog done 2`
    When I run `backlog archive done`
    Then the command succeeds
    And the output contains "archived 2 finished item(s): 001-one, 002-two"
    And the queue is 3
    When I run `backlog list archive`
    Then the output contains "001-one"
    When I run `backlog archive done`
    Then the command succeeds
    And the output contains "nothing to archive"

