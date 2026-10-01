import {
  decryptField,
  encryptField,
  hashPassword,
  randomToken,
  verifyPassword,
} from './crypto.js';
import { maskSsn } from './demographics.js';

function affected(result) {
  return result.rowCount ?? result.affectedRows ?? 0;
}

/**
 * Auth + profile data access over the same Postgres-compatible client as the
 * existing store. Keeps credentials hashed and SSN/TOTP secrets encrypted.
 */
export function createAuthStore(db) {
  return {
    async findApplicantByEmail(email) {
      const { rows } = await db.query(
        `SELECT * FROM applicants WHERE lower(email) = lower($1)`,
        [email]
      );
      return rows[0] || null;
    },

    async findApplicantById(id) {
      const { rows } = await db.query(`SELECT * FROM applicants WHERE id = $1`, [
        id,
      ]);
      return rows[0] || null;
    },

    async createApplicant({ email, password }) {
      const passwordHash = hashPassword(password);
      const { rows } = await db.query(
        `INSERT INTO applicants
           (email, password_hash, password_changed_at, registration_complete)
         VALUES ($1, $2, now(), FALSE)
         RETURNING id, email, password_changed_at, registration_complete, created_at`,
        [email.toLowerCase(), passwordHash]
      );
      return rows[0];
    },

    async setTotpSecret(applicantId, secretBase32) {
      const enc = encryptField(secretBase32);
      await db.query(
        `UPDATE applicants
         SET totp_secret_enc = $2, totp_enrolled_at = NULL, registration_complete = FALSE
         WHERE id = $1`,
        [applicantId, enc]
      );
    },

    async getTotpSecret(applicantId) {
      const row = await this.findApplicantById(applicantId);
      if (!row?.totp_secret_enc) return null;
      return decryptField(row.totp_secret_enc);
    },

    async completeTotpEnrollment(applicantId) {
      await db.query(
        `UPDATE applicants
         SET totp_enrolled_at = now(), registration_complete = TRUE
         WHERE id = $1`,
        [applicantId]
      );
    },

    async verifyApplicantPassword(applicant, password) {
      return verifyPassword(password, applicant.password_hash);
    },

    async updatePassword(applicantId, newPassword) {
      const passwordHash = hashPassword(newPassword);
      await db.query(
        `UPDATE applicants
         SET password_hash = $2, password_changed_at = now()
         WHERE id = $1`,
        [applicantId, passwordHash]
      );
    },

    async setPasswordChangedAt(applicantId, when) {
      await db.query(
        `UPDATE applicants SET password_changed_at = $2 WHERE id = $1`,
        [applicantId, when]
      );
    },

    async createChallenge({ applicantId, purpose, ttlMinutes = 10 }) {
      const id = randomToken(24);
      const { rows } = await db.query(
        `INSERT INTO auth_challenges (id, applicant_id, purpose, expires_at)
         VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
         RETURNING id, applicant_id, purpose, expires_at`,
        [id, applicantId, purpose, String(ttlMinutes)]
      );
      return rows[0];
    },

    async getChallenge(id) {
      const { rows } = await db.query(
        `SELECT * FROM auth_challenges
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()`,
        [id]
      );
      return rows[0] || null;
    },

    async consumeChallenge(id) {
      await db.query(
        `UPDATE auth_challenges SET consumed_at = now() WHERE id = $1`,
        [id]
      );
    },

    /**
     * Interim Dev session TTL: 8 hours absolute.
     * Idle-timeout preference remains an open question (WP-CC-AUTH-002) — not invented here.
     */
    async createSession(applicantId, ttlHours = 8) {
      const id = randomToken(32);
      const { rows } = await db.query(
        `INSERT INTO auth_sessions (id, applicant_id, expires_at)
         VALUES ($1, $2, now() + ($3 || ' hours')::interval)
         RETURNING id, applicant_id, expires_at`,
        [id, applicantId, String(ttlHours)]
      );
      return rows[0];
    },

    async getSession(id) {
      if (!id) return null;
      const { rows } = await db.query(
        `SELECT s.*, a.email, a.registration_complete
         FROM auth_sessions s
         JOIN applicants a ON a.id = s.applicant_id
         WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
        [id]
      );
      return rows[0] || null;
    },

    async revokeSession(id) {
      if (!id) return false;
      const result = await db.query(
        `UPDATE auth_sessions SET revoked_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [id]
      );
      return affected(result) > 0;
    },

    async writeAudit({ applicantId = null, action, detail = null }) {
      await db.query(
        `INSERT INTO audit_events (applicant_id, action, detail)
         VALUES ($1, $2, $3)`,
        [
          applicantId,
          action,
          detail == null ? null : JSON.stringify(detail),
        ]
      );
    },

    async listAuditForApplicant(applicantId) {
      const { rows } = await db.query(
        `SELECT id, applicant_id, action, detail, created_at
         FROM audit_events
         WHERE applicant_id = $1
         ORDER BY id ASC`,
        [applicantId]
      );
      return rows.map((r) => ({
        ...r,
        detail:
          typeof r.detail === 'string'
            ? (() => {
                try {
                  return JSON.parse(r.detail);
                } catch {
                  return r.detail;
                }
              })()
            : r.detail,
      }));
    },

    async getProfile(applicantId) {
      const { rows } = await db.query(
        `SELECT * FROM applicant_profiles WHERE applicant_id = $1`,
        [applicantId]
      );
      return rows[0] || null;
    },

    async upsertProfile(applicantId, data) {
      const ssnEnc = encryptField(data.ssn);
      await db.query(
        `INSERT INTO applicant_profiles (
           applicant_id, first_name, last_name,
           mailing_address1, mailing_address2, mailing_city, mailing_state, mailing_zip,
           physical_address1, physical_address2, physical_city, physical_state, physical_zip,
           ssn_enc, date_of_birth, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()
         )
         ON CONFLICT (applicant_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           mailing_address1 = EXCLUDED.mailing_address1,
           mailing_address2 = EXCLUDED.mailing_address2,
           mailing_city = EXCLUDED.mailing_city,
           mailing_state = EXCLUDED.mailing_state,
           mailing_zip = EXCLUDED.mailing_zip,
           physical_address1 = EXCLUDED.physical_address1,
           physical_address2 = EXCLUDED.physical_address2,
           physical_city = EXCLUDED.physical_city,
           physical_state = EXCLUDED.physical_state,
           physical_zip = EXCLUDED.physical_zip,
           ssn_enc = EXCLUDED.ssn_enc,
           date_of_birth = EXCLUDED.date_of_birth,
           updated_at = now()`,
        [
          applicantId,
          data.firstName,
          data.lastName,
          data.mailingAddress1,
          data.mailingAddress2 || null,
          data.mailingCity,
          data.mailingState,
          data.mailingZip,
          data.physicalAddress1,
          data.physicalAddress2 || null,
          data.physicalCity,
          data.physicalState,
          data.physicalZip,
          ssnEnc,
          data.dateOfBirth,
        ]
      );
    },

    /** Public profile DTO — SSN always masked; never returns ciphertext. */
    async getProfileDto(applicantId) {
      const row = await this.getProfile(applicantId);
      if (!row) {
        return {
          firstName: '',
          lastName: '',
          mailingAddress1: '',
          mailingAddress2: '',
          mailingCity: '',
          mailingState: '',
          mailingZip: '',
          physicalAddress1: '',
          physicalAddress2: '',
          physicalCity: '',
          physicalState: '',
          physicalZip: '',
          ssnMasked: null,
          dateOfBirth: '',
          updatedAt: null,
        };
      }
      let ssnMasked = null;
      try {
        ssnMasked = maskSsn(decryptField(row.ssn_enc));
      } catch {
        ssnMasked = '***-**-????';
      }
      return {
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        mailingAddress1: row.mailing_address1 || '',
        mailingAddress2: row.mailing_address2 || '',
        mailingCity: row.mailing_city || '',
        mailingState: row.mailing_state || '',
        mailingZip: row.mailing_zip || '',
        physicalAddress1: row.physical_address1 || '',
        physicalAddress2: row.physical_address2 || '',
        physicalCity: row.physical_city || '',
        physicalState: row.physical_state || '',
        physicalZip: row.physical_zip || '',
        ssnMasked,
        dateOfBirth: row.date_of_birth || '',
        updatedAt: row.updated_at,
      };
    },
  };
}
