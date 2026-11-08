Feature: User capabilities restored or defined after the impact analysis
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-920 @S-920-1
  Scenario: list branch shows another branch
    Given a repository with a backlog
      And an item "Here" exists
      And a branch "other" exists on the origin
      And I run `backlog move 1 --to-branch other`
    When I run `backlog list branch other --json`
    Then the command succeeds
      And the JSON output has 1 item

  @REQ-920 @S-920-2
  Scenario: next branch works from a detached HEAD
    Given a repository with a backlog
      And an item "Here" exists
      And HEAD is detached
    When I run `backlog next branch main`
    Then the command succeeds
      And the output contains "001-here"

  @REQ-921 @S-921-1
  Scenario: list branches shows archived and total
    Given a repository with a backlog
      And an item "A" exists
      And an item "B" exists
      And I run `backlog done 1`
      And I run `backlog archive 1`
    When I run `backlog list branches --json`
    Then the output contains "\"archived\": 1"
      And the output contains "\"total\": 2"

  @REQ-922 @S-922-1
  Scenario: import all brings finished items too
    Given a repository with a backlog
      And a branch "src" exists on the origin
      And an item "Open" exists
      And an item "Done" exists
      And I run `backlog done 2`
      And I run `backlog move 1 --to-branch src`
      And I run `backlog move 2 --to-branch src`
    When I run `backlog import all --branch src`
    Then the command succeeds
      And the output contains "imported 2 item(s)"

  @REQ-923 @S-923-1
  Scenario: three lines in one call
    Given a repository with a backlog
      And an item "S" exists
    When I run `backlog update 1 --section Tasks --add-line '["a","b","c"]'`
    Then item 1 body contains "- a\n- b\n- c"

  @REQ-924 @S-924-1
  Scenario: the skill copy follows the CLI version
    Given a repository with a backlog
      And the configuration key skill_version is `"0.0.1"`
    When I run `backlog list`
    Then the command succeeds
      And the output contains "skill copies refreshed for"

  @REQ-925 @S-925-1
  Scenario: not found is a refusal
    Given a repository with a backlog
    When I run `backlog show 999999`
    Then the command fails with exit code 1

  @REQ-925 @S-925-2
  Scenario: an unknown word is invalid input
    Given a repository with a backlog
    When I run `backlog list bogusword`
    Then the command fails with exit code 2

  @REQ-926 @S-926-1
  Scenario: a write on a detached HEAD
    Given a repository with a backlog
      And HEAD is detached
    When I run `backlog new --name x --objective o --summary s`
    Then the command fails with exit code 2
      And the output contains "HEAD is detached: check out a branch"

  @REQ-927 @S-927-1
  Scenario: list blocked shows dependency waits
    Given a repository with a backlog
      And an item "A" exists
      And an item "B" exists
      And I run `backlog update 2 --set-depends-on 1`
    When I run `backlog list blocked`
    Then the output contains "002-b"
      And the output contains "waits on"

  @REQ-940 @S-940-1
  Scenario: new --ask needs a terminal
    Given a repository with a backlog
    When I run `backlog new --ask`
    Then the command fails with exit code 2
      And the output contains "--ask needs a terminal"
