Feature: Agents - a coding agent asks for work, claims it, gets it reviewed and closes it
  Agents are named; a claim marks the item as theirs; the holder may ask another agent for a review; the author never
  reviews its own work. Outside a team no review rule applies: the holder closes when it is done.

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
    And item 1 has owned_since ""
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
    Given a team "t1" with lead "lead" and members "alice, bob"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And I act as agent "lead"
    And I run `backlog team update 1 --set-review-refs docs/review/code.md --set-estimate 90 --set-complexity medium --set-depends-on none --append "## Definition of done\n- [ ] the work is done"`
    And I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    When I run `backlog team update 1 --request-review bob --note "commit abc123"`
    Then the command succeeds
    And item 1 has review_state "requested"
    When I act as agent "bob"
    And I run `backlog team update 1 --review pass --by bob --comments "looks right (docs/review/code.md)"`
    Then the command succeeds
    And item 1 has review_state "passed"

  Scenario: the author cannot review its own work
    Given a team "t1" with lead "lead" and members "alice, bob"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And I act as agent "lead"
    And I run `backlog team update 1 --set-review-refs docs/review/code.md --set-estimate 90 --set-complexity medium --set-depends-on none --append "## Definition of done\n- [ ] the work is done"`
    And I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog team update 1 --request-review any --note "commit abc123"`
    When I run `backlog team update 1 --review pass --by alice --comments "fine (docs/review/code.md)"`
    Then the command fails
    And the output contains "cannot review its own work"

  Scenario: a changes verdict sends the item back to work
    Given a team "t1" with lead "lead" and members "alice, bob"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And I act as agent "lead"
    And I run `backlog team update 1 --set-review-refs docs/review/code.md --set-estimate 90 --set-complexity medium --set-depends-on none --append "## Definition of done\n- [ ] the work is done"`
    And I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog team update 1 --request-review bob --note "commit abc123"`
    When I act as agent "bob"
    And I run `backlog team update 1 --review changes --by bob --comments "missing tests (docs/review/code.md)"`
    Then the command succeeds
    And item 1 has review_state "changes-requested"

  Scenario: the holder closes the reviewed item
    Given a team "t1" with lead "lead" and members "alice, bob"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And I act as agent "lead"
    And I run `backlog team update 1 --set-review-refs docs/review/code.md --set-estimate 90 --set-complexity medium --set-depends-on none --append "## Definition of done\n- [ ] the work is done"`
    And I act as agent "alice"
    And I run `backlog update 1 --claim alice`
    And I run `backlog team update 1 --request-review bob --note "commit abc123"`
    And I act as agent "bob"
    And I run `backlog team update 1 --review pass --by bob --comments "looks right (docs/review/code.md)"`
    When I act as agent "alice"
    And I have read item 1
    And I run `backlog update 1 --close --summary "delivered"`
    Then the command succeeds
    And item 1 has status "closed"

  Scenario: the holder records what it waits on
    Given a team "t1" with lead "lead" and members "alice, bob"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And I act as agent "lead"
    And I run `backlog team update 1 --set-review-refs docs/review/code.md --set-estimate 90 --set-complexity medium --set-depends-on none --append "## Definition of done\n- [ ] the work is done" --set-team t1 --status ready`
    And I act as agent "alice"
    And I run `backlog team update 1 --claim alice`
    Then the command succeeds
    When I run `backlog team update 1 --waiting "the CI run" --by alice`
    Then the command succeeds
    And item 1 has wait_on "the CI run"
    When I run `backlog team update 1 --waiting-done --by alice`
    Then the command succeeds
    And item 1 has wait_on ""
