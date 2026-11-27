import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('GET /api/locations/search returns empty results for queries shorter than 2 chars', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/locations/search?q=a`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const json = (await res.json()) as { results: unknown[] };
    assert.deepEqual(json.results, []);
  });
});

test('GET /api/locations/reverse rejects missing or out-of-range coordinates with 400', async () => {
  await withServer(async (baseUrl) => {
    const res1 = await fetch(`${baseUrl}/api/locations/reverse`);
    assert.equal(res1.status, 400);

    const res2 = await fetch(`${baseUrl}/api/locations/reverse?lat=120&lon=10`);
    assert.equal(res2.status, 400);
  });
});

test('GET /api/air-quality rejects invalid coordinates with 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/air-quality?lat=notanumber&lon=0`);
    assert.equal(res.status, 400);
  });
});

test('POST /api/assistant/plan validates required payload fields with 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/assistant/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes('required'));
  });
});

test('POST /api/assistant/chat rejects empty messages with 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes('empty'));
  });
});
