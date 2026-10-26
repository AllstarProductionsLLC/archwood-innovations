# Archwood Innovations

A responsive company website inspired by the supplied **Bridging Analog to Digital** pitch deck. Built with semantic HTML, CSS, and JavaScript, with a static frontend and no build step. The server uses pinned Google Cloud authentication and Firestore libraries. The website security tool uses a Node.js Vercel Function.

## What works

- Responsive navigation with a keyboard-accessible mobile menu.
- Five expandable service groups, including cybersecurity, website reviews, patching support, system audits, and team training.
- Interactive time-allocation chart, based on the deck's illustrative 80/20 to 30/70 scenario.
- A timber-to-wireframe bridge reveal, with an opening sequence, scroll control, material slider, presets, and replay.
- A stronger perspective response to pointer movement, with a motion toggle and automatic reduced-motion support.
- A keyboard-accessible sector explorer that opens the relevant service.
- An interactive manual-versus-automated inquiry workflow illustration.
- Email and telephone links using the deck's contact details. The conversation buttons open the visitor's email application.
- Local fonts and artwork, descriptive metadata, visible focus states, and core content that works without JavaScript.

The website security check includes a server-side lead and report workflow using Google Cloud Firestore and Google Workspace Gmail. Those services require environment configuration before use. There is no account system, billing, advertising analytics, or external client script. See `docs/security-lead-setup.md` before merging the lead-generation branch.

## Deploy on Vercel

1. Add these files to a GitHub repository, preserving the folder structure.
2. In Vercel, create a project and import that repository.
3. Keep the repository root as the Root Directory. Use **Other** as the Framework Preset.
4. Keep the Build Command empty and use `npm ci` as the Install Command. The included `vercel.json` sets the Output Directory to `dist`.
5. Deploy. Connect your domain in Vercel when you are ready.

Once the GitHub repository is connected, subsequent pushes to its production branch trigger Vercel deployments according to your Vercel Git settings.

