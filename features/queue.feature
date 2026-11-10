Feature: Queue - priorities, dependencies, branches
  The queue of one repository and branch runs from P0 (next) without gaps.

  Background:
    Given a repository with a backlog
    And an item "A" exists
    And an item "B" exists
    And an item "C" exists

  Scenario: the queue is dense and in creation order
    Then the queue is 1, 2, 3

  Scenario: an item inserted at priority 0 becomes the next item
    When I run `backlog new --name "D" --objective "o" --summary "s" --depends-on none --priority 0`
    Then the command succeeds
    And the queue is 4, 1, 2, 3

  Scenario: move an item within the queue
    When I run `backlog update 3 --priority 0`
    Then the command succeeds
    And the queue is 3, 1, 2

  Scenario: replan the whole order
    When I run `backlog update --replan "2,3"`
    Then the command succeeds
    And the queue is 2, 3, 1

  Scenario: finishing an item closes the gap
    When I run `backlog update 1 --close --by owner --reason "decided" --summary "done"`
    Then the command succeeds
    And the queue is 2, 3
    And item 2 has priority 0

  Scenario: a critical item goes to the top and is announced
    When I run `backlog new --name "Data loss" --objective "o" --summary "s" --depends-on none --severity critical`
    Then the command succeeds
    And the queue is 4, 1, 2, 3
    When I run `backlog list`
    Then the output contains "CRITICAL"

  Scenario: an item depends on another item
    When I run `backlog update 3 --set-depends-on 1`
    Then the command succeeds
    And item 3 has depends_on "1"
    When I run `backlog update 1 --set-depends-on 3`
    Then the command fails
    And the output contains "cycle"

  Scenario: a dependency on an unknown item is refused
    When I run `backlog update 3 --set-depends-on 99`
    Then the command fails
    And the output contains "no item"

  Scenario: move an item to another branch
    Given a branch "feature" exists on the origin
    When I run `backlog move 2 --to-branch feature`
    Then the command succeeds
    And the queue is 1, 3
    And item 2 has branch "feature"
    When I run `backlog list all-branches`
    Then the output contains "002-b"

  Scenario: the events of an item are kept with the item
    When I run `backlog update 1 --status "in progress" --note "started"`
    Then the command succeeds
    And item 1 has status "in progress"
    When I run `backlog history 1`
    Then the command succeeds
    And the output contains "started"
    And the output contains "status: pending -> in progress"
    When I run `backlog show 1 --json`
    Then the JSON field front_matter.events has 1 or more entries
