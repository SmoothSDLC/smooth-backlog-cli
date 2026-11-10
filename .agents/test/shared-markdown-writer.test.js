// The markdown front-matter writer of frontmatter.js (replaceItemFrontMatter): it rewrites only the header of a markdown item and keeps the byte order mark,
// the line endings and the body as they were. Items are JSON files now; this writer is kept with the markdown reader for the migration, and these
// are its tests (they were the tests of `backlog archive` on a markdown item before the switch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dumpItem, parse, parseItem, replaceItemFrontMatter } from '../../src/shared/frontmatter.js';

const FM = { phase: '005-epsilon', seq: 5, name: 'Epsilon', status: 'pending', repository: 'acme/demo', branch: 'main', updated: '2026-10-01T00:00:00Z' };
const BODY = '\n# Phase 005 - Epsilon\n\nBody line.\n';
const withEol = (text, eol) => text.replace(/\n/g, eol);

for (const eol of ['\n', '\r\n', '\r']) {
  test(`replaceItemFrontMatter replaces a whole escaped multiline status scalar and keeps the BOM and the line endings (${JSON.stringify(eol)})`, () => {
    const source = '﻿' + withEol(dumpItem(FM, BODY), eol).replace(new RegExp(`^status: .*$`, 'm'), `status: "pend\\${eol}  ing"`);
    const before = parse(source);
    assert.equal(parseItem(source).fm.status, 'pending');
    const text = replaceItemFrontMatter(source, { ...parseItem(source).fm, status: 'archived' });
    assert.deepEqual({ fm: parse(text).fm, body: parse(text).body }, { fm: { ...before.fm, status: 'archived' }, body: before.body });
    assert.ok(text.startsWith(`﻿---${eol}`), 'BOM and line endings survive');
    const bodyOf = t => t.slice(t.indexOf(`${eol}---${eol}`) + (eol + '---' + eol).length);
    assert.equal(bodyOf(text), bodyOf(source), 'body bytes survive');
  });

  test(`replaceItemFrontMatter inserts status into a header that has none (${JSON.stringify(eol)})`, () => {
    const { status, ...rest } = FM;
    const source = withEol(dumpItem(rest, BODY), eol);
    assert.ok(!/status:/.test(source.split(`${eol}---`)[1]), 'fixture has no status key');
    const text = replaceItemFrontMatter(source, { ...parseItem(source).fm, status: 'archived' });
    assert.equal(parseItem(text).fm.status, 'archived');
    assert.equal(text.split('status:').length, 2);
    assert.ok(text.includes(`${eol}status: "archived"${eol}`));
  });
}

test('replaceItemFrontMatter stamps a status into a file saved with CRLF line endings and into one that starts with a BOM, keeping both', () => {
  const crlf = withEol(dumpItem(FM, BODY), '\r\n');
  assert.match(replaceItemFrontMatter(crlf, { ...FM, status: 'archived' }), /status: "archived"\r\n/);
  const bom = '﻿' + dumpItem(FM, BODY);
  const moved = replaceItemFrontMatter(bom, { ...FM, status: 'archived' });
  assert.ok(moved.startsWith('﻿---\n'));
  assert.match(moved, /^status: "archived"$/m);
  assert.doesNotMatch(moved, /status: "pending"/);
});
