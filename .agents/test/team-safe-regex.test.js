// Tests for the linear-time pattern matcher of the rule language (src/team/rules/safe-regex.js).
// Pure unit tests: no repository, no command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/team/rules/safe-regex.js';

const matches = (pattern, text) => compile(pattern)(text);

// [pattern, text that matches, text that does not match]
const SUPPORTED = [
  ['abc', 'xxabcxx', 'abx'],
  ['a.c', 'abc', 'a\nc'],
  ['^abc', 'abcd', 'xabc'],
  ['abc$', 'xabc', 'abcx'],
  ['^$', '', 'a'],
  ['a*b', 'aaab', 'aaa'],
  ['^a+$', 'aaa', ''],
  ['^ab?c$', 'ac', 'abbc'],
  ['^a{3}$', 'aaa', 'aa'],
  ['^a{2,}$', 'aaaa', 'a'],
  ['^a{1,3}$', 'aa', 'aaaa'],
  ['^(ab)+$', 'abab', 'aba'],
  ['^(?:ab)+$', 'abab', 'aba'],
  ['^(a|bc)$', 'bc', 'ab'],
  ['^(a|b|c)d$', 'cd', 'dd'],
  ['[abc]', 'xxb', 'xyz'],
  ['^[^abc]$', 'x', 'a'],
  ['^[a-c]+$', 'abcba', 'abd'],
  ['^[a-c-]$', '-', 'd'],
  ['^[\\d.]+$', '1.5', '1a'],
  ['\\d', 'a1', 'ab'],
  ['\\D', '1a', '12'],
  ['\\w', '--a', '-- '],
  ['\\W', 'a b', 'ab'],
  ['\\s', 'a b', 'ab'],
  ['\\S', ' a', '  '],
  ['^a\\nb$', 'a\nb', 'anb'],
  ['^a\\tb$', 'a\tb', 'atb'],
  ['a\\.b', 'a.b', 'axb'],
  ['\\(x\\)', '(x)', 'x'],
  ['\\[x\\]', '[x]', 'x'],
  ['\\\\', 'a\\b', 'ab'],
  ['^(a+)+$', 'aaa', 'aab'],
  ['^[-a]$', '-', 'b'],
  ['^[a-]$', 'a', 'b'], // a trailing - is a literal: the design text names no such class, this is the module's behaviour
  ['^[\\D]$', 'a', '1'],
  ['^[\\W]$', '-', 'a'],
  ['^[\\S]$', 'a', ' '],
  ['^[\\dx]$', 'x', 'y'],
  ['^[\\dx]$', '5', 'y'],
  ['(^a|b$)', 'ab...', 'xay'],
  ['(^a|b$)', '...b', 'xay'],
  ['(^a|b$)', 'xxb', 'bx'],
];

for (const [pattern, yes, no] of SUPPORTED) {
  test(`supported ${JSON.stringify(pattern)}: matches ${JSON.stringify(yes)}, not ${JSON.stringify(no)}`, () => {
    assert.equal(matches(pattern, yes), true);
    assert.equal(matches(pattern, no), false);
  });
}

test('\\w and \\W are opposites on an underscore, a digit, a letter, a hyphen and a space', () => {
  for (const ch of ['_', '7', 'k']) { assert.equal(matches('^\\w$', ch), true); assert.equal(matches('^\\W$', ch), false); }
  for (const ch of ['-', ' ']) { assert.equal(matches('^\\w$', ch), false); assert.equal(matches('^\\W$', ch), true); }
});

test('\\s and \\S are opposites on a space, a tab, a newline and a letter', () => {
  for (const ch of [' ', '\t', '\n']) { assert.equal(matches('^\\s$', ch), true); assert.equal(matches('^\\S$', ch), false); }
  assert.equal(matches('^\\s$', 'k'), false);
  assert.equal(matches('^\\S$', 'k'), true);
});

test('a hyphen first or last in a class is a literal', () => {
  assert.equal(matches('^[-a]$', '-'), true);
  assert.equal(matches('^[-a]$', 'a'), true);
  assert.equal(matches('^[-a]$', 'b'), false);
  assert.equal(matches('^[a-]$', '-'), true);
});

test('a match may start at every position and the empty pattern matches', () => {
  assert.equal(matches('', 'anything'), true);
  assert.equal(matches('b+c', 'aabbc'), true);
});

test('a text that is not text is read as text; null and undefined read as empty', () => {
  assert.equal(matches('^5$', 5), true);
  assert.equal(matches('^$', null), true);
  assert.equal(matches('^$', undefined), true);
});

