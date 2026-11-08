Feature: Commands - the commands of their own (done, clean, import, archive done, list words, upgrade) and the first-release spellings that are gone
  Background:
    Given a repository with a backlog

  Scenario: new creates an item with an objective and a status
    When I run `backlog new --name "Fix the login" --objective "users land on their page" --status "in progress"`
    Then the command succeeds
    And item 1 has name "Fix the login"
    And item 1 has objective "users land on their page"
    And item 1 has status "in progress"

  Scenario: update, done and the priority change the item
    Given an item "One" exists
    And an item "Two" exists
    When I run `backlog update 2 --name "Two renamed"`
    Then item 2 has name "Two renamed"
    When I run `backlog update 2 --priority 0`
    Then the queue is 2, 1
    When I run `backlog done 2`
    Then item 2 has status "closed"

  Scenario: list filters the queue
    Given an item "Open one" exists
    And an item "Done one" exists
    And I run `backlog done 2`
    When I run `backlog list done`
    Then the command succeeds
    And the output contains "002-done-one"
    And the output does not contain "001-open-one"
    When I run `backlog list open`
    Then the output contains "001-open-one"
    And the output does not contain "002-done-one"

  Scenario: list branches lists the branches with counts
    Given an item "On main" exists
    When I run `backlog list branches`
    Then the command succeeds
    And the output contains "main  open 1  done 0"

  Scenario: move takes the branch with --to-branch
    Given an item "Mover" exists
    And a branch "release" exists on the origin
    When I run `backlog move 1 --to-branch release`
    Then the command succeeds
    And the queue is empty

  Scenario: the spellings of the first release are not commands and change nothing
    Given an item "Kept" exists
    When I run `backlog init`
    Then the command fails with exit code 2
    And the output contains "init is not a backlog command"
    When I run `backlog init clean`
    Then the command fails with exit code 2
    And the output contains "is not a backlog command"
    When I run `backlog 1 done`
    Then the command fails with exit code 2
    When I run `backlog set 1 name Other`
    Then the command fails with exit code 2
    When I run `backlog branch`
    Then the command fails with exit code 2
    When I run `backlog list branch`
    Then the command fails with exit code 2
    And the output contains "unrecognized arguments: branch"
    When I run `backlog move 1 release`
    Then the command fails with exit code 2
    And item 1 has name "Kept"
    And item 1 has status "pending"
    And the queue is 1

  Scenario: the headless switch and the question switch are unknown options
    Given an item "Quiet" exists
    When I run `backlog list --headless`
    Then the command fails with exit code 2
    And the output contains "unrecognized arguments: --headless"
    When I run `backlog new --name "Asked" --ask`
    Then the command fails with exit code 2
    And the queue is 1

  Scenario: next --agent is an unknown option; the next action of an agent is backlog team pop
    When I run `backlog next --agent ada`
    Then the command fails with exit code 2
    And the output contains "unrecognized arguments: --agent"

  Scenario: update with nothing named prints its help and installs nothing
    Given an item "Kept" exists
    When I run `backlog update`
    Then the command fails with exit code 2
    And the output contains "backlog update — change the fields of one item"
    And the output contains "backlog upgrade"
    And the queue is 1

  Scenario: clean asks first and changes nothing without a yes
    Given an item "Kept" exists
    When I run `backlog clean` and answer "no"
    Then the command fails with exit code 2
    And the output contains "This will remove every backlog item of"
    And the queue is 1
    When I run `backlog clean`
    Then the command fails with exit code 2
    And the queue is 1

  Scenario: clean empties the current branch's backlog as one published change
    Given an item "Gone" exists
    And an item "Gone too" exists
    When I run `backlog clean` and answer "yes"
    Then the command succeeds
    And the output contains "2 items removed"
    And the queue is empty
    And the backlog repository has no uncommitted or unpushed change

  Scenario: clean leaves the items of the other branches alone
    Given an item "Mine" exists
    And an item "Theirs" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 --to-branch feature`
    When I run `backlog clean` and answer "yes"
    Then the command succeeds
    And the output contains "1 items removed from branch main"
    And the queue is empty
    When I run `backlog list branches`
    Then the output contains "feature  open 1"

  Scenario: clean all-branches empties every branch of the repository
    Given an item "Mine" exists
    And an item "Theirs" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 --to-branch feature`
    When I run `backlog clean all-branches` and answer "yes"
    Then the command succeeds
    And the output contains "2 items removed from every branch"
    When I run `backlog list branches`
    Then the output does not contain "feature"

  Scenario: clean refuses a word it does not know
    When I run `backlog clean everything` and answer "yes"
    Then the command fails with exit code 2
    And the output contains "unrecognized arguments: everything"


  Scenario: import brings the open items of another branch here, after the ones already queued
    Given an item "Mine" exists
    And an item "Theirs one" exists
    And an item "Theirs two" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 --to-branch feature`
    And I run `backlog move 3 --to-branch feature`
    When I run `backlog import --branch feature`
    Then the command succeeds
    And the output contains "imported 2 open item(s) of feature"
    And the queue is 1, 2, 3
    And item 2 has branch "main"

  Scenario: import --higher puts the imported items first, in their original order
    Given an item "Mine" exists
    And an item "Theirs one" exists
    And an item "Theirs two" exists
    And a branch "feature" exists on the origin
    And I run `backlog move 2 --to-branch feature`
    And I run `backlog move 3 --to-branch feature`
    When I run `backlog import --branch feature --higher`
    Then the command succeeds
    And the queue is 2, 3, 1

  Scenario: import leaves finished items and an empty branch alone
    Given an item "Mine" exists
    And an item "Theirs" exists
    And a branch "feature" exists on the origin
    And I run `backlog done 2`
    And I run `backlog move 2 --to-branch feature`
    When I run `backlog import --branch feature`
    Then the command succeeds
    And the output contains "nothing to import"
    And the queue is 1
    When I run `backlog import --branch nosuchbranch`
    Then the command succeeds
    And the output contains "check the name"
    When I run `backlog import --branch main`
    Then the command fails with exit code 2
    And the output contains "that is the current branch"

  Scenario: archive done archives every finished item and leaves the open ones
    Given an item "One" exists
    And an item "Two" exists
    And an item "Three" exists
    And I run `backlog done 1`
    And I run `backlog done 2`
    When I run `backlog archive done`
    Then the command succeeds
    And the output contains "archived 2 finished item(s): 001-one, 002-two"
    And the queue is 3
    When I run `backlog list archive`
    Then the output contains "001-one"
    When I run `backlog archive done`
    Then the command succeeds
    And the output contains "nothing to archive"

