Feature: Team - the lead takes its team's work item
  Teams, their members and leads, and their review rules are configuration of the backlog folder (teams.json): nothing
  about them is built into the CLI. A team session is bound by SMOOTH_BACKLOG_CLI_TEAM_NAME and SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY/SMOOTH_BACKLOG_CLI_TEAM_BRANCH; the caller is
  SMOOTH_BACKLOG_CLI_AGENT and acts only as itself.

  Background:
    Given a repository with a backlog
    And a team "t1" with lead "lead" and members "ann, bob"
    And a team "reviewers" with lead "rex" and members "rex, ria"
    And team "t1" work needs 1 pass by "t1" and 1 pass by "reviewers"
    And team "t1" refinements are reviewed by "reviewers"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_NAME is "t1"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_REPOSITORY is "this repository"
    And the environment SMOOTH_BACKLOG_CLI_TEAM_BRANCH is "main"
    And I act as agent "lead"
    And I run `backlog new --name "Parser work" --objective "o" --summary "s" --estimate 90 --complexity medium --body "## Definition of done\n- [ ] the parser parses the sample"`
    And I run `backlog team update 1 --set-team t1 --set-review-refs docs/review/code.md`

  Scenario: the lead takes its team's work item with team pop
    When I run `backlog team pop --team t1 --agent lead`
    Then the command succeeds
    And item 1 has owner "lead"
