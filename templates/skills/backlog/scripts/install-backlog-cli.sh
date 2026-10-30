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
if ! latest=$(npm view "$pkg" version --registry="$registry" 2>&1); then
  [ -n "$installed" ] || die "cannot reach $registry for $pkg (authenticate with npm login --scope=@smoothsdlc --registry=$registry): $latest"
  echo "install-backlog-cli: could not check $registry for a newer release, keeping $installed: $latest" >&2; latest=""
fi
# newer: numeric parts first; at equal numbers a release is newer than its pre-releases (1.2.0-beta < 1.2.0)
newer() { node -e 'const p=v=>{const[a,b=""]=v.split("-");return[...a.split(".").map(Number),b]};const[x,y]=process.argv.slice(1).map(p);for(let i=0;i<3;i++)if(x[i]!==y[i])process.exit(x[i]>y[i]?0:1);process.exit(x[3]!==y[3]&&(x[3]===""||(y[3]!==""&&x[3]>y[3]))?0:1)' "$1" "$2"; }
if [ -z "$installed" ]; then
  npm install --global "$pkg${latest:+@$latest}" --registry="$registry"
elif [ -n "$latest" ] && [ "$installed" != "$latest" ] && newer "$latest" "$installed"; then
  npm install --global "$pkg@$latest" --registry="$registry"
fi
want=$(version_of_install)
[ -n "$want" ] || die "$pkg is not installed after npm install"
got=$(backlog --version 2>/dev/null || true)
[ "$got" = "$want" ] || die "the backlog command on PATH ($(command -v backlog || echo none), version ${got:-unknown}) is not $pkg $want: put npm's global bin ($(npm prefix --global)/bin) first on PATH"
exec backlog setup "$@"
