import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  'GH_TOKEN', 'VERCEL_API_TOKEN', 'VERCEL_WEB_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_API_PROJECT_ID',
  'VERCEL_WEB_PROJECT_ID', 'VERCEL_TEAM_SLUG', 'GITHUB_REPOSITORY',
  'GITHUB_EVENT_PATH', 'GITHUB_EVENT_NAME',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const event = JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repo = process.env.GITHUB_REPOSITORY;
const [owner, name] = repo.split('/');
const prNumber = event.issue?.number ?? event.pull_request?.number;
const marker = '<!-- tablefolk-vercel-preview -->';
const team = process.env.VERCEL_TEAM_SLUG;
const projects = [
  { name: 'tablefolk-api', id: process.env.VERCEL_API_PROJECT_ID, token: process.env.VERCEL_API_TOKEN },
  { name: 'tablefolk-web', id: process.env.VERCEL_WEB_PROJECT_ID, token: process.env.VERCEL_WEB_TOKEN },
];

async function request(base, path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const github = (path, options) => request('https://api.github.com', path, process.env.GH_TOKEN, {
  ...options,
  headers: { 'X-GitHub-Api-Version': '2022-11-28' },
});
const vercel = (project, path, options) => request('https://api.vercel.com', path, project.token, options);

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options }).trim();
}

async function comments() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await github(`/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

function readRecord(comment) {
  if (!comment?.body?.startsWith(marker) || comment.user?.login !== 'github-actions[bot]') return null;
  const match = comment.body.match(/<!-- preview-record:(\{[^\n]*\}) -->/);
  if (!match) return null;
  const record = JSON.parse(match[1]);
  return record.pr === prNumber ? record : null;
}

async function findRecord() {
  for (const comment of (await comments()).reverse()) {
    const record = readRecord(comment);
    if (record) return { comment, record };
  }
  return null;
}

async function writeRecord(existing, record, message) {
  const body = `${marker}\n${message}\n\n<!-- preview-record:${JSON.stringify(record)} -->`;
  const path = existing
    ? `/repos/${repo}/issues/comments/${existing.id}`
    : `/repos/${repo}/issues/${prNumber}/comments`;
  await github(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ body }) });
}

async function removeDeployment(entry, project) {
  if (!entry?.id || !/^dpl_[a-zA-Z0-9]+$/.test(entry.id)) return;
  const path = `/v13/deployments/${entry.id}?teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`;
  const deployment = await vercel(project, path);
  if (deployment.projectId !== project.id || `https://${deployment.url}` !== entry.url) {
    throw new Error(`Refusing to remove deployment ${entry.id}: project or URL differs`);
  }
  await vercel(project, path, { method: 'DELETE' });
}

function deploy(project, sha, production, overrides = []) {
  const linkDirectory = resolve('source/.vercel');
  mkdirSync(linkDirectory, { recursive: true });
  writeFileSync(resolve(linkDirectory, 'project.json'), JSON.stringify({
    orgId: process.env.VERCEL_ORG_ID,
    projectId: project.id,
  }));
  const args = ['deploy', '--yes', '--token', project.token, '--scope', team];
  if (production) args.push('--prod');
  for (const [key, value] of overrides) {
    args.push('--env', `${key}=${value}`, '--build-env', `${key}=${value}`);
  }
  const url = run('vercel', args, {
    cwd: resolve('source'),
    env: {
      ...process.env,
      GH_TOKEN: '',
      VERCEL_API_TOKEN: '',
      VERCEL_WEB_TOKEN: '',
      VERCEL_PROJECT_ID: project.id,
      VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
    },
    timeout: 18 * 60 * 1000,
  });
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(url)) throw new Error(`Unexpected Vercel URL: ${url}`);
  console.log(`${project.name} ${sha}: ${url}`);
  return { url };
}

async function identifyDeployment(entry, project) {
  const host = new URL(entry.url).host;
  const deployment = await vercel(project, `/v13/deployments/${host}?teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`);
  if (deployment.projectId !== project.id) throw new Error(`Unexpected project for ${host}`);
  return { ...entry, id: deployment.id };
}

function sourceAt(sha) {
  mkdirSync('source', { recursive: true });
  run('git', ['init'], { cwd: 'source' });
  run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], { cwd: 'source' });
  const credentials = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
  run('git', [
    '-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${credentials}`,
    'fetch', '--depth=1', 'origin', sha,
  ], { cwd: 'source', timeout: 120_000 });
  run('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: 'source' });
  if (run('git', ['rev-parse', 'HEAD'], { cwd: 'source' }) !== sha) throw new Error('Fetched commit differs from the PR commit');
}

if (process.env.GITHUB_EVENT_NAME === 'issue_comment') {
  const actor = encodeURIComponent(event.comment.user.login);
  const access = await github(`/repos/${repo}/collaborators/${actor}/permission`);
  if (!['admin', 'maintain', 'write'].includes(access.permission)) {
    throw new Error('Only repository collaborators with write access may deploy previews');
  }
  const pr = await github(`/repos/${repo}/pulls/${prNumber}`);
  if (pr.state !== 'open' || pr.base.ref !== 'main') throw new Error('The PR must be open against main');
  if (pr.head.repo?.full_name !== repo) throw new Error('Fork PR previews are not supported');
  const sha = pr.head.sha;
  const previous = await findRecord();
  if (previous?.record.sha === sha) {
    console.log('This PR commit already has a preview');
    process.exit(0);
  }
  sourceAt(sha);
  const webOrigin = `https://tablefolk-web-pr-${prNumber}-${team}.vercel.app`;
  const apiOrigin = `https://tablefolk-api-pr-${prNumber}-${team}.vercel.app`;
  const api = await identifyDeployment(
    deploy(projects[0], sha, false, [['WEB_ORIGIN', webOrigin], ['PUBLIC_WEB_URL', webOrigin]]),
    projects[0],
  );
  const web = await identifyDeployment(
    deploy(projects[1], sha, false, [['NEXT_PUBLIC_API_URL', apiOrigin]]),
    projects[1],
  );
  run('vercel', ['alias', 'set', api.url, new URL(apiOrigin).host, '--token', projects[0].token, '--scope', team]);
  run('vercel', ['alias', 'set', web.url, new URL(webOrigin).host, '--token', projects[1].token, '--scope', team]);
  const record = { pr: prNumber, sha, api, web };
  await writeRecord(previous?.comment, record, `Preview ready for \`${sha.slice(0, 7)}\`:\n\n- Web: ${webOrigin}\n- API: ${apiOrigin}`);
  if (previous) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
  }
} else if (process.env.GITHUB_EVENT_NAME === 'pull_request' && event.pull_request.merged) {
  const sha = event.pull_request.merge_commit_sha;
  if (!sha) throw new Error('Merged PR has no merge commit SHA');
  sourceAt(sha);
  deploy(projects[0], sha, true);
  deploy(projects[1], sha, true);
  const previous = await findRecord();
  if (previous) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
    await writeRecord(previous.comment, { pr: prNumber, merged: sha }, 'Merged into main. The PR preview was removed after production deployment.');
  }
} else {
  throw new Error('Unsupported event');
}
