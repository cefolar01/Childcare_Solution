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
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res;
}

export async function fetchChildren(): Promise<Child[]> {
  const res = await handle(await fetch('/api/children'));
  return res.json();
}

export async function createChild(child: NewChild): Promise<void> {
  await handle(
    await fetch('/api/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
