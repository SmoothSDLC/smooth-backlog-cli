#!/usr/bin/env node
// 097 (slice B of 050): the shared-store clean guard.
// Proves that a wrapped command (default: npm test) leaves the shared backlog store's git status and
// HEAD unchanged. The store is found by the CLI's own discovery (resolveHome in src/shared/store.js):
// BACKLOG_HOME, then the repository's .smooth-backlog.json, then the per-user record, then ~/git/<name>.
// No path of the store is committed in this script; the resolved folder is printed at run time.
//
// Usage: node .agents/scripts/check-real-backlog-clean.mjs [-- <command>]
//
// The wrapped command runs exactly once (no retry) and only when the store is clean before. Any change
// of status or HEAD during the run is reported as a changed store - run the guard while no other
// session writes to the store, and in a quiet period the result is repeatable. A git failure on the
// store is reported as unreadable. The final line of stdout is one JSON object:
// {"store":"unchanged|changed|dirty-before|unreadable","command_exit":<code|null>}; the exit code is 0
// only when the store is unchanged and the command exited 0.
import { spawnSync } from 'node:child_process';
import { resolveHome } from '../../src/shared/store.js';

const USAGE = 'Usage: node .agents/scripts/check-real-backlog-clean.mjs [-- <command>]\n'
  + 'Runs <command> (default: npm test) exactly once and proves the shared backlog store is left clean:\n'
  + 'it records the store git status and HEAD before the run, refuses to start on a store that is not\n'
  + 'clean, and reports any change of status or HEAD during the run as a changed store. The store is\n'
  + 'found by the CLI own discovery (BACKLOG_HOME, the repository config, the per-user record,\n'
  + '~/git/<name>). Run it while no other session writes to the store. The final stdout line is one\n'
  + 'JSON object; the exit code is 0 only when the store is unchanged and the command exited 0.';

const args = process.argv.slice(2);
if (args.includes('--help')) { process.stdout.write(`${USAGE}\n`); process.exit(0); }
const dash = args.indexOf('--');
const command = dash === -1 ? 'npm test' : args.slice(dash + 1).join(' ');
if (!command) { process.stdout.write(`${USAGE}\n`); process.exit(1); }

const git = (home, ...gargs) => spawnSync('git', ['-C', home, ...gargs], { encoding: 'utf8' });
const finish = (store, commandExit, extra = '') => {
  if (extra) process.stdout.write(`${extra}\n`);
  process.stdout.write(`${JSON.stringify({ store, command_exit: commandExit })}\n`);
  process.exit(store === 'unchanged' && commandExit === 0 ? 0 : 1);
};

const { home, ask } = resolveHome();
process.stdout.write(`store: ${home}\n`);
if (ask) {
  process.stderr.write(`store unreadable: ${ask.text}\n`);
  finish('unreadable', null);
}
const statusBefore = git(home, 'status', '--porcelain=v1', '-z');
if (statusBefore.status !== 0) {
  process.stderr.write(`git status failed: ${String(statusBefore.stderr || statusBefore.stdout).trim()}\n`);
  finish('unreadable', null);
}
if (statusBefore.stdout !== '') {
  finish('dirty-before', null, `dirty store before the run (the command was not run): ${String(statusBefore.stdout).split(/\0|\n/).filter(Boolean).join(', ')}`);
}
const headBefore = git(home, 'rev-parse', 'HEAD');
if (headBefore.status !== 0) {
  process.stderr.write(`git rev-parse HEAD failed: ${String(headBefore.stderr || '').trim()}\n`);
  finish('unreadable', null);
}

// the wrapped command, exactly once, no retry
const ran = spawnSync(command, { shell: true, cwd: process.cwd(), stdio: 'inherit' });
const commandExit = ran.status ?? 1;

const statusAfter = git(home, 'status', '--porcelain=v1', '-z');
if (statusAfter.status !== 0) {
  process.stderr.write(`git status failed after the run: ${String(statusAfter.stderr || '').trim()}\n`);
  finish('unreadable', commandExit);
}
const headAfter = git(home, 'rev-parse', 'HEAD');
if (headAfter.status !== 0) {
  process.stderr.write(`git rev-parse HEAD failed after the run: ${String(headAfter.stderr || '').trim()}\n`);
  finish('unreadable', commandExit);
}

const changedPaths = String(statusAfter.stdout).split(/\0|\n/).filter(Boolean);
const headMoved = headAfter.stdout !== headBefore.stdout;
if (changedPaths.length || headMoved) {
  let extra = '';
  if (changedPaths.length) extra += `store changed: ${changedPaths.join(', ')}\n`;
  if (headMoved) extra += `head: ${String(headBefore.stdout).trim()}..${String(headAfter.stdout).trim()}\n`;
  finish('changed', commandExit, extra.trim());
}
finish('unchanged', commandExit);
