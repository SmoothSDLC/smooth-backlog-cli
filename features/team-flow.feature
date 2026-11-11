Feature: Team flow - an item goes from a ready state to closed through a claim, a hand-off, a check by another member and the holder's close
  The parallel template: the holder hands the work to the check with a note, another member checks it, and the holder closes the item that passed.

  Background:
    Given a repository with a backlog
    And a team file from the template "parallel"
    And a ready item "Tokens" for the team "parallel"

  Scenario: a member takes an item, hands it over, another member checks it and the holder closes it
    When I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    Then the command succeeds
    When I run `backlog team update 1 hand-to-check --team parallel --note "tokens done, run the unit tests"`
    Then the command succeeds
    When I act as agent "member-2"
    And I run `backlog team pop --team parallel`
    Then the command succeeds
    And the output contains "start-check 001-tokens"
    When I run `backlog team update 1 check --team parallel --verdict pass --comments "reads well"`
    Then the command succeeds
    When I act as agent "member-1"
    And I run `backlog team update 1 close --team parallel`
    Then the command succeeds
    And the output contains "✅ 001-tokens: close (rule close)"
    And the output contains "status: passed -> closed"

  Scenario: the holder cannot check the own work
    Given I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    And I run `backlog team update 1 hand-to-check --team parallel --note "done"`
    When I run `backlog team update 1 start-check --team parallel`
    Then the command fails
    And the output contains "member-1 cannot check its own work"

  Scenario: a rejected check returns the item to its holder
    Given I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    And I run `backlog team update 1 hand-to-check --team parallel --note "done"`
    And I act as agent "member-2"
    And I run `backlog team pop --team parallel`
    When I run `backlog team update 1 check --team parallel --verdict reject --comments "a case is missing"`
    Then the command succeeds
    And the output contains "rule check-reject"
    And the output contains "status: checking -> in progress"
    And the output contains "rounds: 0 -> 1"

  Scenario: an item that did not pass is not closed
    Given I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    When I run `backlog team update 1 close --team parallel`
    Then the command fails
    And the output contains "❌"

  Scenario: two seeded items get distinct numbers
    Given a ready item "Parser" for the team "parallel"
    When I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    Then the output contains "claim 001-tokens"
    When I act as agent "member-2"
    And I run `backlog team pop --team parallel`
    Then the output contains "claim 002-parser"
