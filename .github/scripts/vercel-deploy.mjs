import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const required = [
  'GH_TOKEN', 'VERCEL_API_TOKEN', 'VERCEL_WEB_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_API_PROJECT_ID',
  'VERCEL_WEB_PROJECT_ID', 'VERCEL_TEAM_SLUG', 'GITHUB_REPOSITORY',
  'GITHUB_EVENT_PATH', 'GITHUB_EVENT_NAME',
];
const event = JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = event.issue?.number ?? event.pull_request?.number;
const marker = '<!-- tablefolk-vercel-preview -->';
const team = process.env.VERCEL_TEAM_SLUG;
const sourceDir = resolve(process.env.VERCEL_SOURCE_DIR ?? 'deploy-source');
const projects = [
  { name: 'tablefolk-api', rootDirectory: 'apps/api', id: process.env.VERCEL_API_PROJECT_ID, token: process.env.VERCEL_API_TOKEN },
  { name: 'tablefolk-web', rootDirectory: 'apps/web', id: process.env.VERCEL_WEB_PROJECT_ID, token: process.env.VERCEL_WEB_TOKEN },
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
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const accepted = response.headers?.get?.('x-accepted-github-permissions');
    const error = new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}${accepted ? ` (accepted GitHub permissions: ${accepted})` : ''}`);
    error.status = response.status;
    error.retryAfter = response.headers?.get?.('retry-after');
    error.rateLimitReset = response.headers?.get?.('x-ratelimit-reset');
    throw error;
  }
  return body;
}

const github = (path, options) => request('https://api.github.com', path, process.env.GH_TOKEN, {
  ...options,
  headers: { 'X-GitHub-Api-Version': '2022-11-28' },
});
const vercel = (project, path, options) => request('https://api.vercel.com', path, project.token, options);

async function comment(body) {
  await github(`/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  });
}

async function reactToCommand() {
  await github(`/repos/${repo}/issues/comments/${event.comment.id}/reactions`, {
    method: 'POST', body: JSON.stringify({ content: 'eyes' }),
  });
}

function redactSecrets(value) {
  let text = String(value);
  for (const key of ['GH_TOKEN', 'VERCEL_API_TOKEN', 'VERCEL_WEB_TOKEN', 'PREVIEW_DATABASE_URL', 'PREVIEW_DIRECT_URL']) {
    const secret = process.env[key];
    if (secret) text = text.replaceAll(secret, '[redacted]');
  }
  return text;
}

function failureBody(error) {
  let trace = redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error));
  trace = trace.replaceAll('```', "'''\u200b").slice(0, 12_000);
  const action = process.env.GITHUB_RUN_ID
    ? `\n\n[Full workflow logs](https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID})`
    : '';
  return `❌ ${process.env.GITHUB_EVENT_NAME === 'issue_comment' ? 'Preview' : 'Production'} deployment failed.\n\n<details><summary>Stack trace</summary>\n\n\`\`\`text\n${trace}\n\`\`\`\n\n</details>${action}`;
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
  return github(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ body }) });
}

