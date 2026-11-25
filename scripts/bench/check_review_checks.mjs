/**
 * Prevent preview publishing from relying on stale or unrelated green checks.
 * The offline image review artifact may exist independently; live staging
 * requires exact-head successful app review AND full 48-look photometry.
 */
import { fileURLToPath } from 'node:url';

export const REQUIRED_CHECKS = [
  'Try-on review',
  'Catalog pale-lid photometry',
  'Public glitter calibration',
  'Public brow shape calibration',
  'Public blush calibration',
];

export function evaluateRequiredChecks(runs, headSha, names = REQUIRED_CHECKS) {
  if (!/^[0-9a-f]{40}$/.test(headSha))
    throw new Error('Invalid 40-character commit SHA for preview review gate');
  if (!Array.isArray(runs))
    throw new Error('GitHub workflow-run response was not an array');
  const results = [];
  for (const name of names) {
    const matches = runs.filter(run =>
      run.head_sha === headSha &&
      run.name === name &&
      run.event === 'pull_request'
    );
    // A newer failed attempt supersedes an older green attempt on the
    // same SHA; never cherry-pick an earlier successful run.
    matches.sort((a, b) => (b.id || 0) - (a.id || 0));
    const latest = matches[0];
    if (!latest) {
      results.push({ name, state: 'pending', reason: 'missing exact-head PR run' });
    } else if (latest.status !== 'completed') {
      results.push({ name, state: 'pending', reason: String(latest.status), id: latest.id });
    } else if (latest.conclusion !== 'success') {
      results.push({
        name, state: 'failed', reason: String(latest.conclusion),
        id: latest.id,
      });
    } else {
      results.push({ name, state: 'passed', id: latest.id });
    }
  }
  return {
    headSha,
    checks: results,
    passed: results.every(x => x.state === 'passed'),
    failed: results.some(x => x.state === 'failed'),
  };
}

async function pollExactHead() {
  const sha = process.env.HBEAUTY_PREVIEW_HEAD_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !token)
    throw new Error('Missing exact PR head SHA, repository or authorized GitHub Actions token');

  const url = 'https://api.github.com/repos/' + repo +
    '/actions/runs?head_sha=' + encodeURIComponent(sha) +
    '&event=pull_request&per_page=100';
  const maxAttempts = 180;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error('GitHub Actions gate read failed: HTTP ' + response.status);
    const body = await response.json();
    const state = evaluateRequiredChecks(body.workflow_runs, sha);
    console.log('EXACT_HEAD_REVIEW_GATE ' + JSON.stringify(state));
    if (state.failed) throw new Error('A required exact-head workflow failed or was cancelled');
    if (state.passed) return;
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  }
  throw new Error('Timed out before all required checks completed on exact PR head SHA');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL('file://' + process.argv[1]))) {
  pollExactHead().catch(err => {
    console.error('Refusing research preview deployment:', err.message);
    process.exitCode = 1;
  });
}
