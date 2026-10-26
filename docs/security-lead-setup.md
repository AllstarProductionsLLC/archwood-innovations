# Activate Google-native security reports and lead records

This branch uses **Cloud Firestore and the Google Workspace Gmail API**. Supabase and Resend are no longer required. The website and its Node API functions remain on Vercel. A Google connection in ChatGPT does not automatically authorize a separately deployed website.

No Google resources have been provisioned or emails sent by this change. Do not paste credentials into chat or commit them. The code fails closed if storage is not configured, so accepted scans never silently run without a record.

## Information to choose first

- Google Cloud/Firebase **project ID** and the region for its security database.
- A **licensed Workspace mailbox** for report sending, such as `reports@archwoodinnovations.com` or your existing `info@...` user. A Google Group alone is not an authenticating mailbox.
- Optional owner notification email address.

Project IDs and mailbox addresses can be discussed normally. OAuth client secrets, refresh tokens, rate-limit secrets, and cron secrets belong in Vercel's environment settings or your local protected environment file, not in GitHub/chat. A Firebase web API key alone cannot authorize these server operations.

## 1. Firestore database and access

Enable Firestore in Native mode, IAM Service Account Credentials API, and Security Token Service API in the chosen Google Cloud project. The created project is **archwood-security**, with the **(default)** database, Standard edition, Native mode, in **nam5**. The branch now matches that database ID in `.env.example`, `firebase.json`, and the server fallback. Keep this project dedicated to the security tool. If using a different database or project for another environment, update its configuration deliberately.

Use a dedicated security project where possible. Create a backend service account with `roles/datastore.user` for that dedicated project, or equivalent appropriately scoped Firestore IAM. Do not grant Owner/Editor. Server SDK access is governed by IAM and bypasses Firebase client rules. Deploy the included deny-all client rules and composite index **to the security database only**. The `report` and `summary` fields are excluded from indexing.

Using the Firebase CLI after selecting/confirming the actual project:

```
firebase deploy --only firestore --project YOUR_PROJECT_ID
```

Inspect `firebase.json` before deploying. It targets the **(default)** database in the project you specify, so use **archwood-security** here and do not point this deny-all rule set at a different app’s project. This command requires your own authorized CLI session. It does not run automatically in Vercel.

### Keyless Vercel authentication

Follow Vercel's Google Cloud OIDC guide: https://vercel.com/docs/oidc/gcp

Create a Workload Identity Pool and OIDC provider. Use your team's configured Vercel issuer. Allow the exact default Vercel audience `https://vercel.com/YOUR_TEAM_SLUG`, map `google.subject` to `assertion.sub`, and bind only the exact intended team/project/environment subject to the backend service account with `roles/iam.workloadIdentityUser`. Do not authorize every principal in the pool. Use a separate project/database/mailbox for preview testing where practical.

Set these in Vercel:

- `GCP_PROJECT_ID`
- `GCP_FIRESTORE_DATABASE_ID=(default)`
- `GCP_AUTH_MODE=wif`
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- `RATE_LIMIT_SECRET`: at least 32 random characters, independent of all Google credentials.

The code exchanges Vercel's short-lived OIDC identity for a Google service-account token. No Google service-account private key is stored by this integration. Restrict the federation trust and service-account role to this workload.

Locally, use `GCP_AUTH_MODE=adc` with `gcloud auth application-default login` or your approved ADC service-account impersonation setup. If the backend is later moved to Google Cloud, ADC can instead use an attached service account. No hosting move is needed for this branch.

## 2. Gmail sending authorization

Enable the Gmail API in your Google Cloud project. Create an OAuth app for your Workspace organization, preferably **Internal**. Authorize the dedicated sending user for only:

```
https://www.googleapis.com/auth/gmail.send
```

The app sends messages but does not request access to read the mailbox, modify messages, or delete email. Domain-wide delegation is **not needed or implemented** for this route. Internal organizational policies may require admin approval for the OAuth client. External/testing OAuth apps have different token/verification requirements, so choose the appropriate consent configuration deliberately.

For the included local helper, create a Web application OAuth client and register this exact loopback redirect URI:

```
http://127.0.0.1:53682/oauth2/callback
```

Set `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` in your local protected environment file, run `npm ci`, then:

```
npm run gmail:authorize
```

Open the printed Google authorization URL in your own browser, sign in **as the report-sending mailbox**, and approve the send-only scope. The helper uses state and PKCE. It saves the refresh token locally with restrictive permissions and does not print it. Copy the saved token securely to Vercel. The helper does not send any email. Do not upload the local environment file.