Official references: [Importing a Git repository](https://vercel.com/docs/deployments/git) and [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Preview locally

Run `npm ci`, then `npm run dev` from the repository root, then open `http://localhost:3000`. Google Cloud and Workspace configuration is documented in `docs/security-lead-setup.md`. This serves the static pages and the assessment API together. A static file server alone cannot run the assessment backend.


## Edit the site

| File | Purpose |
| --- | --- |
| `dist/index.html` | Content, services, navigation, chart markup, contact links, and metadata |
| `dist/styles.css` | Brand colors, typography, layout, responsive behavior, and motion styling |
| `dist/app.js` | Mobile menu, accordions, interactive chart, and shared motion preference |
| `dist/experience.css` | Reveal layout, responsive controls, sector explorer, and workflow styling |
| `dist/reveal-model.js` | Independent timeline for scrolling, replay, manual input, and reduced motion |
| `dist/bridge-reveal.js` | Bridge material masks, perspective, loading fallback, and reveal controls |
| `dist/experience.js` | Sector tabs and the illustrative inquiry workflow |
| `dist/assets/` | Local bridge artwork, extracted brand mark, and Manrope fonts |
| `vercel.json` | Vercel output directory and response headers |
| `.openai/hosting.json` | Identity and static-output settings for the private review site |

The `dist` directory contains the authored source that browsers receive. It is intentionally tracked in Git. The private review site's hosting metadata is not needed by Vercel, which ignores that directory.

To add a contact form later, replace the contact section's email action with a real form and a server-side endpoint or chosen form provider. Validate and rate-limit submissions server-side, store credentials as deployment environment variables, and show success only after a successful response. Update the Content Security Policy if an integration needs an additional origin. This is an integration point, not an implemented feature.

## Content and visual provenance

The mission, service offering, sectors, and contact information come from the Archwood Innovations pitch deck supplied on September 6, 2026. The bridge artwork is a bespoke generated adaptation of the deck's cover concept. The small brand mark was extracted from the supplied PDF. The original deck is not included in the public website files.

The time-allocation visualization is clearly identified as an illustrative scenario, not measured customer performance. Older market forecasts and unsupported conversion figures from the deck were not republished as current facts.

Manrope is self-hosted under the SIL Open Font License. See `FONT-LICENSE.txt`. Company artwork and website content are not assigned an open-source license by this project.

Design guidance consulted: [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md). The site follows the deck's visual direction, with a single prominent bridge image, deliberate typography, and motion tied to interaction.

## Checks

Run the interaction-state tests without installing anything:

```sh
node --test tests/reveal-model.test.cjs
```

The tests cover interrupted playback, manual control, scroll direction, pause/resume, reduced motion, hidden tabs, and input bounds. Source checks cover JavaScript syntax, local asset references, internal destinations, and image integrity. Browser visual and end-to-end testing have not been performed in this environment. Review the branch preview on your target devices before merging.

## Review the interactive bridge branch

The `feature/bridge-reveal` branch is for reviewing the expanded interactions before merging into `main`. Open its pull request to find Vercel's preview link. The existing `vercel.json` works for this branch without changes.

The hero uses two aligned material-state images and CSS perspective for a dimensional reveal. It runs a short opening sequence, then connects to scroll position. On larger, sufficiently tall screens, the hero stays in view for part of the transition. Smaller screens keep natural page flow. Dragging the slider or choosing a material preset takes manual control; **Follow scroll** reconnects it. **Replay** runs once and holds the digital frame.

Reduced-motion preferences disable automatic playback, scroll-driven motion, and perspective. The slider and material presets remain available. If a material image fails to load, the original bridge image remains visible and the page retains its natural flow.

The inquiry workflow is an illustration with no backend or outgoing requests. Manual mode advances one handoff per click; automation mode plays the configured sequence. Sector examples describe possible uses of the existing services, rather than client case studies.

The analog and digital image states were created with the built-in image-generation tool as material edits of the original hero. Both prompts preserve the original camera, bridge silhouette, scale, placement, and dark background. The analog prompt specifies natural oak and physical cables; the digital prompt specifies an entirely cyan wireframe bridge with dark transparent interiors. Both exclude text and additional scenery. Final assets: `dist/assets/bridge-analog.webp` and `dist/assets/bridge-digital.webp`.

## Scroll-linked impact and Archwood Studios

The impact chart progresses from Manual (80/20) to Connected (30/70) as its bars move through the viewport. The slider takes manual control; **Follow scroll** reconnects it. It reuses the hero's tested timeline, respects Pause motion and reduced-motion preferences, and schedules updates only on scroll or resize. With reduced motion, the original connected scenario remains visible and the slider stays usable. The inquiry workflow still starts only through its existing controls.

**Executive Tools** opens the standalone website at `https://archwoodstudios.com/` in the current tab. The old `/archwood-studios` route redirects there through Vercel. The embedded app page and its iframe-specific CSP allowance have been removed.

## Website security review and email reports

The fifth expertise panel links to `/website-security`. The public page preserves the animated shield and live server-stage progress. A free homepage check shows a concise, qualified summary and next-step CTA. An optional emailed private link unlocks the detailed report, an HTML download, and one expanded review of up to three eligible same-origin pages. Detailed findings, PHP advisories, and coverage are collapsed by default.

The large letter grade is replaced with descriptive states and counts. Green is encouraging; blue/amber recommend review; red is reserved for a possible critical PHP version match, with explicit uncertainty. Missing headers alone are not presented as proof of danger. The curated PHP advisory rules remain dated October 25, 2026 and are not a live CVE feed.

Every accepted valid scan is recorded in Firestore before outbound requests, including scans that later fail or are interrupted. Email requests and optional requests for help are separate records; owner notifications are sent when a private report link is opened. The system never silently runs an unrecorded scan if storage is unavailable. It does not subscribe visitors to marketing.

**Activation is required:** create the dedicated Firestore database and deploy its rules/index, configure keyless Google Cloud access and send-only Gmail OAuth in Vercel, and set the retention cron secret. Preview/Production deployments do not inherit credentials from the GitHub connector. No AI API key is needed.

- `docs/security-lead-setup.md`: exact activation, private lead-list views, retention, provider behavior, limits, and test checklist.
- `docs/security-funnel-design.md`: research, free/email tier decision, conditional colors/CTAs, and SEO/share strategy.
- `/security-preview`: clearly labeled, noindex sample states for visual review without credentials. No scans, collection, or email occur on that page.
- `/security-privacy`: public information-use and assessment-scope notice.

The existing public-only DNS pinning, redirect validation, verified TLS, body/time bounds, and passive request restrictions remain in place. Expanded requests are now gated on an opened, unexpired email-report link, not just hidden in the UI. Firestore transactions provide shared request and expansion limits. Private tokens are generated securely and stored only as hashes. Firestore also records Gmail recipients, message/thread IDs, and acceptance/uncertainty states. A report link is a bearer credential and should be kept private.

Run `npm test` for existing interaction, scan transport, PHP boundaries, summary tones, gate authorization, persistence failures, email acceptance, and report escaping tests. Provider/database tests use injected responses; real Google IAM/rules/indexes and email delivery require validation after credentials are supplied. Vercel preview authentication can prevent browser verification in this environment. Review the branch on target devices before merging.

Cybersecurity & cyber defense is first in the homepage expertise list. The remaining service panels retain their order, wording, and links. The Google integration uses Vercel OIDC federation for Firestore and a dedicated Workspace user’s Gmail send-only OAuth grant. Domain-wide mailbox delegation and service-account private keys are not used.
