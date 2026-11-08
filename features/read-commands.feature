Feature: Read commands - list, show, history, changes and next all-branches read the backlog and change nothing
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

  Scenario: show prints one item whole, and refuses an item that is not there
    Given an item "Alpha" exists
    When I run `backlog show 1`
    Then the command succeeds
    And the output contains "001-alpha"
    And the output contains "front_matter"
    When I run `backlog show 7`
    Then the command fails with exit code 1
    And the output contains "no phase"

  Scenario: history prints the events of the backlog, and of one item
    Given an item "Alpha" exists
    When I run `backlog history`
    Then the command succeeds
    And the output contains "planning_event"
    When I run `backlog history 1`
    Then the command succeeds
    When I run `backlog history 7`
    Then the command fails with exit code 1

  Scenario: changes sets the reference of the agent on its first use
    Given an item "Alpha" exists
    When I run `backlog changes`
    Then the command succeeds
    And the output contains "no earlier use: reference set now"

  Scenario: next all-branches names the next item over every branch
    Given an item "Alpha" exists
    When I run `backlog next all-branches`
    Then the command succeeds
    And the output contains "001-alpha"

  Scenario: backlog alone prints the help
    When I run `backlog`
    Then the command succeeds
    And the output contains "Usage:"
    And the output contains "backlog show"