Set in Vercel:

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`, the mailbox you authorized.
- `REPORT_FROM_EMAIL`, for example `Archwood Innovations <reports@archwoodinnovations.com>`. Its address must match `GMAIL_SENDER_EMAIL`.
- Optional `LEAD_NOTIFICATION_EMAIL` for a separate owner notification after a private report link is opened. Leave empty for database-only lead tracking.

Workspace/Gmail account sending limits and API quotas apply. This is for modest transactional report traffic, not bulk marketing. Successful API submission is recorded as acceptance, not proof of inbox delivery. Later bounces/delivery tracking are not automatically reconciled by this send-only integration.

## 3. Tracking records and emails

Use the Firebase/Google Cloud Firestore console to inspect these private collections:

| Collection | Records |
| --- | --- |
| `security_scans` | Every accepted normalized website submission, review outcome, summary, and temporary report |
| `security_leads` | Deduplicated report-request email addresses |
| `security_report_access` | Email request, related lead/scan, optional help request, report-link opened time, send status, Gmail ID, expansion status |
| `security_mail` | Recipient, sender, subject, attempted time, stable RFC Message-ID, Gmail message/thread IDs, accepted/rejected/auth-failed/uncertain status |
| `security_tokens` | Hashed private link lookup, with seven-day expiry |
| `security_rates` | Shared bounded request counters |

Actual report and notification messages are sent through the chosen mailbox. Inspect its **Sent** folder for sent messages. You can correlate the stable `message_id` in the mail log using Gmail search `rfc822msgid:VALUE` (without angle brackets). The application does not request Gmail read scopes just to display a copy of the inbox/Sent folder.

For a lead CSV usable in Google Sheets, an owner with Google Cloud ADC/IAM can run:

```
npm run --silent export:security > exports/leads.csv
```

Create the `exports` directory locally first; it is ignored by git. The command exports the most recent 1,000 requests by default, and `SECURITY_EXPORT_LIMIT` can set a bounded limit up to 10,000. It does not expose report credentials or full evidence. The console's `security_mail` collection remains the authoritative send-attempt log.

### Duplicate-send handling

Gmail's send API does not provide Resend-style send idempotency keys. The code therefore claims a persistent mail-log entry transactionally before sending. Accepted attempts are reused, while uncertain/interrupted attempts are **not automatically resent**. If a connection fails after Google may have accepted a message, check the mailbox and mail log before taking manual action. A stable Message-ID helps reconciliation but is not itself a promise that Gmail deduplicates messages.

Owner notification subjects begin with `[HELP REQUESTED]` when the visitor opted into contact, or `[REPORT OPENED]` otherwise. Both include the available initial report findings, evidence, confidence, selected PHP advisories, and limitations inline, without a visitor access token. These are snapshots at opening time, not later expanded results. Gmail filters can label messages whose subject contains `[HELP REQUESTED]`. The email copies follow Workspace retention separately from Firestore cleanup.

The owner notification is separate from the visitor's access email and never includes their private report token. It is best effort, not a guaranteed background queue. Notification failures remain in the access record; accepted or ambiguous mail attempts are protected from blind replay. An opened report link is not proof of website ownership or a qualified sales lead.

## 4. Domains, retention, and testing

Set `PUBLIC_SITE_URL=https://archwoodinnovations.com` in Production. In Preview omit it to use `VERCEL_URL`, or supply your trusted preview origin. Preview authentication can also protect emailed preview links.

Set a long random `CRON_SECRET` for the existing daily Vercel retention route and confirm successful runs in Vercel. Private links expire after seven days. Details/receipt credentials are removed after fourteen days. Scan/lead/request/mail metadata is retained for ninety days. Cleanup is bounded to 200 documents per collection per run; monitor for backlog at higher volume and arrange sufficient cleanup capacity. Optional Firestore TTL on `purge_at` can help but is asynchronous and does not replace token-expiry enforcement or removal of report fields. Gmail mailbox retention and Google/Vercel logs/backups are separate from application retention.

Review `/security-privacy` against your actual practices. The notice describes this implementation; it is not a legal immunity promise.

Before merging:

1. Run `npm ci` and `npm test`.
2. Configure the actual Google project, rules/index, IAM/federation, mailbox authorization, and Vercel secrets.
3. Use your own website and mailbox to test the quick snapshot, Firestore records, emailed link, report download, one successful expanded review, owner notification, CSV export, and cleanup.
4. Confirm unauthenticated Firebase clients cannot read/write the dedicated database. Confirm the Gmail OAuth grant has only the sending scope.
5. Review `/security-preview` and `/website-security` on your target devices.

Repository tests use transactional test doubles and injected Gmail responses. They do not provision Google resources, validate live IAM/rules/indexes, send real email, or establish inbox delivery. Those checks require your configured project and mailbox.

## References

- https://vercel.com/docs/oidc/gcp
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://developers.google.com/workspace/gmail/api/guides/sending
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/reference/quota
