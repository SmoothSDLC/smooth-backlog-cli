Feature: Validator - every input of the team files is checked with an exact message
  Scenarios of 03-spec.md; each carries its requirement id and scenario id as tags (see 04-bdd.md).

  @REQ-013 @REQ-012
  Scenario Outline: <id> a behaviour definition with <rule> is refused with its exact message
    Given a repository with a backlog
    And a definition file "def.json" from the template "team.full.json" with `<patch>`
    When I run `backlog team validate --file def.json`
    Then the command fails with exit code 2
    And the output contains "<message>"

    Examples:
      | id | rule | patch | message |
      | S-013-1 | structural: wrong schema | schema = "backlog-team-behaviour/1" | def.json: schema: must be "backlog-team-behaviour/2" |
      | S-013-2 | structural: missing key | statuses = <delete> | def.json: missing key statuses |
      | S-013-3 | structural: unknown key | colour = "blue" | def.json: colour: not a key of this object |
      | S-013-4 | structural: pattern | workflow = "Team" | def.json: workflow: must match |
      | S-013-5 | structural: distinct | finished = ["closed","closed","archived"] | def.json: finished: entries must be distinct |
      | S-013-6 | structural: enum | steps.claim.actor = "agent" | def.json: steps.claim.actor: must be one of by, by_or_holder, flag_value, by_or_flag_value |
      | S-013-7 | structural: minimum | review.stale_after_seconds = 0 | def.json: review.stale_after_seconds: must be at least 1 |
      | S-013-8 | structural: step name | steps.Finish = {"value":"none","from":["*"],"to":"closed","by":["lead"]} | def.json: steps.Finish (name): must match ^[a-z][a-z0-9-]{0,39}$ |
      | S-013-9 | V-01 initial | initial = "draft" | def.json: initial: draft is not one of statuses |
      | S-013-10 | V-02 finished | finished = ["gone","archived"] | def.json: finished: gone is not one of statuses |
      | S-013-12 | V-04 side word | side_statuses = {"ready":{"enter":"request-decision","leave":"decision","returns_to":"refining"}} | def.json: side_statuses: ready is also one of statuses |
      | S-013-13 | V-05 returns_to | side_statuses.awaiting decision.returns_to = "limbo" | def.json: side_statuses.awaiting decision.returns_to: limbo is not one of statuses |
      | S-013-14 | V-06 enter step | steps.request-decision = <delete> | def.json: side_statuses.awaiting decision.enter: request-decision is not defined in steps |
      | S-013-15 | V-07 unknown word | steps.claim.from = ["readyy"] | def.json: steps.claim.from: readyy is no status of this workflow |
      | S-013-16 | V-08 star alone | steps.claim.from = ["*","ready"] | def.json: steps.claim.from: "*" must be the only entry |
      | S-013-17 | V-09 unknown role | steps.claim.by = ["captain"] | def.json: steps.claim.by: role captain is not defined in roles |
      | S-013-18 | V-10 union cycle | roles.a = {"union":["b","lead"]} ; roles.b = {"union":["a","lead"]} | def.json: roles.a: union cycle through b |
      | S-013-19 | V-11 missing refusal | steps.claim.requires.2.refusal = "nope" | def.json: steps.claim.requires[2].refusal: text nope is not in refusals or instructions |
      | S-013-20 | V-12 placeholder | refusals.limit = "<item> <who_knows>" | def.json: refusals.limit: placeholder <who_knows> is unknown |
      | S-013-21 | V-13 stage | steps.review.stages.qa = {"from":["reviewing"],"by":["anyone"]} | def.json: steps.review.stages.qa: stage is not in review.stages_order |
      | S-013-22 | V-14 no to | steps.waiting.to = <delete> | def.json: steps.waiting: needs to, to_rules, verdicts or stages |
      | S-013-23 | V-15 verdict word | steps.review.verdict_words.ok = "accept" | def.json: steps.review.verdict_words.ok: accept is not a verdict of the step |
      | S-013-24 | V-16 regex group | identity.same_worker_pattern = "^.+:\\d+$" | def.json: identity.same_worker_pattern: needs exactly one capture group |
      | S-013-25 | V-17 reachability | steps.close = <delete> | def.json: no chain of steps leads from review complete to a finished word |
      | S-013-26 | V-18 stage words | review.stages.peer.ready = "waiting" | def.json: review.stages.peer.ready: waiting is no status of this workflow |
      | S-013-27 | V-19 defaults | defaults.review = [{"stage":"qa","count":1}] | def.json: defaults.review[0].stage: qa is not in review.stages_order |
      | S-013-28 | V-20 waiting steps | waiting.cleared_by_steps = ["ship"] | def.json: waiting.cleared_by_steps[0]: ship is not defined in steps |
      | S-013-29 | V-21 mark step | queue.roles.member.offers.7.mark = "waiting" | def.json: queue.roles.member.offers[7].mark: waiting is not defined in steps |
      | S-013-30 | V-22 user refusal | user_commands.clean = {"allow":false} | def.json: user_commands.clean: allow false needs refusal |
      | S-013-31 | V-23 limits level | limits.levels = ["overall"] | def.json: steps.claim.requires[5].within_limits: level repository is not in limits.levels |
      | S-013-32 | V-24 two test keys | steps.claim.requires.0.field_empty = "x" | def.json: steps.claim.requires[0]: a condition has exactly one test key (found status_not_in, field_empty) |
      | S-013-33 | V-25 completeness | completeness = [] | def.json: steps.refine-done.requires[0]: complete needs completeness rules |
      | S-013-34 | V-26 section test | completeness.3.section = <delete> | def.json: completeness[3]: test section needs section |
      | S-013-35 | V-27 binding step without to | steps.set-team.to_rules = <delete> | def.json: steps.set-team: a binding step needs to or to_rules |
      | S-013-36 | V-28 value source | steps.claim.sets.claimed_by = "me" | def.json: steps.claim.sets.claimed_by: me is no value source |
      | S-013-37 | V-28 status in sets | steps.claim.sets.status = "actor" | def.json: steps.claim.sets.status: the status is set by to |
      | S-013-38 | V-29 required refusal | refusals.one_step = <delete> | def.json: refusals: missing key one_step |
      | S-013-39 | V-31 machinery text | refusals.dep_status = <delete> | def.json: refusals: missing key dep_status (required by the features it uses) |
      | S-013-40 | V-32 key twice | instructions.limit = "x" | def.json: instructions.limit: also a key of refusals |
      | S-013-41 | V-33 role order | queue.role_order = <delete> | def.json: queue: role_order is required when queue.roles has more than one key |
      | S-013-42 | V-34 flag_value target | steps.waiting.to = "flag_value" | def.json: steps.waiting.to: flag_value needs value word |
      | S-013-43 | V-35 verdict value | steps.close.value = "verdict" | def.json: steps.close.value: verdict needs verdicts |
      | S-013-44 | V-36 when_empty | roles.lead = {"entry_person":"lead","when_empty":"anyone"} | def.json: roles.lead.when_empty: needs entry_rule_teams |
      | S-013-45 | V-37 undefined step text | undefined_step_refusals.claim = "status_flag" | def.json: undefined_step_refusals.claim: claim is defined in steps |
      | S-013-46 | V-38 stages keys | review.stages.qa = {"ready":"ready","active":"reviewing","reviewers":"team","default_count":1} | def.json: review.stages: keys must equal review.stages_order |
      | S-013-47 | V-39 actorless context | views.decisions.select = {"actor_has_role":"lead"} | def.json: views.decisions.select: actor_has_role needs an actor and is not allowed in views |
      | S-013-48 | V-40 condition without refusal | steps.claim.requires.2.refusal = <delete> | def.json: steps.claim.requires[2]: a condition needs refusal |
      | S-013-51 | V-30 stale time | review.stale_after_seconds = <delete> | def.json: queue.roles.lead.offers[2].select: stale needs review.stale_after_seconds |

  @REQ-013 @REQ-010
  Scenario Outline: <id> a team definition with <rule> is refused with its exact message
    Given a repository with a backlog
    And the backlog registers the workflow "team" from the template "team.full.json"
    And the backlog registers the workflow "minimal" from the template "minimal.json"
    And a file "team.json" outside the backlog contains `<json>`
    When I run `backlog team validate --file team.json`
    Then the command fails with exit code 2
    And the output contains "<message>"

    Examples:
      | id | rule | json | message |
      | S-013-52 | E-01 workflow | {"schema":"backlog-team-definition/2","name":"t9","workflow":"ghost","people":{"lead":"a"},"lists":{"members":["b"]}} | team.json: workflow: ghost is not registered in workflows.json |
      | S-013-53 | E-02 disjoint (entry_constraints) | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"b"},"lists":{"members":["b"]}} | team.json: lead and members must not share a name (b) |
      | S-013-54 | E-03 subset (entry_constraints) | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"],"review_only":["z"]}} | team.json: lists.review_only: z is not in members |
      | S-013-55 | E-04 stage | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"review":[{"stage":"qa","count":1}]} | team.json: review[0].stage: qa is no stage of workflow team (peer, external) |
      | S-013-56 | E-05 stage twice | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"review":[{"stage":"peer","count":1},{"stage":"peer","count":2}]} | team.json: review: a stage is listed twice |
      | S-013-57 | E-06 rule team | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"review":[{"stage":"peer","count":1,"team":"ghost"}]} | team.json: review[0].team: ghost is not configured |
      | S-013-58 | E-07 no reviewer (explicit list) | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"review":[{"stage":"external","count":1}]} | team.json: review[0]: no reviewer can pass stage external (external is empty) |
      | S-013-59 | E-08 rule team | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"rules":{"refinement_review":[{"team":"ghost","count":1}]}} | team.json: rules.refinement_review[0].team: ghost is not configured |
      | S-013-60 | E-09 entry key | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"captain":"a"},"lists":{"members":["b"]}} | team.json: people: workflow team needs entry key lead |
      | S-013-61 | E-10 limit level | {"schema":"backlog-team-definition/2","name":"t9","workflow":"minimal","people":{"lead":"a"},"lists":{"members":["b"]},"limits":{"team":2}} | team.json: limits.team: level team is not in the limits.levels of workflow minimal |
      | S-013-62 | structural entry | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]},"limits":{"agent":1}} | team.json: limits.agent: not a key of this object |

  @REQ-013 @REQ-012
  Scenario Outline: <id> a behaviour definition with <rule> is accepted
    Given a repository with a backlog
    And a definition file "def.json" from the template "team.full.json" with `<patch>`
    When I run `backlog team validate --file def.json`
    Then the command succeeds
    And the output contains "<message>"

    Examples:
      | id | rule | patch | message |
      | S-013-11 | V-03 (removed by D-26) a definition without archived is valid | finished = ["closed"] ; statuses = ["new","refining","refined","refinement review","ready","in progress","ready for review","reviewing","ready for external review","external review","review complete","closed"] | def.json: valid |
      | S-013-49 | V-40 fixed-text condition alone | steps.close.requires.4 = {"review_passes_met":{"passes_field":"reviews","commit_field":"work_commit"}} | def.json: valid |
      | S-013-50 | structural: registry key with colon | workflow = "example:team" | def.json: valid |

  @REQ-013 @REQ-010
  Scenario Outline: <id> a team definition with <rule> is accepted
    Given a repository with a backlog
    And the backlog registers the workflow "team" from the template "team.full.json"
    And the backlog registers the workflow "minimal" from the template "minimal.json"
    And a file "team.json" outside the backlog contains `<json>`
    When I run `backlog team validate --file team.json`
    Then the command succeeds
    And the output contains "<message>"

    Examples:
      | id | rule | json | message |
      | S-013-63 | E-07 not applied to the default | {"schema":"backlog-team-definition/2","name":"t9","workflow":"team","people":{"lead":"a"},"lists":{"members":["b"]}} | team.json: valid |
