# Activate security report emails and lead records

The branch is implemented, but production storage and email are **not connected** by a ChatGPT/GitHub connection. Complete these steps in your service dashboards. Do not paste secrets into chat or commit them.

## 1. Create the private lead database

Create a Supabase project. Run `db/security-leads.sql` in its SQL editor. This creates three server-only tables, two owner views, atomic rate-limit/claim functions, and retention cleanup. RLS is enabled, public/anon/authenticated access is revoked, and only service_role can use the application data and functions. Do not add public read policies.

Set these Vercel environment variables:

- `SUPABASE_URL`: the project's HTTPS URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the legacy JWT **service_role** key, not the anon/publishable key. It stays on the server and bypasses RLS, so protect it.

Accepted valid submissions are stored **before** any target request. If storage is unavailable, scans stop rather than silently run without a record. Invalid URLs, credentials, unsupported addresses, and requests refused by limits are not accepted for scanning. Failed/cancelled accepted scans remain in the log. A forced function termination may leave a started row; the cleanup job later marks it interrupted.

Use Supabase's table editor or SQL editor for:

- `security_scan_log`: every accepted website submission, timestamp, mode, outcome, error code, and summary. No visitor email is required for this log.
- `security_lead_list`: report-request email, website, requested help, link-open timestamp, email-provider acceptance status, owner-notification status, and expansion status. Export this view as CSV if desired.

Link opened is evidence that the private link was accessed, not proof of website ownership or a sales-qualified lead. Email submission status is provider acceptance, not proof of inbox delivery. Unconfirmed addresses remain distinguishable.

## 2. Configure transactional email

Create a Resend account, verify your sending domain through its DNS instructions, and create a sending API key. Set:

- `RESEND_API_KEY`
- `REPORT_FROM_EMAIL`, for example `Archwood Innovations <reports@archwoodinnovations.com>` on your verified domain.
- Optional `LEAD_NOTIFICATION_EMAIL`, the inbox where you want new report-open notifications. Leave it empty to use only the database lead list.

The visitor receives a private seven-day link. Opening it confirms the report request and unlocks details, a readable HTML download (also printable), and one expanded public review. There is no automatic marketing subscription. Requesting a callback is a separate, unchecked option.

The owner receives a **separate notification** after the private report link is opened, rather than a BCC of the visitor's access link. It contains the email, website, initial summary, and requested-help flag. The private token is not shared in the notification. Owner email is best effort: failures remain visible in the lead list and can be retried on a subsequent report open. It is not a guaranteed background email queue. Resend idempotency reduces duplicate sends within its 24-hour idempotency window; uncertain provider acknowledgments remain marked unknown.

## 3. Configure domains and retention

In Vercel Production, set `PUBLIC_SITE_URL=https://archwoodinnovations.com`. In Preview, omit it to use Vercel's deployment URL, or set it to your trusted preview origin. Never derive emailed links from user-supplied hostnames. Vercel preview authentication also applies to report links on a preview deployment.

Set `CRON_SECRET` to a long random secret. Vercel's configured daily `/api/security-retention` job uses it for authorization. Confirm cron success in the Vercel dashboard after deployment. Details and quick-check receipt credentials are removed after 14 days; private links expire after 7 days; scan/lead-request records expire after 90 days. Provider backups/access logs are separate. If you disable cron, arrange equivalent database cleanup before retaining the public privacy notice unchanged.

Review `/security-privacy` against your actual operational practices and service-provider arrangements. Its text describes the implemented data flow and limitations; it is not a promise of legal immunity or a substitute for business-specific legal review.

## 4. Review and test before merging

- `/security-preview`: noindex design preview of four illustrative result tones. It never scans or sends email, so you can review the layout before configuring services.
- `/website-security`: actual service. Requires the Supabase configuration even for the free snapshot, so every accepted scan is recorded. Requires Resend only when requesting the email report.
- Copy `.env.example` to `.env.local` for local work. `npm run dev` reads it. Real values are ignored by git. No npm dependencies need installing.
- Run `npm test`.
- With your own domain and mailbox, run a quick check; verify a completed database row and that the free network response contains no detailed report.
- Request a report and verify a lead row, provider acceptance, delivery in your mailbox, the private link, HTML download, and the one-report expansion limit.
- Confirm the optional owner notification and follow-up flag, expired-link errors, Supabase public access denial, and retention execution.

The repository tests use injected provider/database responses and do not provision or execute the SQL against a real Supabase project, send real email, or guarantee delivery. Real service validation remains necessary after credentials are configured.

## Operational limits

Shared database limits: 5 accepted scans per daily-rotating client hash per 10 minutes; 20 per normalized website URL per hour; 3 report-email requests per email per 30 minutes; 5 per client hash per hour. One successful expanded review per report link, with at most two attempts. An expansion claim is atomic; interrupted claims can be retried after two minutes. There are also 8 concurrent scans per function instance. These bounds limit repeat use but are not a payment system or complete bot defense. Use Vercel Firewall/rate limits for broader denial-of-service and traffic-cost control.

No existing report is silently upgraded into a marketing subscription. There are no paid plans, billing, authenticated accounts, or claims of comprehensive vulnerability detection.
