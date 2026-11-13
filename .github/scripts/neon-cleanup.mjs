const { NEON_PROJECT_ID: projectId, NEON_API_KEY: apiKey, PR_NUMBER: prNumber } = process.env;
if (!projectId || !apiKey || !/^\d+$/.test(prNumber ?? '')) {
  throw new Error('Missing Neon cleanup configuration');
}

const targetName = `tablefolk-pr-${prNumber}`;
const base = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches`;
let cursor;
let branch;
do {
  const query = new URLSearchParams({ search: targetName, limit: '100' });
  if (cursor) query.set('cursor', cursor);
  const response = await fetch(`${base}?${query}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Neon branch lookup failed: HTTP ${response.status}`);
  const result = await response.json();
  branch = result.branches?.find(candidate => candidate.name === targetName);
  cursor = result.pagination?.next;
} while (!branch && cursor);

if (!branch) {
  console.log(`No Neon branch for PR #${prNumber}; nothing to remove`);
} else {
  const response = await fetch(`${base}/${encodeURIComponent(branch.id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Neon branch deletion failed: HTTP ${response.status}`);
  console.log(`Removed Neon branch ${targetName}`);
}
