#!/bin/sh
# Regenerates inventory.tsv and tests.tsv. SRC = <checkout of smooth-backlog-cli at 174c76d>/src, TESTS = <checkout>/.agents/test.
set -e
cd "$(dirname "$0")"
python3 scan.py > cand.tsv && python3 fmap.py > /dev/null && python3 inv.py && python3 tests.py > /dev/null
mv inventory.tsv tests.tsv ..; rm -f cand.tsv cand2.tsv
