Feature: List - the items of this branch, one kind of item, the branches, the critical items, or every branch
  Background:
    Given a repository with a backlog

  Scenario: list prints the open items and then the finished ones
    Given an item "Open one" exists
    And an item "Done one" exists
    And I run `backlog done 2`
    When I run `backlog list`
    Then the command succeeds
    And the output contains "001-open-one"
    And the output contains "002-done-one"

  Scenario: list names a kind of item
    Given an item "Open one" exists
    And an item "Done one" exists
    And I run `backlog done 2`
    When I run `backlog list open`
    Then the output contains "001-open-one"
    And the output does not contain "002-done-one"
    When I run `backlog list done`
    Then the output contains "002-done-one"
    And the output does not contain "001-open-one"

  Scenario: list branches counts the open and the done items of each branch
    Given an item "On main" exists
    When I run `backlog list branches`
    Then the command succeeds
    And the output contains "main  open 1  done 0"

  Scenario: list critical shows the critical items, or says there is none
    Given an item "Plain" exists
    When I run `backlog list critical`
    Then the command succeeds
    And the output contains "no open CRITICAL items"
    When I run `backlog new --name "Broken store" --objective "o" --summary "s" --depends-on none --severity critical`
    And I run `backlog list critical`
    Then the output contains "002-broken-store"

  Scenario: list all-branches names the branch of every row
    Given an item "On main" exists
    When I run `backlog list all-branches`
    Then the command succeeds
    And the output contains "(branch main)"

  Scenario: list refuses a word it does not know
    When I run `backlog list everything`
    Then the command fails with exit code 2
    And the output contains "unrecognized arguments: everything"
