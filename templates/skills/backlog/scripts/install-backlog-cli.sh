#!/usr/bin/env bash
# Install smooth-backlog-cli when it is missing, update it when the registry has a newer release, then run
# `backlog setup` with this script's arguments (for example --ask). Run it from inside the repository.
set -euo pipefail
pkg=@smoothsdlc/smooth-backlog-cli
registry=${BACKLOG_CLI_REGISTRY:-https://npm.pkg.github.com}
die() { echo "install-backlog-cli: $*" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || die "npm is missing: install Node.js 24 or later first"
# the installed release of this package (not whatever else is called backlog), and the registry's
version_of_install() { npm ls --global --depth=0 --json "$pkg" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).dependencies?.["'"$pkg"'"]?.version||"")}catch{}})' || true; }
installed=$(version_of_install)
err=$(mktemp); trap 'rm -f "$err"' EXIT
if ! latest=$(npm view "$pkg" version --registry="$registry" 2>"$err"); then # stdout only: npm's warnings go to stderr
  [ -n "$installed" ] || die "cannot reach $registry for $pkg (authenticate with npm login --scope=@smoothsdlc --registry=$registry): $(cat "$err")"
  echo "install-backlog-cli: could not check $registry for a newer release, keeping $installed: $(cat "$err")" >&2; latest=""
fi
# newer, by SemVer: build metadata ignored, numbers compared as numbers, a release after its pre-releases, numeric
# pre-release identifiers as numbers (1.2.0-beta.2 < 1.2.0-beta.10 < 1.2.0)
newer() { node -e '
const p = v => { const [core, pre] = v.split("+")[0].split(/-(.*)/s); return [core.split(".").map(Number), pre ? pre.split(".") : []]; };
const cmp = (a, b) => { const n = x => /^\d+$/.test(x); return n(a) && n(b) ? Number(a) - Number(b) : n(a) ? -1 : n(b) ? 1 : a < b ? -1 : a > b ? 1 : 0; };
const [[x, xp], [y, yp]] = process.argv.slice(1).map(p);
for (let i = 0; i < 3; i++) if (x[i] !== y[i]) process.exit(x[i] > y[i] ? 0 : 1);
if (!xp.length || !yp.length) process.exit(!xp.length && yp.length ? 0 : 1);
for (let i = 0; i < Math.max(xp.length, yp.length); i++) { if (i >= xp.length) process.exit(1); if (i >= yp.length) process.exit(0); const c = cmp(xp[i], yp[i]); if (c) process.exit(c > 0 ? 0 : 1); }
process.exit(1);' "$1" "$2"; }
if [ -z "$installed" ]; then
  npm install --global "$pkg${latest:+@$latest}" --registry="$registry"
elif [ -n "$latest" ] && [ "$installed" != "$latest" ] && newer "$latest" "$installed"; then
  npm install --global "$pkg@$latest" --registry="$registry"
fi
want=$(version_of_install)
[ -n "$want" ] || die "$pkg is not installed after npm install"
# the backlog on PATH must be the one npm installed (same file), not another command of that name or version
bin="$(npm prefix --global)/bin/backlog"
found=$(command -v backlog || true)
got=$(backlog --version 2>/dev/null || true)
if [ -z "$found" ] || ! [ "$found" -ef "$bin" ] || [ "$got" != "$want" ]; then # -ef: the same file, links followed
  die "the backlog command on PATH (${found:-none}, version ${got:-unknown}) is not $pkg $want ($bin): put npm's global bin first on PATH"
fi
exec backlog setup "$@"
