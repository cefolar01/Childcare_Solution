import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEED_CHILDREN = [
  {
    firstName: 'Ava',
    lastName: 'Nguyen',
    dateOfBirth: '2021-04-12',
    guardianName: 'Linh Nguyen',
    guardianPhone: '555-0142',
    classroom: 'Sunflowers',
  },
  {
    firstName: 'Mateo',
    lastName: 'Garcia',
    dateOfBirth: '2020-09-03',
    guardianName: 'Sofia Garcia',
    guardianPhone: '555-0188',
    classroom: 'Sunflowers',
  },
  {
    firstName: 'Owen',
    lastName: 'Baker',
    dateOfBirth: '2022-01-27',
    guardianName: 'James Baker',
    guardianPhone: '555-0110',
    classroom: 'Ladybugs',
  },
];

/** UTC timestamp formatted as "YYYY-MM-DD HH:MM:SS". */
function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * A dependency-free, JSON-file-backed data store for children and attendance.
 * Pass ":memory:" for an ephemeral store (used by tests). Any other value is
 * treated as a path (relative to the repo root) to a JSON file that is created
 * and seeded with demo children on first use.
 *
 * This replaces the previous SQLite layer so `npm install` needs no native
 * compilation and works identically on macOS, Linux, and Windows.
 */
export function createStore(dbPath) {
  const inMemory = !dbPath || dbPath === ':memory:';
  const filePath = inMemory
    ? null
    : resolve(__dirname, '..', '..', dbPath.replace(/\.db$/, '.json'));

  let state = { children: [], attendance: [], seq: { children: 0, attendance: 0 } };

  function load() {
    if (filePath && existsSync(filePath)) {
      try {
        state = JSON.parse(readFileSync(filePath, 'utf8'));
        state.seq ??= { children: 0, attendance: 0 };
        state.children ??= [];
        state.attendance ??= [];
      } catch {
        // Corrupt file: start fresh rather than crash.
        state = { children: [], attendance: [], seq: { children: 0, attendance: 0 } };
      }
    }
  }

  function persist() {
    if (!filePath) return;
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  function seedIfEmpty() {
    if (state.children.length === 0) {
      for (const c of SEED_CHILDREN) {
        state.children.push({ id: ++state.seq.children, ...c });
      }
      persist();
    }
  }

  load();
  seedIfEmpty();

  function openAttendanceFor(childId) {
    return state.attendance.find(
      (a) => a.childId === childId && a.checkOut == null
    );
  }

  return {
    listChildren() {
      return [...state.children]
        .sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        )
        .map((c) => {
          const open = openAttendanceFor(c.id);
          return {
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            dateOfBirth: c.dateOfBirth,
            guardianName: c.guardianName,
            guardianPhone: c.guardianPhone,
            classroom: c.classroom,
            present: open != null,
            checkedInAt: open ? open.checkIn : null,
          };
        });
    },

    createChild(data) {
      const child = {
        id: ++state.seq.children,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        classroom: data.classroom || 'Unassigned',
      };
      state.children.push(child);
      persist();
      return child.id;
    },

    removeChild(id) {
      const before = state.children.length;
      state.children = state.children.filter((c) => c.id !== id);
      if (state.children.length === before) return false;
      state.attendance = state.attendance.filter((a) => a.childId !== id);
      persist();
      return true;
    },

    checkIn(id) {
      const child = state.children.find((c) => c.id === id);
      if (!child) return { status: 'not_found' };
      if (openAttendanceFor(id)) return { status: 'already_in' };
      const record = { id: ++state.seq.attendance, childId: id, checkIn: nowStamp(), checkOut: null };
      state.attendance.push(record);
      persist();
      return { status: 'ok', id: record.id };
    },

    checkOut(id) {
      const open = openAttendanceFor(id);
      if (!open) return false;
      open.checkOut = nowStamp();
      persist();
      return true;
    },

    attendanceToday() {
      const today = nowStamp().slice(0, 10);
      return state.attendance
        .filter((a) => a.checkIn.slice(0, 10) === today)
        .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
        .map((a) => {
          const child = state.children.find((c) => c.id === a.childId);
          return {
            id: a.id,
            childId: a.childId,
            firstName: child ? child.firstName : null,
            lastName: child ? child.lastName : null,
            checkIn: a.checkIn,
            checkOut: a.checkOut,
          };
        });
    },
  };
}
