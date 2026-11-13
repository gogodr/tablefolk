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
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const accepted = response.headers?.get?.('x-accepted-github-permissions');
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}${accepted ? ` (accepted GitHub permissions: ${accepted})` : ''}`);
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

function failureBody(error) {
  let trace = error instanceof Error ? (error.stack ?? error.message) : String(error);
  for (const key of ['GH_TOKEN', 'VERCEL_API_TOKEN', 'VERCEL_WEB_TOKEN']) {
    const secret = process.env[key];
    if (secret) trace = trace.replaceAll(secret, '[redacted]');
  }
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

const teamQuery = `teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`;

async function verifyProject(project) {
  console.log(`Checking access to ${project.name}`);
  const settings = await vercel(project, `/v9/projects/${project.id}?${teamQuery}`);
  if (settings.id !== project.id || settings.name !== project.name) {
    throw new Error(`${project.name} token does not resolve the expected Vercel project`);
  }
}

async function deploy(project, { sha, ref, repoId, production, overrides = {}, prId }) {
  const body = {
    name: project.name,
    project: project.id,
    gitSource: { type: 'github', repoId, ref, sha, ...(prId ? { prId } : {}) },
    ...(production ? { target: 'production' } : {}),
    ...(Object.keys(overrides).length ? { env: overrides, build: { env: overrides } } : {}),
    meta: { tablefolkPr: String(prNumber) },
  };
  const created = await vercel(project, `/v13/deployments?${teamQuery}&forceNew=1`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
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
      throw new Error(`${project.name} deployment ${created.id} ${current.readyState}: ${current.errorMessage ?? 'see Vercel build logs'}`);
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
    const webOrigin = `https://tablefolk-web-pr-${prNumber}-${team}.vercel.app`;
    const apiOrigin = `https://tablefolk-api-pr-${prNumber}-${team}.vercel.app`;
    await comment(`✅ Preview already ready for \`${sha.slice(0, 7)}\`.\n\n- Web: ${webOrigin}\n- API: ${apiOrigin}`);
    console.log('This PR commit already has a preview');
    return;
  }
  await Promise.all(projects.map(verifyProject));
  const webOrigin = `https://tablefolk-web-pr-${prNumber}-${team}.vercel.app`;
  const apiOrigin = `https://tablefolk-api-pr-${prNumber}-${team}.vercel.app`;
  const source = { sha, ref: pr.head.ref, repoId: pr.head.repo.id, prId: prNumber };
  const api = await deploy(projects[0], {
    ...source, overrides: { WEB_ORIGIN: webOrigin, PUBLIC_WEB_URL: webOrigin },
  });
  const web = await deploy(projects[1], {
    ...source, overrides: { NEXT_PUBLIC_API_URL: apiOrigin },
  });
  await assignAlias(projects[0], api, apiOrigin);
  await assignAlias(projects[1], web, webOrigin);
  const record = { pr: prNumber, sha, api, web };
  if (previous) {
    await removeDeployment(previous.record.api, projects[0]);
    await removeDeployment(previous.record.web, projects[1]);
  }
  await writeRecord(previous?.comment, record, `✅ Preview deployment succeeded for \`${sha.slice(0, 7)}\`.\n\n- Web: ${webOrigin}\n- API: ${apiOrigin}`);
} else if (process.env.GITHUB_EVENT_NAME === 'pull_request' && event.pull_request.merged) {
  const sha = event.pull_request.merge_commit_sha;
  if (!sha) throw new Error('Merged PR has no merge commit SHA');
  await Promise.all(projects.map(verifyProject));
  const source = {
    sha, ref: 'main', repoId: event.repository.id, production: true,
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
  throw new Error('Unsupported event');
}
}

try {
  await main();
} catch (error) {
  console.error(error);
  if (repo && prNumber && process.env.GH_TOKEN) {
    try {
      await comment(failureBody(error));
    } catch (commentError) {
      console.error('Could not post the failure to the PR:', commentError);
    }
  }
  process.exitCode = 1;
}
