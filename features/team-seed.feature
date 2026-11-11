Feature: Team seeding - the seeded items follow the team file the scenario wrote and may be added at any point of a scenario

  Scenario: an item of a team named by its template file takes the first status of that team
    Given a repository with a backlog
    And a team file from the template "extreme-programming"
    And a ready item "Login" for the team "extreme-programming"
    Then item 1 has status "story"
    And item 1 has team "xp"

  Scenario: an item of a team named by its name inside the template
    Given a repository with a backlog
    And a team file from the template "single-agent"
    And a ready item "Notes" for the team "solo"
    Then item 1 has status "todo"
    And item 1 has estimate 20

  Scenario: a second item is seeded after a command without losing the first claim
    Given a repository with a backlog
    And a team file from the template "parallel"
    And a ready item "Tokens" for the team "parallel"
    When I act as agent "member-1"
    And I run `backlog team pop --team parallel`
    Then the command succeeds
    Given a ready item "Parser" for the team "parallel"
    Then the command succeeds
    And item 1 has holder "member-1"
    And item 2 has status "ready"
