Feature: Agents - a coding agent asks for work, claims it and releases it
  Agents are named; a claim marks the item as theirs; another agent cannot take it; a write after somebody else's change needs a fresh read.
  Outside a team no review rule applies: the holder closes when it is done.

  Background:
    Given a repository with a backlog
    And an item "Agent work" exists

  Scenario: next shows an idle agent the item to claim
    When I act as agent "alice"
    And I run `backlog next`
    Then the command succeeds
    And the output contains "001-agent-work"

  Scenario: an agent claims the next item and holds it
    When I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    Then the command succeeds
    And item 1 has owner "alice"
    And item 1 has status "in progress"

  Scenario: another agent cannot take a claimed item
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    When I act as agent "bob"
    And I run `backlog update 1 --claim bob`
    Then the command fails
    And the output contains "claimed by alice"

  Scenario: the holder releases the item back into the queue
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    When I run `backlog update 1 --release alice`
    Then the command succeeds
    And item 1 has owner ""
    And item 1 has status "pending"

  Scenario: a stale view is refused - the agent reads the item again first
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I act as agent "bob"
    And I run `backlog update 1 --append "## Findings by bob"`
    When I act as agent "alice"
    And I run `backlog update 1 --append "## Findings by alice"`
    Then the command fails with exit code 5
    And the output contains "changed"
    When I have read item 1
    And I run `backlog update 1 --append "## Findings by alice"`
    Then the command succeeds
