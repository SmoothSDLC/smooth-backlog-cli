import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReleasePullRequest } from '../scripts/verify-release-pr.mjs';

const repository = 'SmoothSDLC/smooth-backlog-cli', commit = 'a'.repeat(40), head = 'b'.repeat(40);
const pr = { number: 1, merged_at: '2026-10-16T12:00:00Z', merge_commit_sha: commit, base: { ref: 'main', repo: { full_name: repository } }, head: { sha: head } };
const success = { run_number: 1, event: 'pull_request', head_sha: head, pull_requests: [{ number: 1 }], status: 'completed', conclusion: 'success' };
const verify = (pulls, runs = [success]) => verifyReleasePullRequest({ repository, commit, request: async path => path.includes('/pulls?') ? pulls : { workflow_runs: runs } });

test('only an exact merged main PR with successful CI authorizes publication', async () => {
  assert.equal(await verify([pr]), 1);
  for (const pulls of [[], [{ ...pr, merged_at: null }], [{ ...pr, merge_commit_sha: 'c'.repeat(40) }], [{ ...pr, base: { ...pr.base, ref: 'other' } }]]) {
    await assert.rejects(verify(pulls), /merged pull request targeting main/);
  }
});

test('missing, pending, failed, or unrelated PR checks block publication', async () => {
  for (const runs of [[], [{ ...success, status: 'in_progress', conclusion: null }], [{ ...success, conclusion: 'failure' }], [{ ...success, event: 'push' }], [{ ...success, head_sha: 'c'.repeat(40) }], [{ ...success, pull_requests: [{ number: 2 }] }]]) {
    await assert.rejects(verify([pr], runs), /successful CI for the final head/);
  }
  await assert.rejects(verify([pr], [success, { ...success, run_number: 2, conclusion: 'failure' }]), /successful CI/);
  assert.equal(await verify([pr], [{ ...success, conclusion: 'failure' }, { ...success, run_number: 2 }]), 1);
});

test('release eligibility checks use the exact main commit and final PR head and fail on API errors', async () => {
  const paths = [];
  assert.equal(await verifyReleasePullRequest({ repository, commit, request: async path => { paths.push(path); return path.includes('/pulls?') ? [pr] : { workflow_runs: [success] }; } }), 1);
  assert.ok(paths[0].includes(`/commits/${commit}/pulls?`));
  assert.ok(paths[1].includes(`/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&`));
  await assert.rejects(verifyReleasePullRequest({ repository, commit, request: async () => { throw new Error('API unavailable'); } }), /API unavailable/);
});
