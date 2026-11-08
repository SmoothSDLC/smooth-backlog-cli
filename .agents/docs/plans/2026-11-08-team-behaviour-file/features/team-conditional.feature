Feature: Conditional team doors - active once the owner question is answered
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-930 @S-930-1 @conditional @Q-06
  Scenario: A: the lead deletes a team item with a reason
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"new","refiner":""}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --delete "duplicate of 7"`
    Then the command succeeds
      And item 1 does not exist

  @REQ-932 @S-932-1 @conditional @Q-08
  Scenario: A: the lead abandons a refining item
    Given a repository with a backlog
      And the backlog registers the workflow "team" from the template "team.full.json"
      And a team "t1" with lead "lead" and members "ann, bob" using the workflow "team"
      And the environment TEAM_NAME is "t1"
      And an item "W" exists
      And item 1 has the front-matter fields `{"team":"t1","status":"refining","refiner":"ann","handoffs":"none"}`
      And I act as agent "lead"
      And I have read item 1
    When I run `backlog team update 1 --team t1 --abandon "out of scope"`
    Then item 1 has status "closed"
