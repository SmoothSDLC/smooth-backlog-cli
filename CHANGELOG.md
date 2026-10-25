# Changelog

## Unreleased

- Add the shared backlog repository mode: `backlog --use-backlog-repo <path>` keeps every repository's items in
  one Git backlog repository (`SmoothSDLC/smoothsdlc-backlog`), with `new`, `update`, `query`, `next`, `pop`,
  `move` and `archive` matching the Python backlog skill, including the team flags (claim, review, waiting,
  hand-back) and the team views; `--use-local-repo` switches back. See COMMANDS.md.
- Read and write item front matter compatibly with the Python skill's PyYAML files, keep the SQLite mirror in step,
  and commit and push each change before exiting, with collision renumbering and a run lock per repository.
- Refuse symlinked or escaping paths inside the backlog home and redact credentials in every diagnostic.
- Fix intermittent permission errors when concurrent commands acquire locks on Windows.
- Preserve existing backlog data and lock coordination after the project rename.
- Shared mode: every item write records `updated_by`; a write to an item that somebody else changed after the agent read it (or while the command pushes) is refused with exit code 5. No move, new, archive or sync renumbering replaces an item that holds the file name, and a release ends the holder's wait.
- Shared mode: completion and close validate every reflowed item against the agent's cached view and guard the whole write set during push; pulling never counts as reading an item.
- Refresh package documentation and repository references for npm registry installation.

## 1.0.1

- Correct GitHub Packages login instructions for npm 9 and later by using
  `--auth-type=legacy`.

## 1.0.0

- Create and manage branch-specific backlog items with permanent GUIDs and
  sortable active priorities.
- Track tasks, acceptance criteria, outcomes, references, and evidence through
  new, open, done, and archived states.
- Move individual items between branches or import another branch's work.
- Use interactive creation or JSON output for scripts and coding agents.
- Install repository-local integrations for Codex, Claude Code, GitHub Copilot,
  and Qwen Code.
- Check for releases and optionally install compatible automatic updates.

See [the latest release](https://github.com/SmoothSDLC/smooth-backlog-cli/releases/latest)
for release notes. [README.md](README.md) covers installation and
[COMMANDS.md](COMMANDS.md) describes the CLI.
