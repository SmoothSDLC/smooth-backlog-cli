Feature: Agents - a coding agent asks for work, claims it, gets it reviewed and closes it
  Agents are named; a claim marks the item as theirs. An item an agent claims is refined: it names its review
  documents, an estimate and a definition of done. Two review stages precede the close: a first pass by a reviewer
  whose name starts with "cody" (or a team member), then a pass by "codex" or "claude" on the same commit.

  Background:
    Given a repository with a backlog
    And a refined item "Agent work" exists

  Scenario: pop tells an idle agent to claim the next item
    When I act as agent "alice"
    And I run `backlog pop --agent alice`
    Then the command succeeds
    And the output contains "001-agent-work"

  Scenario: an agent claims the next item and holds it
    When I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    Then the command succeeds
    And item 1 has claimed_by "alice"
    And item 1 has status "in_progress"

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
    And item 1 has claimed_by ""
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

  Scenario: the holder asks for a review and another agent reviews it
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    When I run `backlog update 1 --request-review cody-r --note "commit abc123"`
    Then the command succeeds
    And item 1 has review_state "requested"
    When I act as agent "cody-r"
    And I run `backlog update 1 --review pass --by cody-r --comments "looks right, see references/review/code.md"`
    Then the command succeeds
    And item 1 has review_state "passed"

  Scenario: the author cannot review its own work
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog update 1 --request-review any --note "commit abc123"`
    When I run `backlog update 1 --review pass --by alice --comments "fine, references/review/code.md"`
    Then the command fails
    And the output contains "cannot review its own work"

  Scenario: a changes verdict sends the item back to work
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog update 1 --request-review bob --note "commit abc123"`
    When I act as agent "bob"
    And I run `backlog update 1 --review changes --by bob --comments "missing tests, references/review/code.md"`
    Then the command succeeds
    And item 1 has review_state "changes-requested"

  Scenario: the holder closes the item after both review stages passed
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog update 1 --request-review cody-r --note "commit abc123"`
    And I act as agent "cody-r"
    And I run `backlog update 1 --review pass --by cody-r --comments "first stage, references/review/code.md"`
    When I act as agent "alice"
    And I have read item 1
    And I run `backlog update 1 --close --summary "delivered"`
    Then the command fails
    And the output contains "external review"
    When I run `backlog update 1 --request-review codex --note "commit abc123"`
    Then the command succeeds
    When I act as agent "codex"
    And I run `backlog update 1 --review pass --by codex --comments "second stage, references/review/code.md"`
    Then the command succeeds
    When I act as agent "alice"
    And I have read item 1
    And I run `backlog update 1 --close --summary "delivered"`
    Then the command succeeds
    And item 1 has status "done"

  Scenario: the holder records what it waits on
    Given I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    When I run `backlog update 1 --waiting "the CI run" --by alice`
    Then the command succeeds
    And item 1 has wait_on "the CI run"
    When I run `backlog update 1 --waiting-done --by alice`
    Then the command succeeds
    And item 1 has wait_on ""
