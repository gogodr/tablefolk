import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const eventPath = '.github/scripts/.preview-smoke-event.json';
const sourceDir = process.cwd();
const sourceSha = 'a'.repeat(40);
const commands = [];
childProcess.execFileSync = (_command, args, options) => args.includes('rev-parse')
  ? sourceSha
  : _command === 'corepack'
    ? (commands.push({ args, env: options.env }), '')
    : Buffer.from('package.json\0pnpm-lock.yaml\0pnpm-workspace.yaml\0apps/api/package.json\0apps/web/package.json\0');
syncBuiltinESMExports();
writeFileSync(eventPath, JSON.stringify({
  issue: { number: 1 },
  comment: { id: 42, user: { login: 'gogodr' } },
}));

Object.assign(process.env, {
  GH_TOKEN: 'github-test',
  VERCEL_API_TOKEN: 'api-test',
  VERCEL_WEB_TOKEN: 'web-test',
  VERCEL_ORG_ID: 'team_test',
  VERCEL_API_PROJECT_ID: 'prj_api',
  VERCEL_WEB_PROJECT_ID: 'prj_web',
  VERCEL_TEAM_SLUG: 'gogodr',
  GITHUB_REPOSITORY: 'gogodr/tablefolk',
  GITHUB_EVENT_PATH: eventPath,
  GITHUB_EVENT_NAME: 'issue_comment',
  VERCEL_SOURCE_DIR: sourceDir,
  PREVIEW_DATABASE_URL: 'postgresql://preview:pooled@preview-pooler.test/db',
  PREVIEW_DIRECT_URL: 'postgresql://preview:direct@preview.test/db',
});

const calls = [];
let failDeployment = false;
let failReaction = false;
let rateLimitOnce = false;
let failBuild = false;
let previousRecord = null;
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const token = options.headers.Authorization;
  const body = options.body && options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : null;
  calls.push({ path, token, body, headers: options.headers, method: options.method ?? 'GET' });
  let result;
  if (path.endsWith('/comments/42/reactions') && failReaction) {
    return { ok: false, status: 403, text: async () => JSON.stringify({ message: 'Resource not accessible by integration' }) };
  }
  else if (path.endsWith('/comments/42/reactions')) result = { content: 'eyes' };
  else if (path.endsWith('/collaborators/gogodr/permission')) result = { permission: 'admin' };
  else if (path.endsWith('/pulls/1')) result = {
    state: 'open', base: { ref: 'main' },
    head: { sha: sourceSha, ref: 'feature', repo: { full_name: 'gogodr/tablefolk', id: 123 } },
  };
  else if (path.endsWith('/issues/1/comments')) result = options.method === 'POST' ? { id: 1 } : previousRecord ?? [];
  else if (path.endsWith('/issues/comments/97')) result = { id: 97 };
  else if (path.endsWith('/issues/comments/98')) result = { id: 98 };
  else if (path.endsWith('/issues/comments/99')) result = { id: 99 };
  else if (path.endsWith('/projects/prj_api')) result = { id: 'prj_api', name: 'tablefolk-api' };
  else if (path.endsWith('/projects/prj_web')) result = { id: 'prj_web', name: 'tablefolk-web' };
  else if (path === '/v2/files') result = {};
  else if (path === '/v13/deployments' && body?.project === 'prj_api' && rateLimitOnce) {
    rateLimitOnce = false;
    return { ok: false, status: 429, headers: { get: name => name === 'retry-after' ? '0' : null }, text: async () => JSON.stringify({ error: { code: 'rate_limited', message: 'GitHub API rate limit exceeded' } }) };
  }
  else if (path === '/v13/deployments' && body?.project === 'prj_api' && failDeployment) {
    return { ok: false, status: 403, text: async () => JSON.stringify({ error: 'bad api-test token' }) };
  }
  else if (path === '/v13/deployments' && body?.project === 'prj_api') result = { id: 'dpl_api' };
  else if (path === '/v13/deployments' && body?.project === 'prj_web') result = { id: 'dpl_web' };
  else if (path.endsWith('/dpl_api')) result = { projectId: 'prj_api', readyState: failBuild ? 'ERROR' : 'READY', url: 'api-test.vercel.app', errorMessage: 'install failed' };
  else if (path.endsWith('/dpl_oldapi')) result = { projectId: 'prj_api', url: 'old-api.vercel.app' };
  else if (path.endsWith('/dpl_oldweb')) result = { projectId: 'prj_web', url: 'old-web.vercel.app' };
  else if (path.endsWith('/dpl_api/events')) result = [{ text: 'ERR_PNPM_EXAMPLE package install failed' }];
  else if (path.endsWith('/dpl_web')) result = { projectId: 'prj_web', readyState: 'READY', url: 'web-test.vercel.app' };
  else if (path.endsWith('/aliases')) result = { alias: body.alias };
  else throw new Error(`Unexpected request ${url}`);
  return { ok: true, status: 200, text: async () => JSON.stringify(result) };
};

