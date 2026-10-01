import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from './app.js';
import { createStore } from './store.js';
import { initDb } from './db.js';
import { currentTotpCode } from './auth/totp.js';
import { resetRateLimitState } from './auth/rateLimit.js';

process.env.AUTH_SECRET = 'test-auth-secret-32chars-minimum!!';

async function startTestServer() {
  resetRateLimitState();
  const db = new PGlite();
  await initDb(db);
  const store = createStore(db);
  const app = createApp(store);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    app,
    authStore: app.locals.authStore,
    close: () =>
      new Promise((r) => server.close(r)).then(() => db.close()),
  };
}

function cookieJar() {
  let cookie = '';
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() || [];
      for (const c of raw) {
        const part = c.split(';')[0];
        if (part.startsWith('cc_session=')) cookie = part;
      }
    },
    header() {
      return cookie ? { Cookie: cookie } : {};
    },
    clear() {
      cookie = '';
    },
  };
}

const STRONG = 'CorrectHorse1!Battery';

async function registerComplete(base, email = 'applicant.demo.001@example.test') {
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: STRONG }),
  });
  assert.equal(reg.status, 201);
  const { enrollmentToken } = await reg.json();

  const setup = await fetch(
    `${base}/api/auth/2fa/setup?enrollmentToken=${enrollmentToken}`
  );
  assert.equal(setup.status, 200);
  const { secret } = await setup.json();
  const code = currentTotpCode(secret);

  const enroll = await fetch(`${base}/api/auth/2fa/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentToken, code }),
  });
  assert.equal(enroll.status, 200);
  return { email, secret };
}

async function loginFull(base, email, secret, jar) {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: STRONG }),
  });
  assert.equal(login.status, 200);
  const { challengeToken } = await login.json();
  const verify = await fetch(`${base}/api/auth/2fa/verify-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeToken,
      code: currentTotpCode(secret),
    }),
  });
  assert.equal(verify.status, 200);
  jar.store(verify);
  const body = await verify.json();
  assert.equal(body.next, 'profile');
  return body;
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

test('deleting a child removes them and cascades attendance', async () => {
  const srv = await startTestServer();
  try {
    const list = await (await fetch(`${srv.base}/api/children`)).json();
    const child = list[0];

    await fetch(`${srv.base}/api/children/${child.id}/checkin`, { method: 'POST' });

    const del = await fetch(`${srv.base}/api/children/${child.id}`, {
      method: 'DELETE',
    });
    assert.equal(del.status, 204);

    const after = await (await fetch(`${srv.base}/api/children`)).json();
    assert.equal(after.find((c) => c.id === child.id), undefined);
    assert.equal(after.length, 2);
  } finally {
    await srv.close();
  }
});

test('AUTH-001: self-register with email, reject duplicate and weak password', async () => {
  const srv = await startTestServer();
  try {
    const weak = await fetch(`${srv.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'applicant.demo.001@example.test',
        password: 'short',
      }),
    });
    assert.equal(weak.status, 400);

    const ok = await fetch(`${srv.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'applicant.demo.001@example.test',
        password: STRONG,
      }),
    });
    assert.equal(ok.status, 201);
    const body = await ok.json();
    assert.ok(body.enrollmentToken);

    const dup = await fetch(`${srv.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'applicant.demo.001@example.test',
        password: STRONG,
      }),
    });
    assert.equal(dup.status, 409);
    const dupBody = await dup.json();
    assert.equal(dupBody.error, 'Username unavailable');
  } finally {
    await srv.close();
  }
});

test('AUTH-001: TOTP enrollment required; incomplete blocks login', async () => {
  const srv = await startTestServer();
  try {
    const reg = await fetch(`${srv.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'applicant.demo.002@example.test',
        password: STRONG,
      }),
    });
    const { enrollmentToken } = await reg.json();

    const blocked = await fetch(`${srv.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'applicant.demo.002@example.test',
        password: STRONG,
      }),
    });
    assert.equal(blocked.status, 403);

    const setup = await (
      await fetch(
        `${srv.base}/api/auth/2fa/setup?enrollmentToken=${enrollmentToken}`
      )
    ).json();
    const enroll = await fetch(`${srv.base}/api/auth/2fa/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentToken,
        code: currentTotpCode(setup.secret),
      }),
    });
    assert.equal(enroll.status, 200);

    const applicant = await srv.authStore.findApplicantByEmail(
      'applicant.demo.002@example.test'
    );
    assert.ok(applicant.password_changed_at);
    assert.equal(applicant.registration_complete, true);

    const audits = await srv.authStore.listAuditForApplicant(applicant.id);
    assert.ok(audits.some((a) => a.action === 'registration_complete'));
    assert.ok(audits.some((a) => a.action === '2fa_enrollment_success'));
  } finally {
    await srv.close();
  }
});

