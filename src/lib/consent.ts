// Legal links + recording/data-use consent for public booking pages.
// Bump CONSENT_VERSION whenever the consent wording below changes, so stored
// consent records show which text the invitee agreed to.

export const PRIVACY_URL = "https://ouigrowth.com/privacy";
export const TERMS_URL = "https://ouigrowth.com/terms";

export const CONSENT_VERSION = "2026-10-05";

// Stored on the booking (notes) and the Google Calendar event as proof of consent.
export function consentRecord(acceptedAt: string): string {
  return `[Consent v${CONSENT_VERSION} accepted ${acceptedAt}] Call recording, internal use of call data, Terms of Service and Privacy Policy.`;
}

export function withConsent(notes: string | null | undefined, acceptedAt: string): string {
  const record = consentRecord(acceptedAt);
  return notes ? `${notes}\n\n${record}` : record;
}
