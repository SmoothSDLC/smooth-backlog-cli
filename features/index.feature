Feature: Index - the order of the backlog is committed in one file per repository
  The order of the queue of each branch is kept in one tracked text file, committed and pushed with the items. A change of the
  order is a change of that file and of no item. The same in both storage locations.

  Background:
    Given a repository with a backlog
    And an item "A" exists
    And an item "B" exists
    And an item "C" exists

  Scenario: the order survives a clone
    When another checkout runs `backlog update 3 --priority 0`
    Then the queue is 3, 1, 2
    And another checkout sees item 3 with status "pending"

  Scenario: a rank change rewrites no item
    Given I act as agent "ann"
    And I have read item 1
    And I have read item 2
    When another checkout runs `backlog update 3 --priority 0`
    And I run `backlog update 1 --status in_progress`
    Then the command succeeds
    And the queue is 3, 1, 2
    When I run `backlog update 2 --summary "after the move"`
    Then the command succeeds

  Scenario: a folder from an earlier release gets its index at the first use
    Given the order is kept in the items, as an earlier release did
    Then the queue is 3, 2, 1
    And the backlog repository has no uncommitted or unpushed change
    And the backlog has an index
    When I run `backlog update 3 --priority 2`
    Then the command succeeds
    And the queue is 2, 1, 3

  Scenario: two checkouts ranking different items from one base end with one dense order that keeps both placements
    Given the origin will receive another checkout's rank change of item 2 just before my push
    When I run `backlog update 3 --priority 0`
    Then the command succeeds
    And the queue is 3, 2, 1
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees 3 items
