#!/usr/bin/env bash
# Install smooth-backlog-cli when the backlog command is missing, update it when the registry has a newer release,
# then run `backlog setup` with this script's arguments (for example --ask). Run it from inside the repository.
set -euo pipefail
pkg=@smoothsdlc/smooth-backlog-cli
registry=${BACKLOG_CLI_REGISTRY:-https://npm.pkg.github.com}
latest=$(npm view "$pkg" version --registry="$registry" 2>/dev/null || true)
if ! command -v backlog >/dev/null 2>&1; then
  npm install --global "$pkg${latest:+@$latest}" --registry="$registry"
elif [ -n "$latest" ]; then
  current=$(backlog --version 2>/dev/null || echo 0)
  # newer: the registry's version sorts after the installed one
  if [ "$current" != "$latest" ] && [ "$(printf '%s\n%s\n' "$current" "$latest" | sort -V | tail -n1)" = "$latest" ]; then
    npm install --global "$pkg@$latest" --registry="$registry"
  fi
fi
command -v backlog >/dev/null 2>&1 || { echo "install-backlog-cli: the backlog command is still missing after npm install" >&2; exit 1; }
exec backlog setup "$@"
