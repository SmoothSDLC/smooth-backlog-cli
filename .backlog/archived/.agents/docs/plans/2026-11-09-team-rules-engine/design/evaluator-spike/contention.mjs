// Measures what several teams writing one backlog repository at once cost (design chapter 04 section 7): N processes, each its own
// clone, each makes K item creations as a team command does (reset to upstream, allocate, write the item, the counter and the shared
// index, commit, push; a refused push runs the whole step again). Run: node contention.mjs [teams=3] [writes=20] [think_ms=0] [backoff=0|1].
// think_ms: the pause of an agent between two writes; backoff 1: after a lost race, wait a random time below 50 ms x 2^attempt.
// Not a test: it prints the lost races and the most attempts one write needed. The bare repository is local, so a push takes milliseconds; over a network the race window is wider.
import { fork } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocate, git } from './numbers.mjs';

const F = 'acme/app';
Object.assign(process.env, { GIT_AUTHOR_NAME: 'spike', GIT_COMMITTER_NAME: 'spike', GIT_AUTHOR_EMAIL: 's@test.invalid', GIT_COMMITTER_EMAIL: 's@test.invalid' });
if (process.argv[2] === 'worker') {
  const [, , , cwd, name, k, think, backoff] = process.argv;
  const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const attempts = [];
  for (let i = 0; i < Number(k); i++) {
    for (let n = 1; ; n++) {
      git(cwd, 'fetch', '-q'); git(cwd, 'reset', '-q', '--keep', '@{u}');
      const seq = allocate(cwd, F, `${name}-${i}`);
      appendFileSync(join(cwd, F, 'index.json'), `${JSON.stringify({ seq, slug: `${seq}-${name}-${i}` })}\n`); // one shared file, as the index is
      git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', `${name} ${i}`);
      try { git(cwd, 'push', '-q'); attempts.push(n); break; } catch { if (backoff === '1') sleep(Math.random() * 50 * 2 ** Math.min(n, 6)); } // lost the race: run again
    }
    if (Number(think)) sleep(Number(think) * (0.5 + Math.random()));
  }
  process.send(attempts);
} else {
  const [teams = 3, writes = 20, think = 0, backoff = 0] = process.argv.slice(2).map(Number);
  const root = mkdtempSync(join(tmpdir(), 'contention-'));
  git(root, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(root, 'clone', '-q', 'origin.git', 'seed'); const seed = join(root, 'seed');
  git(seed, 'commit', '-q', '--allow-empty', '-m', 'base'); git(seed, 'push', '-q', '-u', 'origin', 'main');
  const t0 = Date.now();
  const results = await Promise.all([...Array(teams).keys()].map(n => new Promise(done => {
    git(root, 'clone', '-q', 'origin.git', `t${n}`);
    fork(new URL(import.meta.url).pathname, ['worker', join(root, `t${n}`), `team${n}`, String(writes), String(think), String(backoff)]).on('message', done);
  })));
  const all = results.flat();
  git(seed, 'pull', '-q');
  const files = git(seed, 'ls-files', `${F}/phases`).trim().split('\n');
  const numbers = files.map(f => Number(/\/(\d+)-/.exec(f)[1]));
  console.log(JSON.stringify({ teams, writes_per_team: writes, think_ms: think, backoff: Boolean(backoff), seconds: (Date.now() - t0) / 1000, writes: all.length,
    lost_races: all.reduce((s, n) => s + n - 1, 0), max_attempts: Math.max(...all), distinct_numbers: new Set(numbers).size, items: numbers.length }));
  rmSync(root, { recursive: true, force: true });
  if (existsSync(root)) process.exit(1);
}
