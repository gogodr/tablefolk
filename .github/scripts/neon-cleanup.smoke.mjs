import assert from 'node:assert/strict';

Object.assign(process.env, {
  NEON_PROJECT_ID: 'preview-project', NEON_API_KEY: 'test-key', PR_NUMBER: '1',
});

const calls = [];
let branches = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method ?? 'GET' });
  if (options.method === 'DELETE') return { ok: true, status: 200 };
  return { ok: true, status: 200, json: async () => ({ branches }) };
};

await import('./neon-cleanup.mjs?missing');
assert.equal(calls.length, 1);
assert.equal(calls[0].method, 'GET');
calls.length = 0;
branches = [
  { id: 'br-other', name: 'tablefolk-pr-10' },
  { id: 'br-one', name: 'tablefolk-pr-1' },
];
await import('./neon-cleanup.mjs?present');
assert.equal(calls[1].method, 'DELETE');
assert.match(calls[1].url, /\/branches\/br-one$/);
console.log('Neon cleanup smoke test passed');
