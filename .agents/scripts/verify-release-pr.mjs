import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function githubRequest(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `GitHub release eligibility check failed (HTTP ${response.status})`);
  return response.json();
}

export async function verifyReleasePullRequest({ repository, commit, token, request = githubRequest }) {
  assert.match(repository || '', /^[\w.-]+\/[\w.-]+$/, 'GitHub repository is required');
  assert.match(commit || '', /^[0-9a-f]{40}$/i, 'Release commit SHA is required');
  const base = `/repos/${repository}`;
  const pulls = await request(`${base}/commits/${commit}/pulls?per_page=100`, token);
  const pr = pulls.find(pr => pr.merged_at && pr.base.ref === 'main' && pr.base.repo.full_name === repository && pr.merge_commit_sha === commit);
  assert.ok(pr, 'Publication requires a merged pull request targeting main for this exact commit; direct pushes cannot publish');
  const result = await request(`${base}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`, token);
  const runs = result.workflow_runs.filter(run => run.head_sha === pr.head.sha && run.event === 'pull_request' && run.pull_requests.some(pull => pull.number === pr.number));
  runs.sort((a, b) => b.run_number - a.run_number);
  const latest = runs[0];
  assert.ok(latest?.status === 'completed' && latest.conclusion === 'success', `Publication requires successful CI for the final head of PR #${pr.number}`);
  return pr.number;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyReleasePullRequest({ repository: process.env.GITHUB_REPOSITORY, commit: process.env.GITHUB_SHA, token: process.env.GH_TOKEN })
    .then(number => console.log(`Release authorized by merged PR #${number} with successful CI`))
    .catch(error => { process.stderr.write(`Release blocked: ${error.message}\n`); process.exitCode = 1; });
}
