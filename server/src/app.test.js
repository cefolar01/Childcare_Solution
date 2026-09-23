import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createDatabase } from './db.js';

/** Spin up the app on an ephemeral port backed by an in-memory database. */
async function startTestServer() {
  const db = createDatabase(':memory:');
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

test('health endpoint reports ok', async () => {
  const srv = await startTestServer();
  try {
    const res = await fetch(`${srv.base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally {
    await srv.close();
  }
});

test('seeded children are returned', async () => {
  const srv = await startTestServer();
  try {
    const res = await fetch(`${srv.base}/api/children`);
    const body = await res.json();
    assert.equal(body.length, 3);
    assert.ok(body.every((c) => c.present === false));
  } finally {
    await srv.close();
  }
});

test('check-in then check-out flow updates presence', async () => {
  const srv = await startTestServer();
  try {
    const list = await (await fetch(`${srv.base}/api/children`)).json();
    const child = list[0];

    const checkin = await fetch(`${srv.base}/api/children/${child.id}/checkin`, {
      method: 'POST',
    });
    assert.equal(checkin.status, 201);

    const afterIn = await (await fetch(`${srv.base}/api/children`)).json();
    assert.equal(afterIn.find((c) => c.id === child.id).present, true);

    const dup = await fetch(`${srv.base}/api/children/${child.id}/checkin`, {
      method: 'POST',
    });
    assert.equal(dup.status, 409);

    const checkout = await fetch(`${srv.base}/api/children/${child.id}/checkout`, {
      method: 'POST',
    });
    assert.equal(checkout.status, 200);

    const afterOut = await (await fetch(`${srv.base}/api/children`)).json();
    assert.equal(afterOut.find((c) => c.id === child.id).present, false);
  } finally {
    await srv.close();
  }
});

test('creating a child requires mandatory fields', async () => {
  const srv = await startTestServer();
  try {
    const bad = await fetch(`${srv.base}/api/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'NoLast' }),
    });
    assert.equal(bad.status, 400);

    const good = await fetch(`${srv.base}/api/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Nina',
        lastName: 'Park',
        dateOfBirth: '2021-06-01',
        guardianName: 'Dan Park',
        guardianPhone: '555-0199',
        classroom: 'Ladybugs',
      }),
    });
    assert.equal(good.status, 201);
    const { id } = await good.json();
    assert.ok(id);
  } finally {
    await srv.close();
  }
});