// [pattern, the refusal]
const REFUSED = [
  ['(?=a)', 'lookaround and flags are not supported (at character 1)'], // case VAL-20
  ['(?!a)', 'lookaround and flags are not supported (at character 1)'],
  ['(?<=a)b', 'lookaround and flags are not supported (at character 1)'],
  ['(?i)a', 'lookaround and flags are not supported (at character 1)'],
  ['[z-a]', 'the range z-a is reversed (at character 2)'], // case VAL-33
  ['[9-0]', 'the range 9-0 is reversed (at character 2)'],
  ['(a)\\1', '\\1 is not supported (at character 4)'],
  ['\\b', '\\b is not supported (at character 1)'],
  ['\\B', '\\B is not supported (at character 1)'],
  ['a+?', 'a lazy quantifier is not supported (at character 2)'],
  ['a*?', 'a lazy quantifier is not supported (at character 2)'],
  ['a{2}?', 'a lazy quantifier is not supported (at character 4)'],
  ['\\x41', 'the escape \\x is not supported (at character 2)'],
  ['\\p', 'the escape \\p is not supported (at character 2)'],
  ['a\\', 'the pattern ends with \\ (at character 3)'],
  ['[abc', 'a [ class is not closed (at character 4)'],
  ['(ab', 'a ( group is not closed (at character 4)'],
  ['ab)', 'a ) has no ( (at character 2)'],
  ['*a', 'a quantifier has nothing to repeat (at character 1)'],
  ['+', 'a quantifier has nothing to repeat (at character 1)'],
  ['a{101}', 'a counted repetition is at most 100 (at character 5)'],
  ['a{3,2}', 'a counted repetition has its minimum above its maximum (at character 5)'],
  ['[a-\\d]', 'the range a-\\ ends with an escape; write the members of the class one by one (at character 2)'],
  ['a??', 'a lazy quantifier is not supported (at character 2)'],
  ['\\9', '\\9 is not supported (at character 1)'],
  ['a{101,}', 'a counted repetition is at most 100 (at character 6)'],
  ['a{1,101}', 'a counted repetition is at most 100 (at character 7)'],
];

for (const [pattern, message] of REFUSED) {
  test(`refused ${JSON.stringify(pattern)}`, () => {
    assert.throws(() => compile(pattern), { message });
  });
}

test('a pattern that is not text is refused', () => {
  for (const v of [undefined, null, 5, {}, ['a']]) assert.throws(() => compile(v), { message: 'the pattern must be text' });
});

test('limits: the pattern length is at most 200 characters', () => {
  assert.equal(matches('a'.repeat(200), 'a'.repeat(200)), true);
  assert.throws(() => compile('a'.repeat(201)), { message: 'the pattern is longer than 200 characters' });
});

test('limits: a counted repetition of 100 is accepted, 101 is refused', () => {
  assert.equal(matches('^a{100}$', 'a'.repeat(100)), true);
  assert.equal(matches('^a{100}$', 'a'.repeat(99)), false);
  assert.equal(matches('^a{0,100}$', 'a'.repeat(100)), true);
  assert.throws(() => compile('a{0,101}'), /a counted repetition is at most 100/);
});

test('limits: the program holds at most 5000 instructions', () => {
  // (a{100}){49} is 4900 'a' instructions plus the final match: inside. (a{100}){50} reaches 5001: outside.
  assert.doesNotThrow(() => compile('(a{100}){49}'));
  assert.throws(() => compile('(a{100}){50}'), { message: 'the pattern is too large (counted repetitions multiply)' });
  assert.throws(() => compile('((a{100}){100}){100}'), { message: 'the pattern is too large (counted repetitions multiply)' });
});

test('limits: the program of exactly 5000 instructions is accepted (4999 characters and the match)', () => {
  assert.doesNotThrow(() => compile('(a{100}){49}a{99}'));
  assert.throws(() => compile('(a{100}){49}a{100}'), { message: 'the pattern is too large (counted repetitions multiply)' });
});

test('limits: the tested text is cut at 10 000 characters', () => {
  const inside = `${'a'.repeat(9999)}b`;
  const outside = `${'a'.repeat(10000)}b`;
  assert.equal(matches('b', inside), true);
  assert.equal(matches('b', outside), false);
  assert.equal(matches('^a*$', 'a'.repeat(10001)), true); // the text is cut, so the end is at 10 000
  assert.equal(matches('b$', `${'a'.repeat(9999)}bc`), true); // the c is cut: the text ends with b
  assert.equal(matches('c$', `${'a'.repeat(9999)}bc`), false);
});

// Case INL-05: the pattern `^(a+)+$` makes a backtracking engine run for hours on a text of 5000 `a` and a `!`.
test('case INL-05: ^(a+)+$ on 5001 characters answers at once, with no match', () => {
  const text = `${'a'.repeat(5000)}!`;
  const test_ = compile('^(a+)+$');
  const start = process.hrtime.bigint();
  const result = test_(text);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(result, false);
  assert.ok(ms < 500, `took ${ms} ms`);
  assert.equal(test_('a'.repeat(5000)), true);
});

test('strict compile refuses a quantifier on a quantifier or on an anchor, and the default matcher still runs them', () => {
  for (const [p, m] of [['a**', 'a quantifier cannot follow another quantifier (at character 3)'], ['a{2}{3}', 'a quantifier cannot follow another quantifier (at character 7)'],
    ['^*', 'a quantifier cannot repeat ^ or $ (at character 2)'], ['a$+', 'a quantifier cannot repeat ^ or $ (at character 3)']]) {
    assert.throws(() => compile(p, true), { message: m }, p);
    assert.doesNotThrow(() => compile(p), p);
  }
  for (const p of ['(a+)+', '(a*)*', 'a+b*', '(^a)*', '^a$', 'a{2,3}', '(?:ab){2}']) assert.doesNotThrow(() => compile(p, true), p);
});

test('strict compile refuses every class range that ends in a backslash; the default matcher still runs it', () => {
  for (const p of ['[a-\\d]', '[0-\\d]', '[+-\\d]']) {
    assert.throws(() => compile(p, true), { message: /ends with an escape/ }, p);
  }
  assert.doesNotThrow(() => compile('[0-\\d]'));
  assert.doesNotThrow(() => compile('[+-\\d]'));
});