test('AUTH-002: login with 2FA lands session; wrong factors create no session', async () => {
  const srv = await startTestServer();
  const jar = cookieJar();
  try {
    const { email, secret } = await registerComplete(srv.base);

    const badPw = await fetch(`${srv.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword1!' }),
    });
    assert.equal(badPw.status, 401);

    const login = await fetch(`${srv.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: STRONG }),
    });
    const { challengeToken } = await login.json();

    const bad2fa = await fetch(`${srv.base}/api/auth/2fa/verify-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: '000000' }),
    });
    assert.equal(bad2fa.status, 401);
    const meNo = await fetch(`${srv.base}/api/auth/me`, {
      headers: jar.header(),
    });
    assert.equal(meNo.status, 401);

    // challenge consumed? bad 2fa should NOT consume — retry with good code
    const good = await fetch(`${srv.base}/api/auth/2fa/verify-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeToken,
        code: currentTotpCode(secret),
      }),
    });
    assert.equal(good.status, 200);
    jar.store(good);

    const me = await fetch(`${srv.base}/api/auth/me`, { headers: jar.header() });
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.equal(meBody.email, email);

    const profileUnauth = await fetch(`${srv.base}/api/profile`);
    assert.equal(profileUnauth.status, 401);

    const profile = await fetch(`${srv.base}/api/profile`, {
      headers: jar.header(),
    });
    assert.equal(profile.status, 200);

    await fetch(`${srv.base}/api/auth/logout`, {
      method: 'POST',
      headers: jar.header(),
    });
    jar.clear();
    const afterLogout = await fetch(`${srv.base}/api/auth/me`, {
      headers: jar.header(),
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await srv.close();
  }
});

test('AUTH-002: password older than 90 days forces reset before session', async () => {
  const srv = await startTestServer();
  const jar = cookieJar();
  try {
    const { email, secret } = await registerComplete(
      srv.base,
      'applicant.demo.003@example.test'
    );
    const applicant = await srv.authStore.findApplicantByEmail(email);
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    await srv.authStore.setPasswordChangedAt(applicant.id, old);

    const login = await fetch(`${srv.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: STRONG }),
    });
    const { challengeToken } = await login.json();
    const verify = await fetch(`${srv.base}/api/auth/2fa/verify-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeToken,
        code: currentTotpCode(secret),
      }),
    });
    const body = await verify.json();
    assert.equal(body.next, 'force_password_reset');
    assert.ok(body.resetToken);

    const meEarly = await fetch(`${srv.base}/api/auth/me`, {
      headers: jar.header(),
    });
    assert.equal(meEarly.status, 401);

    const reset = await fetch(`${srv.base}/api/auth/password/force-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: body.resetToken,
        newPassword: 'BrandNewPass2@word',
      }),
    });
    assert.equal(reset.status, 200);
    jar.store(reset);
    const me = await fetch(`${srv.base}/api/auth/me`, { headers: jar.header() });
    assert.equal(me.status, 200);
  } finally {
    await srv.close();
  }
});

test('AUTH-003: demographics save, mask SSN, deny IDOR', async () => {
  const srv = await startTestServer();
  const jarA = cookieJar();
  const jarB = cookieJar();
  try {
    const a = await registerComplete(srv.base, 'applicant.demo.a@example.test');
    const b = await registerComplete(srv.base, 'applicant.demo.b@example.test');
    await loginFull(srv.base, a.email, a.secret, jarA);
    await loginFull(srv.base, b.email, b.secret, jarB);

    const meA = await (await fetch(`${srv.base}/api/auth/me`, { headers: jarA.header() })).json();

    const bad = await fetch(`${srv.base}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...jarA.header() },
      body: JSON.stringify({ firstName: 'Only' }),
    });
    assert.equal(bad.status, 400);

    const save = await fetch(`${srv.base}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...jarA.header() },
      body: JSON.stringify({
        firstName: 'Alex',
        lastName: 'Applicant',
        mailingAddress1: '100 Demo Street',
        mailingAddress2: 'Apt 1',
        mailingCity: 'Springfield',
        mailingState: 'IL',
        mailingZip: '62701',
        physicalAddress1: '100 Demo Street',
        physicalAddress2: '',
        physicalCity: 'Springfield',
        physicalState: 'IL',
        physicalZip: '62701',
        ssn: '000-00-0001',
        dateOfBirth: '1990-05-15',
      }),
    });
    assert.equal(save.status, 200);
    const saved = await save.json();
    assert.equal(saved.profile.ssnMasked, '***-**-0001');
    assert.equal(saved.profile.firstName, 'Alex');
    assert.ok(!JSON.stringify(saved).includes('000-00-0001'));

    const reload = await (
      await fetch(`${srv.base}/api/profile`, { headers: jarA.header() })
    ).json();
    assert.equal(reload.profile.lastName, 'Applicant');
    assert.equal(reload.profile.ssnMasked, '***-**-0001');

    const idor = await fetch(`${srv.base}/api/profile/${meA.id}`, {
      headers: jarB.header(),
    });
    assert.equal(idor.status, 403);

    const audits = await srv.authStore.listAuditForApplicant(meA.id);
    const profileAudit = audits.find((x) => x.action === 'profile_updated');
    assert.ok(profileAudit);
    assert.ok(profileAudit.detail.fieldsTouched.includes('ssn'));
    assert.ok(!JSON.stringify(profileAudit).includes('000-00-0001'));
  } finally {
    await srv.close();
  }
});