async function deprecateOlderDeploymentComments(currentId) {
  const failures = [];
  for (const previous of await comments()) {
    if (previous.id === currentId) continue;
    let record;
    try { record = readRecord(previous); }
    catch { continue; }
    const successful = previous.user?.login === 'github-actions[bot]' &&
      /Preview deployment succeeded|Preview already ready/.test(previous.body ?? '');
    const inProgress = record && (record.retired || previous.body.includes('Previous preview removed'));
    if (!successful && !inProgress) continue;
    try {
      await github(`/repos/${repo}/issues/comments/${previous.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: 'Deployment deprecated in favour of the most recent one.' }),
      });
    } catch (error) {
      failures.push(`#${previous.id}: ${redactSecrets(error)}`);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

async function removeDeployment(entry, project) {
  if (!entry?.id || !/^dpl_[a-zA-Z0-9]+$/.test(entry.id)) return;
  const path = `/v13/deployments/${entry.id}?teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`;
  let deployment;
  try {
    deployment = await vercel(project, path);
  } catch (error) {
    if (error.status === 404) return;
    throw error;
  }
  if (deployment.projectId !== project.id || `https://${deployment.url}` !== entry.url) {
    throw new Error(`Refusing to remove deployment ${entry.id}: project or URL differs`);
  }
  await vercel(project, path, { method: 'DELETE' });
}

const teamQuery = `teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`;

async function sourceFiles(expectedSha) {
  const actualSha = execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualSha !== expectedSha) throw new Error(`Checked out source is ${actualSha}, expected ${expectedSha}; retry /deploy`);
  const tracked = execFileSync('git', ['-C', sourceDir, 'ls-files', '-z'])
    .toString('utf8').split('\0').filter(Boolean);
  const included = tracked.filter(file =>
    (file.startsWith('apps/') || file.startsWith('packages/') ||
    ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.vercelignore', 'vercel.json'].includes(file)) &&
    !file.split('/').some(part => part === '.env' || part.startsWith('.env.')));
  if (!included.includes('package.json') || !included.includes('pnpm-lock.yaml') || !included.includes('pnpm-workspace.yaml') ||
      !included.some(file => file.startsWith('apps/api/')) || !included.some(file => file.startsWith('apps/web/'))) {
    throw new Error('Checked out source is missing required workspace files');
  }
  const files = [];
  for (const file of included) {
    const absolute = join(sourceDir, file);
    if (!(await lstat(absolute)).isFile()) throw new Error(`Unsupported source entry: ${file}`);
    const contents = await readFile(absolute);
    files.push({ file, sha: createHash('sha1').update(contents).digest('hex'), size: contents.length, contents });
  }
  console.log(`Prepared ${files.length} tracked application files from ${expectedSha}`);
  return files;
}

function migratePreviewDatabase() {
  const directUrl = process.env.PREVIEW_DIRECT_URL;
  const pooledUrl = process.env.PREVIEW_DATABASE_URL;
  if (!directUrl || !pooledUrl) throw new Error('Neon did not return both PR database connection URLs');
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(TOKEN|KEY|SECRET|PASSWORD)/i.test(key) && !key.startsWith('VERCEL_') &&
    !key.startsWith('PREVIEW_') && !key.startsWith('GITHUB_')));
  const runPnpm = (args, env) => {
    try {
      const output = execFileSync('corepack', ['pnpm', ...args], {
        cwd: sourceDir, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      });
      if (output.trim()) console.log(redactSecrets(output.trim()));
    } catch (error) {
      const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').slice(-6000);
      throw new Error(`PR database migration command failed: corepack pnpm ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
    }
  };
  console.log('Installing PR dependencies for database migration');
  runPnpm(['install', '--frozen-lockfile'], safeEnv);
  console.log('Applying PR Prisma migrations to its Neon branch');
  runPnpm(['--filter', '@tablefolk/api', 'db:deploy'], {
    ...safeEnv, DIRECT_URL: directUrl, DATABASE_URL: pooledUrl,
  });
}

async function uploadFiles(project, files) {
  console.log(`Uploading source files for ${project.name}`);
  for (const [index, file] of files.entries()) {
    await vercel(project, `/v2/files?${teamQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size), 'x-vercel-digest': file.sha },
      body: file.contents,
    });
    if ((index + 1) % 25 === 0 || index + 1 === files.length) console.log(`${project.name}: uploaded ${index + 1}/${files.length} files`);
  }
}

async function verifyProject(project) {
  console.log(`Checking access to ${project.name}`);
  const settings = await vercel(project, `/v9/projects/${project.id}?${teamQuery}`);
  if (settings.id !== project.id || settings.name !== project.name) {
    throw new Error(`${project.name} token does not resolve the expected Vercel project`);
  }
}

async function buildLogTail(project, deploymentId) {
  const events = await vercel(project, `/v3/deployments/${deploymentId}/events?${teamQuery}&limit=100&direction=backward`);
  const list = Array.isArray(events) ? events : events?.events;
  if (!Array.isArray(list)) return '';
  return list.slice(0, 30).reverse()
    .map(event => event.text ?? event.payload?.text ?? '')
    .filter(Boolean).join('\n').slice(-6_000);
}

async function deploy(project, { sha, ref, production, overrides = {}, files }) {
  await uploadFiles(project, files);
  const body = {
    name: project.name,
    project: project.id,
    files: files.map(({ file, sha: digest, size }) => ({ file, sha: digest, size })),
    projectSettings: { rootDirectory: project.rootDirectory, sourceFilesOutsideRootDirectory: true },
    gitMetadata: { rootDirectory: '', commitRef: ref, commitSha: sha },
    ...(production ? { target: 'production' } : {}),
    ...(Object.keys(overrides).length ? { env: overrides, build: { env: overrides } } : {}),
    meta: { tablefolkPr: String(prNumber), commitSha: sha, commitRef: ref },
  };
  const retryDeadline = Date.now() + 5 * 60 * 1000;
  let created;
  for (let attempt = 1; ; attempt++) {
    try {
      created = await vercel(project, `/v13/deployments?${teamQuery}&forceNew=1`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      break;
    } catch (error) {
      if (error.status !== 429) throw error;
      const retryAfter = error.retryAfter;
      const headerDelay = retryAfter == null ? NaN : /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : Date.parse(retryAfter) - Date.now();
      const resetDelay = error.rateLimitReset == null ? NaN
        : Number(error.rateLimitReset) * 1000 - Date.now();
      const fallbackDelay = Math.min(30_000 * 2 ** (attempt - 1), 60_000);
      const delay = Number.isFinite(headerDelay) ? Math.max(1_000, headerDelay)
        : Number.isFinite(resetDelay) ? Math.max(1_000, resetDelay)
          : fallbackDelay;
      if (Date.now() + delay >= retryDeadline) {
        throw new Error(`${project.name} deployment creation could not be retried within five minutes; retry /deploy later. Last response: ${error.message}`);
      }
      console.warn(`${project.name} deployment creation rate limited; retrying in ${Math.ceil(delay / 1000)}s (attempt ${attempt + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if (!created.id) throw new Error(`${project.name} deployment response has no ID`);
  console.log(`${project.name} deployment ${created.id} started`);
  const deadline = Date.now() + 18 * 60 * 1000;
  while (Date.now() < deadline) {
    const current = await vercel(project, `/v13/deployments/${created.id}?${teamQuery}`);
    if (current.projectId !== project.id) throw new Error(`Unexpected project for deployment ${created.id}`);
    if (current.readyState === 'READY') {
      if (!/^[a-z0-9.-]+\.vercel\.app$/i.test(current.url)) throw new Error(`Unexpected Vercel URL: ${current.url}`);
      const url = `https://${current.url}`;
      console.log(`${project.name} ${sha}: ${url}`);
      return { id: created.id, url };
    }
    if (['ERROR', 'CANCELED'].includes(current.readyState)) {
      let logs = '';
      try {
        logs = await buildLogTail(project, created.id);
      } catch (logError) {
        console.warn(`Could not retrieve ${project.name} build logs: ${logError}`);
      }
      throw new Error(`${project.name} deployment ${created.id} ${current.readyState}: ${current.errorMessage ?? 'see Vercel build logs'}${logs ? `\n\nRecent Vercel build logs:\n${logs}` : ''}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error(`${project.name} deployment ${created.id} did not finish within 18 minutes`);
}

async function assignAlias(project, deployment, origin) {
  await vercel(project, `/v2/deployments/${deployment.id}/aliases?${teamQuery}`, {
    method: 'POST',
    body: JSON.stringify({ alias: new URL(origin).host }),
  });
  console.log(`${project.name} preview alias ready: ${origin}`);
}

async function authorizePreviewCommand() {
  if (!process.env.GH_TOKEN || !repo || !prNumber) throw new Error('Missing GitHub preview context');
  const actor = encodeURIComponent(event.comment.user.login);
  const access = await github(`/repos/${repo}/collaborators/${actor}/permission`);
  if (!['admin', 'maintain', 'write'].includes(access.permission)) {
    throw new Error('Only repository collaborators with write access may deploy previews');
  }
  const pr = await github(`/repos/${repo}/pulls/${prNumber}`);
  if (pr.state !== 'open' || pr.base.ref !== 'main') throw new Error('The PR must be open against main');
  if (pr.head.repo?.full_name !== repo) throw new Error('Fork PR previews are not supported');
  return pr;
}

async function main() {
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
if (process.env.GITHUB_EVENT_NAME === 'issue_comment') {
  try {
    await reactToCommand();
    console.log(`Acknowledged /deploy on PR #${prNumber}`);
  } catch (reactionError) {
    console.warn(`Could not react to /deploy on PR #${prNumber}: ${reactionError}`);
  }
  const pr = await authorizePreviewCommand();
  const sha = pr.head.sha;
  const previous = await findRecord();
  await Promise.all(projects.map(verifyProject));
  const files = await sourceFiles(sha);
  if (!process.env.PREVIEW_DIRECT_URL || !process.env.PREVIEW_DATABASE_URL) {
    throw new Error('Neon PR branch setup failed or returned no connection URLs; check the Neon setup steps in this workflow');
  }
  if (previous?.record.api || previous?.record.web) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
    await writeRecord(previous.comment, { pr: prNumber, retired: previous.record.sha ?? previous.record.retired ?? 'unknown' }, 'Previous preview removed. A new deployment is in progress.');
    console.log(`Removed previous deployments for PR #${prNumber}`);
  }
  migratePreviewDatabase();
  const webOrigin = `https://tablefolk-web-pr-${prNumber}-${team}.vercel.app`;
  const apiOrigin = `https://tablefolk-api-pr-${prNumber}-${team}.vercel.app`;
  const source = { sha, ref: pr.head.ref, files };
  let api;
  let web;
  try {
    api = await deploy(projects[0], {
      ...source, overrides: {
        WEB_ORIGIN: webOrigin, PUBLIC_WEB_URL: webOrigin,
        DATABASE_URL: process.env.PREVIEW_DATABASE_URL,
        DATABASE_URL_POOLED: process.env.PREVIEW_DATABASE_URL,
        DIRECT_URL: process.env.PREVIEW_DIRECT_URL,
        DATABASE_URL_UNPOOLED: process.env.PREVIEW_DIRECT_URL,
        POSTGRES_URL_NON_POOLING: process.env.PREVIEW_DIRECT_URL,
      },
    });
    web = await deploy(projects[1], {
      ...source, overrides: { NEXT_PUBLIC_API_URL: apiOrigin },
    });
    await assignAlias(projects[0], api, apiOrigin);
    await assignAlias(projects[1], web, webOrigin);
    const record = { pr: prNumber, sha, api, web };
    const latest = await writeRecord(undefined, record, `✅ Preview deployment succeeded for \`${sha.slice(0, 7)}\`.\n\n- Web: ${webOrigin}\n- API: ${apiOrigin}`);
    try {
      await deprecateOlderDeploymentComments(latest.id);
    } catch (commentError) {
      console.warn(`Preview succeeded, but older deployment comments could not all be updated: ${redactSecrets(commentError)}`);
    }
  } catch (error) {
    for (const [entry, project] of [[api, projects[0]], [web, projects[1]]]) {
      if (entry) {
        try { await removeDeployment(entry, project); }
        catch (cleanupError) { console.warn(`Could not remove partial ${project.name} preview: ${redactSecrets(cleanupError)}`); }
      }
    }
    throw error;
  }
} else if (process.env.GITHUB_EVENT_NAME === 'pull_request' && event.pull_request.merged) {
  const sha = event.pull_request.merge_commit_sha;
  if (!sha) throw new Error('Merged PR has no merge commit SHA');
  await Promise.all(projects.map(verifyProject));
  const files = await sourceFiles(sha);
  const source = {
    sha, ref: 'main', production: true, files,
  };
  await deploy(projects[0], source);
  await deploy(projects[1], source);
  const previous = await findRecord();
  if (previous) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
    await writeRecord(previous.comment, { pr: prNumber, merged: sha }, 'Merged into main. The PR preview was removed after production deployment.');
  }
} else {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') throw new Error('Unsupported event');
  const previous = await findRecord();
  if (previous) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
    await writeRecord(previous.comment, { pr: prNumber, closed: true }, 'PR closed. The preview was removed.');
  }
}
}

try {
  if (process.argv.includes('--authorize-preview')) await authorizePreviewCommand();
  else await main();
} catch (error) {
  console.error(failureBody(error));
  if (repo && prNumber && process.env.GH_TOKEN) {
    try {
      await comment(failureBody(error));
    } catch (commentError) {
      console.error('Could not post the failure to the PR:', commentError);
    }
  }
  process.exitCode = 1;
}