try {
  await import('./vercel-deploy.mjs');
  for (const call of calls) {
    if (call.path.includes('prj_api') || call.path.includes('dpl_api')) assert.equal(call.token, 'Bearer api-test');
    if (call.path.includes('prj_web') || call.path.includes('dpl_web')) assert.equal(call.token, 'Bearer web-test');
  }
  const api = calls.find(call => call.body?.project === 'prj_api').body;
  const web = calls.find(call => call.body?.project === 'prj_web').body;
  assert.equal(api.meta.commitSha, sourceSha);
  assert.equal(api.gitSource, undefined);
  assert.equal(api.files.length, 5);
  assert.equal(calls.filter(call => call.path === '/v2/files').length, 2 * api.files.length);
  assert.ok(api.files.some(file => file.file === 'pnpm-lock.yaml'));
  assert.equal(api.projectSettings.rootDirectory, 'apps/api');
  assert.equal(api.projectSettings.sourceFilesOutsideRootDirectory, true);
  assert.equal(api.gitMetadata.rootDirectory, '');
  assert.equal(web.projectSettings.rootDirectory, 'apps/web');
  assert.equal(api.env.WEB_ORIGIN, 'https://tablefolk-web-pr-1-gogodr.vercel.app');
  assert.equal(api.env.DATABASE_URL_POOLED, process.env.PREVIEW_DATABASE_URL);
  assert.equal(api.env.DIRECT_URL, process.env.PREVIEW_DIRECT_URL);
  assert.equal(web.env.DATABASE_URL, undefined);
  assert.equal(commands.filter(command => command.args.includes('db:deploy')).length, 1);
  assert.equal(commands[0].env.GH_TOKEN, undefined);
  assert.equal(commands[0].env.VERCEL_API_TOKEN, undefined);
  assert.equal(commands[0].env.DIRECT_URL, undefined);
  assert.equal(commands[1].env.DIRECT_URL, process.env.PREVIEW_DIRECT_URL);
  assert.equal(web.build.env.NEXT_PUBLIC_API_URL, 'https://tablefolk-api-pr-1-gogodr.vercel.app');
  assert.equal(calls.filter(call => call.path.endsWith('/aliases')).length, 2);
  assert.equal(calls.find(call => call.path.endsWith('/comments/42/reactions')).body.content, 'eyes');
  const success = calls.find(call => call.path.endsWith('/issues/1/comments') && call.body?.body);
  assert.match(success.body.body, /Preview deployment succeeded/);
  assert.match(success.body.body, /https:\/\/tablefolk-web-pr-1-gogodr\.vercel\.app/);
  calls.length = 0;
  previousRecord = [
    {
      id: 97, user: { login: 'github-actions[bot]' },
      body: '✅ Preview deployment succeeded for an older revision.\n\n- Web: https://old.example',
    },
    {
      id: 98, user: { login: 'github-actions[bot]' },
      body: `<!-- tablefolk-vercel-preview -->\nPreview deployment succeeded.\n<!-- preview-record:${JSON.stringify({ pr: 1, sha: 'b'.repeat(40) })} -->`,
    },
    {
      id: 99, user: { login: 'github-actions[bot]' },
      body: `<!-- tablefolk-vercel-preview -->\nPreview deployment succeeded.\n<!-- preview-record:${JSON.stringify({
        pr: 1, sha: sourceSha,
        api: { id: 'dpl_oldapi', url: 'https://old-api.vercel.app' },
        web: { id: 'dpl_oldweb', url: 'https://old-web.vercel.app' },
      })} -->`,
    },
  ];
  await import('./vercel-deploy.mjs?redeploy');
  const firstNewDeployment = calls.findIndex(call => call.path === '/v13/deployments' && call.body?.project === 'prj_api');
  assert.ok(firstNewDeployment > calls.findIndex(call => call.path.endsWith('/dpl_oldweb') && call.method === 'DELETE'));
  assert.equal(calls.filter(call => call.path.endsWith('/dpl_oldapi') && call.method === 'DELETE').length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/dpl_oldweb') && call.method === 'DELETE').length, 1);
  const newSuccessIndex = calls.findIndex(call => call.path.endsWith('/issues/1/comments') && call.method === 'POST' && /Preview deployment succeeded/.test(call.body?.body ?? ''));
  assert.ok(newSuccessIndex > firstNewDeployment);
  for (const id of [97, 98, 99]) {
    const deprecatedIndex = calls.findIndex(call => call.path.endsWith(`/issues/comments/${id}`) && call.body?.body === 'Deployment deprecated in favour of the most recent one.');
    assert.ok(deprecatedIndex > newSuccessIndex);
  }
  previousRecord = null;
  calls.length = 0;
  rateLimitOnce = true;
  await import('./vercel-deploy.mjs?rate-limit');
  assert.equal(calls.filter(call => call.path === '/v13/deployments' && call.body?.project === 'prj_api').length, 2);
  assert.match(calls.find(call => call.path.endsWith('/issues/1/comments') && call.body?.body).body.body, /Preview deployment succeeded/);
  calls.length = 0;
  failBuild = true;
  const originalBuildError = console.error;
  console.error = () => {};
  try {
    await import('./vercel-deploy.mjs?build-failure');
  } finally {
    console.error = originalBuildError;
  }
  const buildFailure = calls.find(call => call.path.endsWith('/issues/1/comments') && call.body?.body);
  assert.match(buildFailure.body.body, /ERR_PNPM_EXAMPLE/);
  calls.length = 0;
  failBuild = false;
  process.exitCode = 0;
  failDeployment = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    await import('./vercel-deploy.mjs?failure');
  } finally {
    console.error = originalError;
  }
  const failure = calls.find(call => call.path.endsWith('/issues/1/comments') && call.body?.body);
  assert.match(failure.body.body, /Preview deployment failed/);
  assert.match(failure.body.body, /Stack trace/);
  assert.doesNotMatch(failure.body.body, /api-test/);
  calls.length = 0;
  failDeployment = false;
  failReaction = true;
  process.exitCode = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await import('./vercel-deploy.mjs?reaction-failure');
  } finally {
    console.warn = originalWarn;
  }
  assert.match(calls.find(call => call.path.endsWith('/issues/1/comments') && call.body?.body).body.body, /Preview deployment succeeded/);
  calls.length = 0;
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1, merged: true, merge_commit_sha: sourceSha } }));
  process.env.GITHUB_EVENT_NAME = 'pull_request';
  await import('./vercel-deploy.mjs?merge');
  assert.equal(calls.filter(call => call.path === '/v13/deployments' && call.body?.target === 'production').length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/aliases')).length, 0);
  console.log('Preview API smoke test passed');
} finally {
  process.exitCode = 0;
  unlinkSync(eventPath);
}
