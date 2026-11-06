Feature: Plain use - a person or a single agent uses the backlog without a team process
  No team, no review documents, no estimate: a person records work and finishes it. These scenarios fail on the
  branch under review because team-process rules are applied to every item; they record the simple behaviour the
  one-mode CLI is expected to offer and await the owner's decision (see REVIEW.md).

  Background:
    Given a repository with a backlog

  Scenario: an item without dependencies needs no dependency flag
    When I run `backlog new --name "Plain item" --objective "o" --summary "s"`
    Then the command succeeds
    And item 1 has name "Plain item"

  Scenario: a person finishes their own item
    Given an item "Finish me" exists
    When I run `backlog update 1 --status done`
    Then the command succeeds
    And item 1 has status "closed"
    And the queue is empty

  Scenario: a person closes their own item with a summary
    Given an item "Close me" exists
    When I run `backlog update 1 --close --summary "delivered the redirect"`
    Then the command succeeds
    And item 1 has status "closed"
    And item 1 body contains "delivered the redirect"

  Scenario: archive a finished item
    Given an item "Archive me" exists
    And I run `backlog update 1 --status done`
    When I run `backlog archive 1`
    Then the command succeeds
    And item 1 has status "archived"

  Scenario: a single agent claims a plain item, works it and closes it
    Given an item "Plain agent work" exists
    When I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    Then the command succeeds
    And item 1 has owner "alice"
    When I run `backlog update 1 --close --summary "delivered"`
    Then the command succeeds
    And item 1 has status "closed"

  Scenario: finishing a plain item closes the gap in the queue
    Given an item "A" exists
    And an item "B" exists
    When I run `backlog update 1 --status done`
    Then the command succeeds
    And the queue is 2
    And item 2 has priority 0
