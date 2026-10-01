export interface AuthUser {
  id: number;
  email: string;
}

export interface Profile {
  firstName: string;
  lastName: string;
  mailingAddress1: string;
  mailingAddress2: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  physicalAddress1: string;
  physicalAddress2: string;
  physicalCity: string;
  physicalState: string;
  physicalZip: string;
  ssnMasked: string | null;
  dateOfBirth: string;
  updatedAt: string | null;
}

export interface Child {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianPhone: string;
  classroom: string;
  present: boolean;
  checkedInAt: string | null;
}

export interface NewChild {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianPhone: string;
  classroom: string;
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `Request failed (${res.status})`) as Error & {
      fieldErrors?: Record<string, string>;
      status?: number;
    };
    err.fieldErrors = body.fieldErrors;
    err.status = res.status;
    throw err;
  }
  return res;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export async function fetchChildren(): Promise<Child[]> {
  const res = await handle(await fetch('/api/children'));
  return res.json();
}

export async function createChild(child: NewChild): Promise<void> {
  await handle(
    await fetch('/api/children', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(child),
    })
  );
}

export async function deleteChild(id: number): Promise<void> {
  await handle(await fetch(`/api/children/${id}`, { method: 'DELETE' }));
}

export async function checkIn(id: number): Promise<void> {
  await handle(await fetch(`/api/children/${id}/checkin`, { method: 'POST' }));
}

export async function checkOut(id: number): Promise<void> {
  await handle(await fetch(`/api/children/${id}/checkout`, { method: 'POST' }));
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  await handle(res);
  return res.json();
}

export async function register(email: string, password: string) {
  const res = await handle(
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
  );
  return res.json() as Promise<{ enrollmentToken: string; passwordPolicy: string }>;
}

export async function fetchTotpSetup(enrollmentToken: string) {
  const res = await handle(
    await fetch(
      `/api/auth/2fa/setup?enrollmentToken=${encodeURIComponent(enrollmentToken)}`,
      { credentials: 'include' }
    )
  );
  return res.json() as Promise<{ email: string; otpauthUrl: string; secret: string }>;
}

export async function enrollTotp(enrollmentToken: string, code: string) {
  const res = await handle(
    await fetch('/api/auth/2fa/enroll', {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ enrollmentToken, code }),
    })
  );
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await handle(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
  );
  return res.json() as Promise<{ challengeToken: string; next: string }>;
}

export async function verifyLoginTotp(challengeToken: string, code: string) {
  const res = await handle(
    await fetch('/api/auth/2fa/verify-login', {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ challengeToken, code }),
    })
  );
  return res.json() as Promise<{
    next: string;
    resetToken?: string;
    message?: string;
    user?: AuthUser;
  }>;
}

export async function forceResetPassword(resetToken: string, newPassword: string) {
  const res = await handle(
    await fetch('/api/auth/password/force-reset', {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ resetToken, newPassword }),
    })
  );
  return res.json() as Promise<{ next: string; user: AuthUser }>;
}

export async function logout(): Promise<void> {
  await handle(
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  );
}

export async function fetchProfile() {
  const res = await handle(
    await fetch('/api/profile', { credentials: 'include' })
  );
  return res.json() as Promise<{ email: string; profile: Profile }>;
}

export async function saveProfile(data: Record<string, string>) {
  const res = await handle(
    await fetch('/api/profile', {
      method: 'PUT',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify(data),
    })
  );
  return res.json() as Promise<{ ok: boolean; message: string; profile: Profile }>;
}
