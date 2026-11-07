// The aliases that are several commands in a row (import, archive done). Each step is one published command, run as the CLI
// itself; the first step that fails stops the sequence, and the output says what was done before it.
// shortcut: each step starts a process and pulls the repository again, which is fine for the tens of items an import moves.
import { spawnSync } from 'node:child_process';
import { isFinished, isOpen } from './workflow.js';
import { redact } from './safety.js';

const cli = args => spawnSync(process.execPath, [process.argv[1], ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const say = text => process.stdout.write(`${redact(text)}\n`);
const bySeq = (x, y) => x.seq - y.seq;
function view(args) { // the items of a branch, from the query command
  const r = cli(['query', '--json', ...args]);
  let data = null;
  try { data = JSON.parse(r.stdout || '{}'); } catch { /* reported below */ }
  return r.status === 0 && data ? { data } : { failed: r };
}
function stop(r, text) { // the failing step's own words first, then what was done
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
  say(text);
  return r.status || 1;
}

// plan: { kind: 'import', source, higher } or { kind: 'archive-done' }
export async function run(plan) {
  const here = view([]);
  if (here.failed) return stop(here.failed, 'nothing was changed');
  const branch = here.data.branch;
  if (plan.kind === 'archive-done') {
    const finished = (here.data.phases ?? []).filter(x => isFinished(x.status) && x.status !== 'archived').sort(bySeq);
    if (!finished.length) { say(`ℹ️  nothing to archive: no finished item on branch ${branch ?? '(none)'}`); return 0; }
    const done = [];
    for (const item of finished) {
      const r = cli(['archive', item.slug]);
      if (r.status !== 0) return stop(r, `stopped at ${item.slug}; archived ${done.length} of ${finished.length}${done.length ? `: ${done.join(', ')}` : ''}`);
      done.push(item.slug);
    }
    say(`✅ archived ${done.length} finished item(s): ${done.join(', ')}`);
    return 0;
  }
  if (!branch) { say('❌ import needs a backlog on the current branch'); return 1; }
  if (plan.source === branch) { process.stderr.write(`❌ backlog: import --branch ${redact(plan.source)}: that is the current branch\n`); return 2; }
  const there = view(['--branch', plan.source]);
  if (there.failed) return stop(there.failed, 'nothing was changed');
  const open = (there.data.phases ?? []).filter(x => isOpen(x.status)).sort(bySeq);
  if (!open.length) { // a name that no item carries is most likely a typo: say so (the exit code stays 0, as for a branch without open items)
    const known = view(['--branches']).data;
    say(Array.isArray(known) && known.some(c => c.branch === plan.source) ? `ℹ️  nothing to import: branch ${plan.source} has no open items` : `ℹ️  nothing to import: no item of branch ${plan.source} in this backlog (check the name)`);
    return 0;
  }
  const moved = [];
  for (const item of open) {
    const r = cli(['move', item.slug, '--to-branch', branch]);
    if (r.status !== 0) return stop(r, `stopped at ${item.slug}; moved ${moved.length} of ${open.length}${moved.length ? `: ${moved.join(', ')}` : ''}`);
    moved.push(item.slug);
  }
  if (plan.higher) { // newest first, so that the oldest ends up first in the queue
    const placed = [];
    for (const slug of [...moved].reverse()) {
      const r = cli(['update', slug, '--priority', '0']);
      if (r.status !== 0) return stop(r, `moved ${moved.join(', ')}; stopped placing them first at ${slug} (placed ${placed.length})`);
      placed.push(slug);
    }
  }
  say(`✅ imported ${moved.length} open item(s) of ${plan.source} into ${branch}${plan.higher ? ', first in the queue' : ''}: ${moved.join(', ')}`);
  return 0;
}
