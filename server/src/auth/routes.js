import {
  clearFailures,
  isRateLimited,
  RATE_LIMIT_MESSAGE,
  recordFailure,
} from './rateLimit.js';
import {
  PASSWORD_RULES_TEXT,
  passwordNeedsReset,
  validatePasswordStrength,
} from './password.js';
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.js';

const SESSION_COOKIE = 'cc_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    ...cookieOptions(),
    maxAge: 8 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/**
 * Mount applicant auth routes (WP-CC-AUTH-001 + WP-CC-AUTH-002).
 * Profile land route shell is /api/auth/me + client /profile; demographics in profile routes.
 */
export function mountAuthRoutes(app, authStore, wrap) {
  app.post(
    '/api/auth/register',
    wrap(async (req, res) => {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const password = req.body?.password;

      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'A valid email username is required' });
      }
      const strength = validatePasswordStrength(password);
      if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
      }

      const existing = await authStore.findApplicantByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Username unavailable' });
      }

      const applicant = await authStore.createApplicant({ email, password });
      const secret = generateTotpSecret();
      await authStore.setTotpSecret(applicant.id, secret);
      const challenge = await authStore.createChallenge({
        applicantId: applicant.id,
        purpose: 'enroll_2fa',
        ttlMinutes: 30,
      });

      await authStore.writeAudit({
        applicantId: applicant.id,
        action: 'registration_started',
        detail: { accountId: applicant.id },
      });

      res.status(201).json({
        enrollmentToken: challenge.id,
        email,
        passwordPolicy: PASSWORD_RULES_TEXT,
        next: 'enroll_2fa',
      });
    })
  );

  app.get(
    '/api/auth/2fa/setup',
    wrap(async (req, res) => {
      const token = String(req.query.enrollmentToken || '');
      const challenge = await authStore.getChallenge(token);
      if (!challenge || challenge.purpose !== 'enroll_2fa') {
        return res.status(401).json({ error: 'Enrollment session expired or invalid' });
      }
      const applicant = await authStore.findApplicantById(challenge.applicant_id);
      if (!applicant) {
        return res.status(401).json({ error: 'Enrollment session expired or invalid' });
      }
      const secret = await authStore.getTotpSecret(applicant.id);
      if (!secret) {
        return res.status(400).json({ error: '2FA secret not prepared' });
      }
      res.json({
        email: applicant.email,
        otpauthUrl: buildOtpauthUri(applicant.email, secret),
        // Manual entry fallback for authenticator apps (still sensitive — UI only during enroll)
        secret,
      });
    })
  );

  app.post(
    '/api/auth/2fa/enroll',
    wrap(async (req, res) => {
      const token = String(req.body?.enrollmentToken || '');
      const code = req.body?.code;
      const challenge = await authStore.getChallenge(token);
      if (!challenge || challenge.purpose !== 'enroll_2fa') {
        return res.status(401).json({ error: 'Enrollment session expired or invalid' });
      }
      const applicant = await authStore.findApplicantById(challenge.applicant_id);
      const secret = await authStore.getTotpSecret(challenge.applicant_id);
      if (!applicant || !secret) {
        return res.status(401).json({ error: 'Enrollment session expired or invalid' });
      }
      if (!verifyTotpCode(secret, code)) {
        await authStore.writeAudit({
          applicantId: applicant.id,
          action: '2fa_enrollment_failed',
          detail: { accountId: applicant.id },
        });
        return res.status(401).json({ error: 'Invalid verification code' });
      }

      await authStore.completeTotpEnrollment(applicant.id);
      await authStore.consumeChallenge(token);
      await authStore.writeAudit({
        applicantId: applicant.id,
        action: 'registration_complete',
        detail: { accountId: applicant.id },
      });
      await authStore.writeAudit({
        applicantId: applicant.id,
        action: '2fa_enrollment_success',
        detail: { accountId: applicant.id },
      });

      res.json({
        ok: true,
        message: 'Registration complete. Continue to sign in.',
        next: 'login',
      });
    })
  );

  app.post(
    '/api/auth/login',
    wrap(async (req, res) => {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const password = req.body?.password;
      const rateKey = `login:${email || req.ip}`;

      if (isRateLimited(rateKey)) {
        return res.status(429).json({ error: RATE_LIMIT_MESSAGE });
      }

      const applicant = await authStore.findApplicantByEmail(email);
      const passwordOk =
        applicant && (await authStore.verifyApplicantPassword(applicant, password));

      if (!passwordOk) {
        recordFailure(rateKey);
        await authStore.writeAudit({
          applicantId: applicant?.id ?? null,
          action: 'login_failed',
          detail: { reason: 'credentials' },
        });
        return res.status(401).json({ error: 'Sign-in failed' });
      }

      if (!applicant.registration_complete) {
        recordFailure(rateKey);
        await authStore.writeAudit({
          applicantId: applicant.id,
          action: 'login_failed',
          detail: { reason: '2fa_incomplete', accountId: applicant.id },
        });
        return res.status(403).json({
          error:
            'Two-factor enrollment is incomplete. Finish registration before signing in.',
        });
      }

      clearFailures(rateKey);
      const challenge = await authStore.createChallenge({
        applicantId: applicant.id,
        purpose: 'login_2fa',
        ttlMinutes: 10,
      });
      await authStore.writeAudit({
        applicantId: applicant.id,
        action: 'login_password_ok',
        detail: { accountId: applicant.id },
      });

      res.json({
        challengeToken: challenge.id,
        next: '2fa',
      });
    })
  );

  app.post(
    '/api/auth/2fa/verify-login',
    wrap(async (req, res) => {
      const token = String(req.body?.challengeToken || '');
      const code = req.body?.code;
      const rateKey = `2fa:${token || req.ip}`;

      if (isRateLimited(rateKey)) {
        return res.status(429).json({ error: RATE_LIMIT_MESSAGE });
      }

      const challenge = await authStore.getChallenge(token);
      if (!challenge || challenge.purpose !== 'login_2fa') {
        recordFailure(rateKey);
        return res.status(401).json({ error: 'Invalid or expired sign-in challenge' });
      }

      const applicant = await authStore.findApplicantById(challenge.applicant_id);
      const secret = await authStore.getTotpSecret(challenge.applicant_id);
      if (!applicant || !secret || !verifyTotpCode(secret, code)) {
        recordFailure(rateKey);
        await authStore.writeAudit({
          applicantId: challenge.applicant_id,
          action: '2fa_login_failed',
          detail: { accountId: challenge.applicant_id },
        });
        return res.status(401).json({ error: 'Invalid verification code' });
      }

      clearFailures(rateKey);
      await authStore.consumeChallenge(token);
      await authStore.writeAudit({
        applicantId: applicant.id,
        action: '2fa_login_success',
        detail: { accountId: applicant.id },
      });

      if (passwordNeedsReset(applicant.password_changed_at)) {
        const resetChallenge = await authStore.createChallenge({
          applicantId: applicant.id,
          purpose: 'force_password_reset',
          ttlMinutes: 15,
        });
        await authStore.writeAudit({
          applicantId: applicant.id,
          action: 'password_force_reset_required',
          detail: { accountId: applicant.id },
        });
        return res.json({
          next: 'force_password_reset',
          resetToken: resetChallenge.id,
          message: 'Your password is older than 90 days and must be changed.',
        });
      }

      const session = await authStore.createSession(applicant.id);
      setSessionCookie(res, session.id);
      await authStore.writeAudit({
        applicantId: applicant.id,
        action: 'login_success',
        detail: { accountId: applicant.id },
      });

      res.json({
        ok: true,
        next: 'profile',
        user: { id: applicant.id, email: applicant.email },
      });
    })
  );

  app.post(
    '/api/auth/password/force-reset',
    wrap(async (req, res) => {
      const token = String(req.body?.resetToken || '');
      const newPassword = req.body?.newPassword;
      const challenge = await authStore.getChallenge(token);
      if (!challenge || challenge.purpose !== 'force_password_reset') {
        return res.status(401).json({ error: 'Reset session expired or invalid' });
      }
      const strength = validatePasswordStrength(newPassword);
      if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
      }

      await authStore.updatePassword(challenge.applicant_id, newPassword);
      await authStore.consumeChallenge(token);
      const applicant = await authStore.findApplicantById(challenge.applicant_id);
      const session = await authStore.createSession(challenge.applicant_id);
      setSessionCookie(res, session.id);
      await authStore.writeAudit({
        applicantId: challenge.applicant_id,
        action: 'password_force_reset_complete',
        detail: { accountId: challenge.applicant_id },
      });
      await authStore.writeAudit({
        applicantId: challenge.applicant_id,
        action: 'login_success',
        detail: { accountId: challenge.applicant_id },
      });

      res.json({
        ok: true,
        next: 'profile',
        user: { id: applicant.id, email: applicant.email },
      });
    })
  );

  app.post(
    '/api/auth/logout',
    wrap(async (req, res) => {
      const sessionId = req.cookies?.[SESSION_COOKIE];
      if (sessionId) {
        const session = await authStore.getSession(sessionId);
        await authStore.revokeSession(sessionId);
        if (session) {
          await authStore.writeAudit({
            applicantId: session.applicant_id,
            action: 'logout',
            detail: { accountId: session.applicant_id },
          });
        }
      }
      clearSessionCookie(res);
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/auth/me',
    wrap(async (req, res) => {
      const sessionId = req.cookies?.[SESSION_COOKIE];
      const session = await authStore.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      res.json({
        id: session.applicant_id,
        email: session.email,
      });
    })
  );
}

export { SESSION_COOKIE, setSessionCookie, clearSessionCookie, cookieOptions };

/**
 * Require a full authenticated session (post-2FA, post force-reset when due).
 */
export function requireAuth(authStore) {
  return async (req, res, next) => {
    try {
      const sessionId = req.cookies?.[SESSION_COOKIE];
      const session = await authStore.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      req.applicant = {
        id: session.applicant_id,
        email: session.email,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
