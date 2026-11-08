Feature: User flow - the user commands refuse nothing; their default words are defaults only
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-908 @S-908-1
  Scenario: a word outside the defaults is listed in the whole stack and in open
    Given a repository with a backlog
      And I run `backlog new --name a`
      And I run `backlog update 1 --status shipped`
    When I run `backlog list open`
    Then the command succeeds
      And the output contains "shipped"

  @REQ-908 @S-908-2
  Scenario: a word outside the defaults is not in list done
    Given a repository with a backlog
      And I run `backlog new --name a`
      And I run `backlog update 1 --status shipped`
    When I run `backlog list done`
    Then the command succeeds
      And the output does not contain "001-a"

  @REQ-908 @S-908-3
  Scenario: archive never refuses because of the status
    Given a repository with a backlog
      And I run `backlog new --name a`
      And I run `backlog update 1 --status shipped`
    When I run `backlog archive 1`
    Then the command succeeds

  @REQ-908 @S-908-4
  Scenario: a typed word is stored as typed
    Given a repository with a backlog
      And I run `backlog new --name a`
    When I run `backlog update 1 --status Done`
    Then the command succeeds
      And item 1 has status "Done"

  @REQ-909 @S-909-1
  Scenario: a claim of a held item takes it over
    Given a repository with a backlog
      And I run `backlog new --name a`
      And I run `backlog update 1 --claim alice`
    When I run `backlog update 1 --claim bob`
    Then the command succeeds
      And item 1 has owner "bob"

  @REQ-909 @S-909-2
  Scenario: a close needs no summary
    Given a repository with a backlog
      And I run `backlog new --name a`
    When I run `backlog update 1 --close`
    Then the command succeeds
      And item 1 has status "closed"

  @REQ-910 @S-910-1
  Scenario: no limit applies to items outside a team
    Given a repository with a backlog
      And I run `backlog new --name a --status "in progress"`
      And I run `backlog new --name b`
    When I run `backlog update 2 --status "in progress"`
    Then the command succeeds

  @REQ-912 @S-912-1 @conditional @Q-05
  Scenario: A: a fourth refinement rejection is accepted
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refinement review","refiner":"ann","refinement_reviews":["a reject x: 1","b reject x: 2","c reject x: 3"]}`
      And I act as agent "rex"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --refinement-review reject --comments again`
    Then item 1 has status "refining"

  @REQ-933 @S-933-1 @conditional @Q-09
  Scenario: B: update --ask is unknown
    Given a repository with a backlog
      And an item "P" exists
    When I run `backlog update 1 --ask`
    Then the command fails with exit code 2

  @REQ-934 @S-934-1 @conditional @Q-10
  Scenario: B: list --json is the raw payload
    Given a repository with a backlog
    When I run `backlog list --json`
    Then the output does not contain "\"ok\""

  @REQ-935 @S-935-1 @conditional @Q-11
  Scenario: A: a refusal as a JSON error
    Given a repository with a backlog
    When I run `backlog show 999999 --json`
    Then the command fails with exit code 1
      And the output contains "\"code\": \"NOT_FOUND\""

  @REQ-936 @S-936-1 @conditional @Q-12
  Scenario: A: BACKLOG_CLI_BRANCH has no effect
    Given a repository with a backlog
      And HEAD is detached
      And the environment BACKLOG_CLI_BRANCH is "main"
    When I run `backlog list`
    Then the command fails with exit code 2

  @REQ-937 @S-937-1 @conditional @Q-13
  Scenario: A: P0 names the next item
    Given a repository with a backlog
      And an item "A" exists
      And an item "B" exists
      And I run `backlog update 2 --priority 0`
    When I run `backlog show P0 --json`
    Then the output contains "002-b"

  @REQ-938 @S-938-1 @conditional @Q-14
  Scenario: B: an item without events says so
    Given a repository with a backlog
      And an item "A" exists
      And item 1 has no recorded events
    When I run `backlog history 1`
    Then the output contains "no history recorded for 001-a"
