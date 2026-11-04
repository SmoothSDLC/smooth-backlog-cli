Feature: Legacy - the commands of the released 1.x CLI
  The released CLI (init, list, set, add, done, priority, import, branch, replace, remove, update <version>) keeps
  item records in a JSON manifest. These scenarios record that workflow as it is documented today, so that its fate
  (keep as aliases of the one command set, or remove) is decided on evidence.

  Background:
    Given a repository with a backlog

  Scenario: init, new, list, set, done
    When I run `backlog init demo`
    Then the command succeeds
    When I run `backlog new "Fix login" --description "redirect" --ac "lands on page"`
    Then the command succeeds
    When I run `backlog list`
    Then the command succeeds
    And the output contains "Fix login"
    When I run `backlog set 0 name "Fix login redirect"`
    Then the command succeeds
    When I run `backlog 0 done`
    Then the command succeeds
    When I run `backlog list done`
    Then the output contains "Fix login redirect"
