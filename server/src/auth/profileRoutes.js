import { decryptField } from './crypto.js';
import { validateDemographics } from './demographics.js';
import { requireAuth } from './routes.js';

/**
 * Applicant demographic profile routes (WP-CC-AUTH-003).
 * Own-record only; SSN masked in responses; audit without full SSN.
 */
export function mountProfileRoutes(app, authStore, wrap) {
  const auth = requireAuth(authStore);

  app.get(
    '/api/profile',
    auth,
    wrap(async (req, res) => {
      const profile = await authStore.getProfileDto(req.applicant.id);
      res.json({
        email: req.applicant.email,
        profile,
      });
    })
  );

  // Explicit own-id path — reject IDOR attempts to other applicants
  app.get(
    '/api/profile/:applicantId',
    auth,
    wrap(async (req, res) => {
      const requested = Number(req.params.applicantId);
      if (requested !== req.applicant.id) {
        await authStore.writeAudit({
          applicantId: req.applicant.id,
          action: 'profile_access_denied',
          detail: { accountId: req.applicant.id, attemptedId: requested },
        });
        return res.status(403).json({ error: 'Access denied' });
      }
      const profile = await authStore.getProfileDto(req.applicant.id);
      res.json({
        email: req.applicant.email,
        profile,
      });
    })
  );

  app.put(
    '/api/profile',
    auth,
    wrap(async (req, res) => {
      const body = { ...(req.body ?? {}) };
      const existing = await authStore.getProfile(req.applicant.id);
      const ssnProvided =
        body.ssn != null && String(body.ssn).trim() !== '';

      // Allow re-save without re-typing SSN when one is already stored (still masked in UI).
      if (!ssnProvided && existing?.ssn_enc) {
        body.ssn = decryptField(existing.ssn_enc);
      }

      const validated = validateDemographics(body);
      if (!validated.ok) {
        return res.status(400).json({
          error: validated.error,
          fieldErrors: validated.fieldErrors,
        });
      }

      const touched = Object.keys(validated.value).filter((k) => k !== 'ssn');
      if (ssnProvided) touched.push('ssn');

      await authStore.upsertProfile(req.applicant.id, validated.value);
      await authStore.writeAudit({
        applicantId: req.applicant.id,
        action: 'profile_updated',
        detail: {
          accountId: req.applicant.id,
          fieldsTouched: touched,
        },
      });

      const profile = await authStore.getProfileDto(req.applicant.id);
      res.json({
        ok: true,
        message: 'Profile saved',
        profile,
      });
    })
  );
}
