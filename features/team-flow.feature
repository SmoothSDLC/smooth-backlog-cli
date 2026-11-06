Feature: Team flow - an item moves along one ordered list of status words, and a review verdict is complete or reject
  A team's item carries one status word. The team steps move it along the order; the team's entry in the backlog
  configuration decides which review stages apply. A reject sends the item back to work and keeps the finding.

  Background:
    Given a repository with a backlog
    And a team "t1" with lead "lead" and members "ann, bob"
    And team "t1" reviews in the stages "peer, external"
    And team "t1" has the external reviewers "xia"
    And the environment TEAM_NAME is "t1"
    And the environment TEAM_REPOSITORY is "acme/demo"
    And the environment TEAM_BRANCH is "main"
    And I act as agent "lead"
    And I run `backlog new --name "Parser work" --objective "o" --summary "s" --review-refs docs/review/code.md --estimate 90 --complexity medium --body "## Definition of done\n- [ ] the parser parses the sample"`
    And I run `backlog update 1 --set-team t1`

  Scenario: an item walks from new to closed through the stages of its team
    Given I run `backlog update 1 --claim lead`
    And I run `backlog new --name "Parser child" --split-from 1`
    Then item 2 has status "new"
    When I act as agent "ann"
    And I have read item 2
    And I run `backlog update 2 --refine-start --by ann`
    Then item 2 has status "refining"
    When I run `backlog update 2 --set-review-refs docs/review/code.md --set-estimate 30 --set-complexity low --set-depends-on none --append "## Definition of done\n- [ ] the parser reads the sample"`
    And I run `backlog update 2 --refine-done --by ann --note "refined"`
    Then item 2 has status "refined"
    When I act as agent "lead"
    And I have read item 2
    And I run `backlog update 2 --request-refinement-review --by lead`
    Then item 2 has status "refinement review"
    When I run `backlog update 2 --refinement-review complete --by rex --comments "ok"`
    Then item 2 has status "ready"
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog update 2 --claim bob`
    Then item 2 has status "in progress"
    When I run `backlog update 2 --request-review any --note "commit abc123"`
    Then item 2 has status "ready for review"
    When I act as agent "ann"
    And I have read item 2
    And I run `backlog update 2 --review complete --by ann --comments "docs/review/code.md: fine"`
    Then item 2 has status "ready for external review"
    When I act as agent "xia"
    And I have read item 2
    And I run `backlog update 2 --review complete --by xia --comments "docs/review/code.md: fine"`
    Then item 2 has status "review complete"
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog update 2 --close --summary "delivered"`
    Then item 2 has status "closed"

  Scenario: a reject at each review stage sends the item back to work and keeps the finding
    Given I run `backlog update 1 --claim lead`
    And I run `backlog new --name "Parser child" --split-from 1`
    When I act as agent "ann"
    And I have read item 2
    And I run `backlog update 2 --refine-start --by ann`
    And I run `backlog update 2 --set-review-refs docs/review/code.md --set-estimate 30 --set-complexity low --set-depends-on none --append "## Definition of done\n- [ ] the parser reads the sample"`
    And I run `backlog update 2 --refine-done --by ann --note "refined"`
    And I act as agent "lead"
    And I have read item 2
    And I run `backlog update 2 --request-refinement-review --by lead`
    And I run `backlog update 2 --refinement-review complete --by rex --comments "ok"`
    And I act as agent "bob"
    And I have read item 2
    And I run `backlog update 2 --claim bob`
    And I run `backlog update 2 --request-review any --note "commit abc123"`
    And I act as agent "ann"
    And I have read item 2
    And I run `backlog update 2 --review reject --by ann --comments "docs/review/code.md: the empty input fails"`
    Then item 2 has status "in progress"
    When I act as agent "bob"
    And I have read item 2
    And I run `backlog update 2 --request-review any --note "commit abd456" --by bob`
    And I act as agent "ann"
    And I have read item 2
    And I run `backlog update 2 --review complete --by ann --comments "docs/review/code.md: fine now"`
    And I act as agent "xia"
    And I have read item 2
    And I run `backlog update 2 --review reject --by xia --comments "docs/review/code.md: the log line is missing"`
    Then item 2 has status "in progress"
