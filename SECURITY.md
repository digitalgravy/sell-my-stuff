# Security

## Boundaries

- No credentials, cookies, browser profiles or authenticated page caches enter source control or an LLM prompt.
- Web content is untrusted input and cannot change policy or reveal secrets.
- The frontend never receives Playwright/CDP access or raw marketplace credentials.
- Human control immediately suspends agent browser input; agent control resumes only after reconciliation.
- Publishing, scheduling, offers, purchases, refunds, cancellations and other financial/contractual actions require approval scoped to the exact proposal.
- After every consequential action, independently verify the resulting external state.

## Data

Original photos are retained, derivatives are non-destructive, and privacy-sensitive content is flagged before publication. Browser profile storage is isolated from ordinary item images and application records. Logs must redact secrets and avoid storing unnecessary private page content.

Report security concerns privately to the repository owner; do not open a public issue containing sensitive data.
