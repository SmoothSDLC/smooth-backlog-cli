// Shared-mode front-matter codec tests for src/shared/frontmatter.js (cli-parity job 4, CODEC).
//
// Fixtures under fixtures/shared/ were made once (2026-10-22, PyYAML 6.0.3 / CPython 3.14.4)
// with the pinned oracle's write_doc (lib_db.py:182-184 per contract v3); each .json is
// json.dumps(yaml.safe_load(<that dump>)) of the same front matter. The generating command:
//
//   python3 - <<'PY'
//   import json, sys
//   from pathlib import Path
//   sys.path.insert(0, str(Path.home()/'.qwen/skills/backlog/scripts'))
//   import yaml, lib_db
//   out = Path('.agents/test/fixtures/shared'); out.mkdir(parents=True, exist_ok=True)
//   def make(name, fm, body):
//       lib_db.write_doc(out/f'{name}.md', fm, body)
//       (out/f'{name}.json').write_text(json.dumps(yaml.safe_load(yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)), indent=2)+'\n')
//   obj = 'Read the item files PyYAML writes and write files PyYAML reads, without a dependency. The codec keeps the shared-mode format byte-for-byte per oracle.'
//   assert len(obj) == 150
//   make('item-realistic', {'phase': '004-cli-parity-job-4-front-matter-codec-compatible-with-pyyaml', 'seq': 4, 'name': 'cli-parity job 4: front-matter codec compatible with PyYAML', 'objective': obj, 'status': 'in_progress', 'work_class': ['app-code','tests'], 'review_classes': ['code','tests','data'], 'created': '2026-10-22T03:39:31Z', 'location': ''}, '# Phase 004 - front-matter codec\n\nThe body markdown of the item file stays exactly as written.\n')
//   make('item-scalars', {'name': "job with 'single' and \"double\" quotes in the name", 'simple': 'plain words', 'unicode': '日本語の項目 - café ünïcode', 'colon': 'a: b', 'empty': '', 'dash': '- leading dash', 'quote_first': '"starts with a double quote" and ends plain', 'apostrophe_first': "'starts with an apostrophe'", 'tab': 'a\tb', 'long_tab': 'a\tb ' + 'the quick brown fox jumps over the lazy dog. ' * 2, 'long': "a 'single' and \"double\" quoted string, long enough to fold over a line break at the eighty column boundary, with words continuing after the fold point"}, '# scalars\n\nQuoting styles as written by PyYAML.\n')
//   make('item-shapes', {'seq': 7, 'negative': -15, 'big': 123456789, 'flag_true': True, 'flag_false': False, 'nothing': None, 'empty_list': [], 'numbers': [1,2,3]}, '# shapes\n\nLists, integers, booleans and null.\n')
//   PY
//
// Review-fix fixtures (2026-10-23) came from the same make() with: item-multiline (strings with \n,
// blank-line breaks and a trailing \n), item-escapes (\0 \e \a \v \b \f, \x7F, \x9F, \uFEFF, tab, CR)
// and item-wrapped-lists (block-list items PyYAML wraps: plain, double-quoted with \t / \0, multiline).
//
// Cited source: the pinned oracle at commit ec5b254e (contract v3 lines) — lib_db.py:171-179
// (_FM_RE + parse_front_matter) and 182-184 (write_doc); the oracle copies at
// ~/.qwen/skills/backlog/scripts/ are content-identical for these functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, dump } from '../../src/shared/frontmatter.js';

const FIX = join(fileURLToPath(new URL('./fixtures/shared/', import.meta.url)));
const FIXTURES = ['item-realistic', 'item-scalars', 'item-shapes', 'item-multiline', 'item-escapes', 'item-wrapped-lists'];

function readFixture(name) {
  return readFileSync(join(FIX, `${name}.md`), 'utf8');
}
function fixtureJson(name) {
  return JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8'));
}

// --- the item's test 1: every fixture parses to its .json ---
for (const name of FIXTURES) {
  test(`fixture ${name} parses to its .json`, () => {
    const fm = parse(readFixture(name)).fm;
    assert.deepEqual(fm, fixtureJson(name));
  });
}

// --- the item's test 2: dump then parse is identity ---
for (const name of FIXTURES) {
  test(`fixture ${name}: dump then parse is identity`, () => {
    const { fm, body } = parse(readFixture(name));
    const again = parse(dump(fm, body));
    assert.deepEqual(again.fm, fm);
    assert.equal(again.body, body);
  });
}

