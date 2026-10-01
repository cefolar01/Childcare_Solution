/**
 * Applicant demographic validation (WP-CC-AUTH-003).
 * Synthetic/redacted values only in fixtures and docs.
 */

const STATE_RE = /^[A-Za-z]{2}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;

export function normalizeSsn(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function maskSsn(ssn) {
  const normalized = normalizeSsn(ssn);
  if (!normalized) return null;
  return `***-**-${normalized.slice(-4)}`;
}

export function validateDob(dob) {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return { ok: false, error: 'Date of birth must be YYYY-MM-DD' };
  }
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob) {
    return { ok: false, error: 'Date of birth is not a valid date' };
  }
  const now = new Date();
  if (d > now) {
    return { ok: false, error: 'Date of birth cannot be in the future' };
  }
  const ageYears = (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 16 || ageYears > 120) {
    return { ok: false, error: 'Date of birth is outside the accepted applicant range' };
  }
  return { ok: true };
}

/**
 * Validate Rich-confirmed demographic field set.
 * Returns { ok, error?, fieldErrors? }.
 */
export function validateDemographics(body) {
  const fieldErrors = {};
  const required = [
    ['firstName', 'First Name'],
    ['lastName', 'Last Name'],
    ['mailingAddress1', 'Mailing Address 1'],
    ['mailingCity', 'Mailing City'],
    ['mailingState', 'Mailing State'],
    ['mailingZip', 'Mailing Zip'],
    ['physicalAddress1', 'Physical Address 1'],
    ['physicalCity', 'Physical City'],
    ['physicalState', 'Physical State'],
    ['physicalZip', 'Physical Zip'],
    ['ssn', 'SSN'],
    ['dateOfBirth', 'Date of Birth'],
  ];

  for (const [key, label] of required) {
    const value = body?.[key];
    if (value == null || String(value).trim() === '') {
      fieldErrors[key] = `${label} is required`;
    }
  }

  if (body?.mailingState && !STATE_RE.test(String(body.mailingState).trim())) {
    fieldErrors.mailingState = 'Mailing State must be a 2-letter code';
  }
  if (body?.physicalState && !STATE_RE.test(String(body.physicalState).trim())) {
    fieldErrors.physicalState = 'Physical State must be a 2-letter code';
  }
  if (body?.mailingZip && !ZIP_RE.test(String(body.mailingZip).trim())) {
    fieldErrors.mailingZip = 'Mailing Zip must be ##### or #####-####';
  }
  if (body?.physicalZip && !ZIP_RE.test(String(body.physicalZip).trim())) {
    fieldErrors.physicalZip = 'Physical Zip must be ##### or #####-####';
  }

  const ssn = normalizeSsn(body?.ssn);
  if (body?.ssn != null && String(body.ssn).trim() !== '' && !ssn) {
    fieldErrors.ssn = 'SSN must be ###-##-####';
  } else if (ssn === '000-00-0000') {
    fieldErrors.ssn = 'SSN is invalid';
  }

  if (body?.dateOfBirth != null && String(body.dateOfBirth).trim() !== '') {
    const dob = validateDob(String(body.dateOfBirth).trim());
    if (!dob.ok) fieldErrors.dateOfBirth = dob.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields',
      fieldErrors,
    };
  }

  return {
    ok: true,
    value: {
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      mailingAddress1: String(body.mailingAddress1).trim(),
      mailingAddress2: body.mailingAddress2
        ? String(body.mailingAddress2).trim()
        : '',
      mailingCity: String(body.mailingCity).trim(),
      mailingState: String(body.mailingState).trim().toUpperCase(),
      mailingZip: String(body.mailingZip).trim(),
      physicalAddress1: String(body.physicalAddress1).trim(),
      physicalAddress2: body.physicalAddress2
        ? String(body.physicalAddress2).trim()
        : '',
      physicalCity: String(body.physicalCity).trim(),
      physicalState: String(body.physicalState).trim().toUpperCase(),
      physicalZip: String(body.physicalZip).trim(),
      ssn,
      dateOfBirth: String(body.dateOfBirth).trim(),
    },
  };
}
