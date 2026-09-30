/** Number of rows affected by a write, normalized across pg and PGlite. */
function affected(result) {
  return result.rowCount ?? result.affectedRows ?? 0;
}

function toChild(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    classroom: row.classroom,
    present: row.open_attendance_id != null,
    checkedInAt: row.checked_in_at ?? null,
  };
}

/**
 * Data-access layer over a Postgres-compatible client. `db` is any client with
 * an async `query(text, params)` method — a pg Pool (dev/prod) or a PGlite
 * instance (tests). All methods are async.
 */
export function createStore(db) {
  return {
    async listChildren() {
      const { rows } = await db.query(
        `SELECT c.*,
                a.id AS open_attendance_id,
                a.check_in AS checked_in_at
         FROM children c
         LEFT JOIN attendance a
           ON a.child_id = c.id AND a.check_out IS NULL
         ORDER BY c.first_name, c.last_name`
      );
      return rows.map(toChild);
    },

    async createChild(data) {
      const { rows } = await db.query(
        `INSERT INTO children
           (first_name, last_name, date_of_birth, guardian_name, guardian_phone, classroom)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          data.firstName,
          data.lastName,
          data.dateOfBirth,
          data.guardianName,
          data.guardianPhone,
          data.classroom || 'Unassigned',
        ]
      );
      return rows[0].id;
    },

    async removeChild(id) {
      const result = await db.query('DELETE FROM children WHERE id = $1', [id]);
      return affected(result) > 0;
    },

    async checkIn(id) {
      const child = await db.query('SELECT id FROM children WHERE id = $1', [id]);
      if (child.rows.length === 0) return { status: 'not_found' };

      const open = await db.query(
        'SELECT id FROM attendance WHERE child_id = $1 AND check_out IS NULL',
        [id]
      );
      if (open.rows.length > 0) return { status: 'already_in' };

      const { rows } = await db.query(
        'INSERT INTO attendance (child_id) VALUES ($1) RETURNING id',
        [id]
      );
      return { status: 'ok', id: rows[0].id };
    },

    async checkOut(id) {
      const result = await db.query(
        `UPDATE attendance
         SET check_out = now()
         WHERE child_id = $1 AND check_out IS NULL`,
        [id]
      );
      return affected(result) > 0;
    },

    async attendanceToday() {
      const { rows } = await db.query(
        `SELECT a.id,
                a.child_id  AS "childId",
                c.first_name AS "firstName",
                c.last_name  AS "lastName",
                a.check_in   AS "checkIn",
                a.check_out  AS "checkOut"
         FROM attendance a
         JOIN children c ON c.id = a.child_id
         WHERE a.check_in::date = now()::date
         ORDER BY a.check_in DESC`
      );
      return rows;
    },
  };
}