function pyYamlAvailable() {
  try {
    return spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

// --- the item's test 3: with python3 and PyYAML present, yaml.safe_load of dump() equals the input ---
for (const name of FIXTURES) {
  test(`fixture ${name}: PyYAML reads our dump (safe_load of the dumped front matter equals the input)`, (t) => {
    const { fm, body } = parse(readFixture(name));
    if (!pyYamlAvailable()) {
      t.skip('python3 with PyYAML is not on PATH');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'codec-'));
    try {
      const file = join(dir, 'roundtrip.md');
      writeFileSync(file, dump(fm, body));
      const out = spawnSync('python3', ['-c',
        "import json, re, sys, yaml\n" +
        "text = open(sys.argv[1], encoding='utf-8').read()\n" +
        "m = re.match(r'^---\\n(.*?)\\n---', text, re.S)\n" +
        "sys.stdout.write(json.dumps(yaml.safe_load(m.group(1))))\n",
        file]);
      assert.equal(out.status, 0, `python3 failed: ${out.stderr.toString('utf8')}`);
      assert.deepEqual(JSON.parse(out.stdout.toString('utf8')), fm);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// --- parse: the split of lib_db.py:171-179 ---

test('parse: a text without a front-matter header returns {} and the whole text', () => {
  assert.deepEqual(parse('body only'), { fm: {}, body: 'body only' });
});

test('parse: an empty front-matter mapping passes through as {}', () => {
  assert.deepEqual(parse('---\n{}\n---\nbody'), { fm: {}, body: 'body' });
});

test('parse: the body keeps everything after the closing --- line', () => {
  assert.deepEqual(parse('---\nphase: x\n---\nline one\nline two'), {
    fm: { phase: 'x' },
    body: 'line one\nline two',
  });
});

// --- parse: the YAML subset, value by value ---

test('parse: plain scalar values, including unicode', () => {
  const { fm } = parse('---\na: hello world\nb: 日本語\n---\n');
  assert.equal(fm.a, 'hello world');
  assert.equal(fm.b, '日本語');
});

test('parse: a plain scalar folds over a continuation line (PyYAML width-80 wrap)', () => {
  const { fm } = parse('---\nobjective: the first part of a long\n  value continues on the next line\nnext: k\n---\n');
  assert.equal(fm.objective, 'the first part of a long value continues on the next line');
  assert.equal(fm.next, 'k');
});

test('parse: typed plain scalars (ints, negative, null, ~, booleans)', () => {
  const { fm } = parse('---\na: 4\nb: -15\nc: null\nd: ~\ne: true\nf: false\n---\n');
  assert.deepEqual(fm, { a: 4, b: -15, c: null, d: null, e: true, f: false });
});

test('parse: a bare key with nothing after it is null', () => {
  const { fm } = parse('---\nkey:\nother: v\n---\n');
  assert.deepEqual(fm, { key: null, other: 'v' });
});

test('parse: single-quoted scalars (colon inside, apostrophe escape, empty)', () => {
  const { fm } = parse("---\na: 'a: b'\nb: 'it''s'\nc: ''\n---\n");
  assert.equal(fm.a, 'a: b');
  assert.equal(fm.b, "it's");
  assert.equal(fm.c, '');
});

test('parse: double-quoted scalars with escapes (\" \\ \\n)', () => {
  const { fm } = parse('---\na: "x \\"y\\""\nb: "a\\\\b"\nc: "line\\nbreak"\n---\n');
  assert.equal(fm.a, 'x "y"');
  assert.equal(fm.b, 'a\\b');
  assert.equal(fm.c, 'line\nbreak');
});

test('parse: a double-quoted scalar folds over a continuation line', () => {
  const { fm } = parse('---\nlong: "the first half of a long\n  double-quoted string"\n---\n');
  assert.equal(fm.long, 'the first half of a long double-quoted string');
});

test('parse: a double-quoted scalar with an escaped line break (PyYAML wrap of a tab string)', () => {
  const text = '---\n'
    + 't: "a\\tb the quick brown fox jumps\\\n'
    + '  \\ over the lazy dog."\n'
    + '---\n';
  const { fm } = parse(text);
  assert.equal(fm.t, 'a\tb the quick brown fox jumps over the lazy dog.');
});

test('parse: a block list of scalars', () => {
  const { fm } = parse('---\nwork_class:\n- app-code\n- tests\n---\n');
  assert.deepEqual(fm, { work_class: ['app-code', 'tests'] });
});

test('parse: an empty flow list is []; a flow list decodes its items', () => {
  const { fm } = parse('---\na: []\nb: [a, b]\nc: [1, 2]\n---\n');
  assert.deepEqual(fm, { a: [], b: ['a', 'b'], c: [1, 2] });
});

test('parse: anything outside the subset is a clear error, never a guess', () => {
  assert.throws(() => parse('---\nk: &a x\n---\n'), /anchor/);
  assert.throws(() => parse('---\nk: *a\n---\n'), /alias/);
  assert.throws(() => parse('---\nk: !!str x\n---\n'), /tag/);
  assert.throws(() => parse('---\nk: {a: b}\n---\n'), /flow map/);
  assert.throws(() => parse('---\nk:\n  nested: x\n---\n'), /nested/);
  assert.throws(() => parse('---\njust a word\n---\n'), /key/);
});

test('parse: a list line after a key with an inline value is a clear error', () => {
  assert.throws(() => parse('---\nk: v\n- x\n---\n'), /k/);
});

// --- dump: keys in the given order, the oracle write_doc shape ---

test('dump: keys in the given order, strings as JSON double-quoted, body unchanged', () => {
  assert.equal(dump({ b: 'x "y"', a: 1 }, 'BODY'), '---\n' + 'b: ' + String.raw`"x \"y\""` + '\na: 1\n---\nBODY');
});

test('dump: null, booleans, empty and block lists', () => {
  const out = dump({ a: null, b: true, c: false, d: [], e: [1, 'x'] }, '');
  assert.equal(out, '---\na: null\nb: true\nc: false\nd: []\ne:\n- 1\n- "x"\n---\n');
});

test('dump: an empty front matter writes {} like the oracle write_doc', () => {
  assert.equal(dump({}, 'body'), '---\n{}\n---\nbody');
});

test('dump: unsupported value types and non-identifier keys are clear errors', () => {
  assert.throws(() => dump({ a: 1.5 }, ''), /unsupported/);
  assert.throws(() => dump({ a: { b: 1 } }, ''), /unsupported/);
  assert.throws(() => dump({ 'a b': 1 }, ''), /key/);
});

// --- review fixes (Codex review 2026-10-23, job 4) ---

// Runs PyYAML's safe_load over a dumped front matter; returns the parsed JSON (null when PyYAML is missing).
function pyLoad(text) {
  if (!pyYamlAvailable()) return undefined;
  const out = spawnSync('python3', ['-I', '-c',
    "import json, re, sys, yaml\n" +
    "m = re.match(r'^---\\n(.*?)\\n---', sys.stdin.read(), re.S)\n" +
    "sys.stdout.write(json.dumps(yaml.safe_load(m.group(1))))\n"], { input: text });
  assert.equal(out.status, 0, `python3 failed: ${out.stderr.toString('utf8')}`);
  return JSON.parse(out.stdout.toString('utf8'));
}

test('review P1: a quoted scalar keeps blank-line breaks (PyYAML folding: n breaks -> n-1 newlines)', () => {
  assert.equal(parse("---\na: 'first line\n\n  second line'\n---\n").fm.a, 'first line\nsecond line');
  assert.equal(parse("---\na: 'x\n\n\n  y'\n---\n").fm.a, 'x\n\ny');
  assert.equal(parse('---\na: "x\n\n  y"\n---\n').fm.a, 'x\ny');
  assert.equal(parse("---\na: 'x\n  y'\n---\n").fm.a, 'x y', 'a single break still folds to a space');
  assert.equal(parse("---\na: 'ends\n\n  '\n---\n").fm.a, 'ends\n');
});

test('review P1: credentials in a URL never appear in a parse or dump error', () => {
  const bad = [
    '---\nsee https://user:token@example.com/x y\n---\n',
    '---\nk: &https://user:token@example.com/x\n---\n',
    '---\nk: *user:token@example.com\n---\n',
    '---\nk: a: https://user:token@example.com/x\n---\n',
    '---\nk:\n- {a: https://user:token@example.com/x}\n---\n',
    '---\nk: "https://user:token@example.com/x" tail\n---\n',
    '---\nk: "https://user:token@example.com/x \\q"\n---\n',
    '---\nuser:token@example.com bad key: v\n---\n',
  ];
  for (const text of bad) {
    let err;
    try { parse(text); } catch (e) { err = e; }
    assert.ok(err, `expected an error for ${JSON.stringify(text)}`);
    assert.doesNotMatch(err.message, /token/, text);
  }
  assert.throws(() => dump({ 'user:token@example.com': 1 }, ''), (e) => !/token/.test(e.message));
});

test('review P1: unsupported constructs are rejected in every scalar context, never guessed', () => {
  const cases = [
    ['k:\n- {a: b}', /flow map/],
    ['k: |\n  x', /block scalar/],
    ['k: >\n  x', /block scalar/],
    ['k:\n- |\n  x', /block scalar/],
    ['k:\n- >\n  x', /block scalar/],
    ['k:\n- [a, b]', /flow list/],
    ['k:\n- &a x', /anchor/],
    ['k:\n- *a', /alias/],
    ['k:\n- !!str x', /tag/],
    ['k:\n- a: b', /mapping/],
    ['k:\n- - a', /block-list marker/],
    ['k: a: b', /mapping/],
    ['k: [{a: b}]', /flow map/],
    ['k: [|]', /block scalar/],
    ['k: # comment', /comment/],
    ['k: a # comment', /comment/],
  ];
  for (const [fm, re] of cases) assert.throws(() => parse(`---\n${fm}\n---\n`), re, fm);
  assert.deepEqual(parse('---\nk: 2026-10-22T03:39:31Z\n---\n').fm, { k: '2026-10-22T03:39:31Z' }, 'colon and # inside a word stay plain');
  assert.deepEqual(parse('---\nk: a#b\n---\n').fm, { k: 'a#b' });
});

test('review P2: block-list items that PyYAML wraps over lines decode whole', () => {
  const text = '---\nk:\n- "tab\\there the quick brown fox\\\n  \\ jumps over"\n- plain wrapped\n  words\n- \'one\n\n  two\'\n- next\n---\n';
  assert.deepEqual(parse(text).fm, { k: ['tab\there the quick brown fox jumps over', 'plain wrapped words', 'one\ntwo', 'next'] });
});

test('review P2: a flow list splits only outside quotes', () => {
  assert.deepEqual(parse('---\nk: ["a, b", c]\n---\n').fm, { k: ['a, b', 'c'] });
  assert.deepEqual(parse("---\nk: ['a, b', \"c\\\", d\", 'it''s, ok']\n---\n").fm, { k: ['a, b', 'c", d', "it's, ok"] });
  assert.throws(() => parse('---\nk: ["a, b]\n---\n'), /not closed/);
  assert.throws(() => parse('---\nk: [a, ]\n---\n'), /empty/);
});

test('review P2: the double-quoted decoder reads every escape PyYAML emits', () => {
  const fm = parse('---\nk: "\\0 \\a \\b \\t \\n \\v \\f \\r \\e \\  \\" \\/ \\\\ \\N \\_ \\L \\P \\x41 \\x7F \\u00e9 \\U0001F600"\n---\n').fm;
  assert.equal(fm.k, '\0 \x07 \b \t \n \x0b \f \r \x1b   " / \\ \x85 \xa0 \u2028 \u2029 A \x7f é 😀');
  assert.throws(() => parse('---\nk: "\\xZ1"\n---\n'), /escape/);
  assert.throws(() => parse('---\nk: "\\U0011FFFF"\n---\n'), /escape/);
  assert.throws(() => parse('---\nk: "\\q"\n---\n'), /escape/);
});

test('review P2: dump escapes characters YAML forbids or reads as line breaks; PyYAML reads back the exact string', () => {
  const s = 'a\x7fb\x85c\u2028d\u2029e\x9ff\ufffeg\uffffh\x00i';
  const text = dump({ s, list: [s] }, '');
  assert.doesNotMatch(text, /[\x7f-\x9f\u2028\u2029\ufffe\uffff]/, 'no raw forbidden character reaches the file');
  assert.deepEqual(parse(text).fm, { s, list: [s] });
  const py = pyLoad(text);
  if (py !== undefined) assert.deepEqual(py, { s, list: [s] });
});

test('review P2: integers outside the JavaScript safe range are errors in both directions', () => {
  assert.equal(dump({ a: Number.MAX_SAFE_INTEGER, b: -Number.MAX_SAFE_INTEGER }, ''), '---\na: 9007199254740991\nb: -9007199254740991\n---\n');
  assert.deepEqual(parse('---\na: 9007199254740991\nb: -9007199254740991\n---\n').fm, { a: 9007199254740991, b: -9007199254740991 });
  for (const v of [1e21, 2 ** 53, -(2 ** 53), Infinity, NaN]) assert.throws(() => dump({ a: v }, ''), /unsupported/, String(v));
  assert.throws(() => dump({ a: [2 ** 53] }, ''), /unsupported/);
  for (const v of ['9007199254740992', '9007199254740993', '-9007199254740992', '1' + '0'.repeat(30)]) {
    assert.throws(() => parse(`---\na: ${v}\n---\n`), /safe|range/, v);
  }
});

// --- second review (job 4) ---
test('second review P2: a quote inside a plain flow-list item is content, not a delimiter (PyYAML reads the same)', () => {
  const cases = {
    "k: [it's, c]": ["it's", 'c'],
    'k: [say "hi", ok]': ['say "hi"', 'ok'],
    "k: [a'b, c'd, e]": ["a'b", "c'd", 'e'],
    "k: [it's, 'q, r', \"s, t\", u\"v]": ["it's", 'q, r', 's, t', 'u"v'],
  };
  for (const [line, want] of Object.entries(cases)) {
    const text = `---\n${line}\n---\n`;
    assert.deepEqual(parse(text).fm, { k: want }, line);
    const py = pyLoad(text);
    if (py !== undefined) assert.deepEqual(py, { k: want }, `PyYAML: ${line}`);
  }
});

test('second review P2: only YAML separation characters (space, tab, line breaks) count in the comment and mapping checks', () => {
  // PyYAML (allow_unicode) writes these as plain scalars; every Unicode space except space/tab is scalar content.
  const cases = ['see\u00a0#123', 'a:\u00a0b', 'x\u2003#y', 'a:\u3000b', 'b:\u2003', '\u00a0:x', '\u00a0lead', 'trail\u00a0', '\u00a0', '\u2003a', 'a\u200b\u00a0#b', 'a\ufeff', "it's, c"];
  if (!pyYamlAvailable()) return;
  const py = spawnSync('python3', ['-I', '-c',
    "import json, sys, yaml\n" +
    "cases = json.loads(sys.stdin.read())\n" +
    "fm = {'objective': cases[0], 'cases': cases}\n" +
    "fm.update({'k%d' % i: c for i, c in enumerate(cases)})\n" +
    "text = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)\n" +
    "assert yaml.safe_load(text) == fm\n" +
    "json.dump({'text': text}, sys.stdout)\n"], { input: JSON.stringify(cases) });
  assert.equal(py.status, 0, py.stderr.toString('utf8'));
  const { text } = JSON.parse(py.stdout.toString('utf8'));
  const want = { objective: cases[0], cases, ...Object.fromEntries(cases.map((c, i) => [`k${i}`, c])) };
  assert.deepEqual(parse(`---\n${text.trim()}\n---\n`).fm, want);
  assert.equal(parse('---\nobjective: see\u00a0#123\n---\n').fm.objective, 'see\u00a0#123');
  const flow = '---\nk: [see\u00a0#123, a:\u00a0b, \u00a0x]\n---\n';
  assert.deepEqual(parse(flow).fm, { k: ['see\u00a0#123', 'a:\u00a0b', '\u00a0x'] });
  assert.deepEqual(pyLoad(flow), { k: ['see\u00a0#123', 'a:\u00a0b', '\u00a0x'] });
  // a real space or tab still makes a comment or a mapping
  assert.throws(() => parse('---\nk: see #123\n---\n'), /comment/);
  assert.throws(() => parse('---\nk: a:\tb\n---\n'), /mapping/);
  assert.throws(() => parse('---\nk: [a: b]\n---\n'), /mapping/);
});

// Review fix (third review): U+0085, U+2028 and U+2029 are YAML line breaks, so a comment or mapping after one is rejected like after \n.
for (const [cp, name] of [['\u0085', 'U+0085'], [' ', 'U+2028'], [' ', 'U+2029']]) {
  test(`parse: ${name} in a plain continuation line starts a comment or mapping like a newline`, () => {
    assert.throws(() => parse(`---\nk: first\n  x${cp}#123\n---\n`), /comment/);
    assert.throws(() => parse(`---\nk: first\n  a:${cp}b\n---\n`), /mapping/);
    assert.throws(() => parse(`---\nk: a${cp}#b\n---\n`)); // U+2028/9 end the line for KEY_LINE already
    assert.throws(() => parse(`---\nk: a:${cp}b\n---\n`));
    assert.throws(() => parse(`---\nk:\n- first\n  x${cp}#123\n---\n`), /comment/);
  });
}

test('review P1: an item saved with CRLF (or lone CR) line endings parses like the LF one (python text mode normalises)', () => {
  const lf = '---\nphase: 001-a\nseq: 1\nstatus: pending\n---\n\n# Body\nline\n';
  for (const eol of ['\r\n', '\r']) {
    const p = parse(lf.replace(/\n/g, eol));
    assert.deepEqual(p, parse(lf), JSON.stringify(eol));
    assert.equal(p.fm.status, 'pending');
  }
});
