# Changelog

## Unreleased

- Fix intermittent permission errors when concurrent commands acquire locks on Windows.
- Preserve existing backlog data and lock coordination after the project rename.
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
