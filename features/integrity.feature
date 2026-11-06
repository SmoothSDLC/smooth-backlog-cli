Feature: Integrity - every interaction updates from the origin first, publishes after, and rejects stale writes
  The backlog is a git repository. Before any command reads or writes, the repository holding the items is updated
  from its origin; after any change it is pushed; a push the origin rejects is retried; a write to an item that
  someone else changed since this agent last read it is rejected and the current content is shown. The same in
  both storage locations.

  Background:
    Given a repository with a backlog
    And an item "Shared" exists

  Scenario: a read sees a change published from another checkout without any manual step
    When another checkout runs `backlog update 1 --summary "changed elsewhere"`
    And I run `backlog query --phase 1 --json`
    Then the command succeeds
    And item 1 has summary "changed elsewhere"

  Scenario: a change is published before the command exits
    When I run `backlog update 1 --status in_progress`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees item 1 with status "in progress"

  Scenario: a write on a stale view is rejected and the current content is shown
    Given I act as agent "ann"
    And I have read item 1
    When another checkout runs `backlog update 1 --summary "newer summary" --by bob`
    And I run `backlog update 1 --status in_progress`
    Then the command fails with exit code 5
    And the output contains "was changed by"
    And the output contains "newer summary"
    And the output does not contain "phases/"
    And item 1 has status "pending"
    And item 1 has summary "newer summary"

  Scenario: an item claimed in another checkout cannot be claimed here
    When another checkout runs `backlog update 1 --claim bob`
    And I run `backlog update 1 --claim ann`
    Then the command fails with exit code 1
    And the output contains "bob"
    And item 1 has owner "bob"

  Scenario: the loser of a push race retries and publishes
    Given the origin will receive another checkout's change just before my push
    When I run `backlog new --name "Racing" --objective "o" --summary "s"`
    Then the command succeeds
    And the backlog repository has no uncommitted or unpushed change
    And another checkout sees 2 items
