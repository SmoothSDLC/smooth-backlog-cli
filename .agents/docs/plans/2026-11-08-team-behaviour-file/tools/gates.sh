#!/bin/sh
# Runs the quality gates of 10-review-log.md. CLI = a checkout of the CLI at 174c76d; TOPO_DEF = the topology copy of the schema 1
# definition (optional). Exit 1 on the first failing gate.
set -e
cd "$(dirname "$0")/.."
python3 tools/check_schemas.py | tail -1
python3 tools/check_semantics.py def templates/team.full.json templates/minimal.json
python3 tools/check_semantics.py teams templates/teams.example.json templates/workflows.example.json
python3 tools/check_consistency.py | tail -2
cp inventory.tsv /tmp/inv.$$; cp tests.tsv /tmp/tst.$$
SRC="$CLI/src" TESTS="$CLI/.agents/test" sh tools/run.sh >/dev/null
cmp inventory.tsv /tmp/inv.$$ && cmp tests.tsv /tmp/tst.$$ && echo "INVENTORY REGENERATION BYTE-IDENTICAL"; rm -f /tmp/inv.$$ /tmp/tst.$$
for f in "$CLI/templates/workflows/team.json" ${TOPO_DEF:-}; do
  python3 tools/convert_v1.py templates/team.full.json "$f" /tmp/conv.$$.json
  python3 tools/check_semantics.py def /tmp/conv.$$.json
  python3 tools/validate_subset.py schema/team-behaviour.schema.json /tmp/conv.$$.json; rm -f /tmp/conv.$$.json
done
echo "ALL GATES PASS"
