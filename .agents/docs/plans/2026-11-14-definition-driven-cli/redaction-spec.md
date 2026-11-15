# Redaction: specification

The specification of redaction. Schema: [redaction.schema.json](redaction.schema.json). Packaged default rules: [default-redaction.json](default-redaction.json). Example of a repository's configuration: [redaction.example.json](redaction.example.json). Constraints C-39 and C-40 of [behaviour-spec.md](behaviour-spec.md) apply.

## 1. What redaction is for

Items are committed and pushed to a git repository that other people can read. Redaction keeps personal data and secrets out of the stored items. It is applied by the CLI to every change, for user commands and team commands alike, and does not depend on a team.

## 2. Redaction rules

A redaction rule is a JSON object (schema `$defs/rule`):

| Key | Required | Meaning |
|---|---|---|
| `id` | no | Used only by validation to name the rule. |
| `description` | no | What the rule hides, in words. |
| `find` | yes | A regular expression in RE2 syntax, matched in linear time by the `re2` package. |
| `replace` | yes | The text put in place of each match; `$1`, `$2`, ... insert groups of the match. |
| `properties` | no | The item properties the rule applies to. Absent: every text property of the item and every text inside a list. |
| `applies` | no | `always`: applied even when `redact_pii` is false; `when-enabled` (the default): only when `redact_pii` is true. |

## 3. Where the rules come from

1. The packaged default rules, [default-redaction.json](default-redaction.json): credentials in addresses, private keys, bearer tokens, GitHub tokens and AWS access keys (`always`), and e-mail addresses, international telephone numbers and IPv4 addresses (`when-enabled`).
2. The repository's own rules: the key `redaction_rules` of `.backlog/config.json`, in the same form.
3. The switch: the key `redact_pii` of `.backlog/config.json`, false by default.

The rules in force for a command are the packaged ones followed by the repository's, keeping those marked `always` and, when `redact_pii` is true, also those marked `when-enabled`.

## 4. When the rules are evaluated

- **On every change**: every command that would write an item applies the rules in force to the item as it would be (`next`), each rule in the order of section 3, each to the properties it names. This happens before the item is checked against its schema and definition and before the team rules are evaluated, so the team rules and the history see the redacted values. The history entry records the redacted values.
- **Never on reading**: `list`, `show`, `query` and every other command that changes nothing evaluates no redaction rule; it prints the items as stored. An item stored before a rule existed keeps its content until it is next changed.
- **Never on the configuration or the team file**: those are written by people.

A redaction changes a value the caller gave; the command's output says which properties were redacted, so the caller knows that what was stored differs from what was typed.

## 5. Validation

`backlog validate` checks that `redaction_rules` fits the schema, that every `find` is valid RE2 syntax, and that every name in `properties` is a base property or a field of some item definition of the repository. A finding is reported with the rule (`id` or place), the reason and the fix.

## 6. Example

With [redaction.example.json](redaction.example.json) as `.backlog/config.json`, `backlog new --title "Ping build01.corp.example.com" --description "Customer CUST-123456 wrote to ann@example.org"` stores the title `Ping [internal host]` and the description `Customer CUST-****** wrote to [redacted e-mail]`, and prints that `title` and `description` were redacted.
