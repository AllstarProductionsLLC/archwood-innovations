# Archwood Innovations

A responsive company website inspired by the supplied **Bridging Analog to Digital** pitch deck. Built with semantic HTML, CSS, and JavaScript, with no third-party runtime dependencies or build step. The website security tool uses a Node.js Vercel Function.

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

There is no lead-capture backend, account system, analytics, or external script. No button pretends to submit data. Forms and other integrations can be added when their behavior and provider are chosen.

## Deploy on Vercel

1. Add these files to a GitHub repository, preserving the folder structure.
2. In Vercel, create a project and import that repository.
3. Keep the repository root as the Root Directory. Use **Other** as the Framework Preset.
4. Keep the Build Command and Install Command empty. The included `vercel.json` sets the Output Directory to `dist`.
5. Deploy. Connect your domain in Vercel when you are ready.

Once the GitHub repository is connected, subsequent pushes to its production branch trigger Vercel deployments according to your Vercel Git settings.

Official references: [Importing a Git repository](https://vercel.com/docs/deployments/git) and [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Preview locally

Run `npm run dev` from the repository root, then open `http://localhost:3000`. No package installation or API key is needed. This serves the static pages and the assessment API together. A static file server alone cannot run the assessment backend.


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

## Website security review

The navigation uses title case consistently: Our Approach, Expertise, The Impact, Executive Tools, and Let’s Talk. The fifth expertise panel opens `/website-security` through **Test my website**. All service panels remain closed on initial load.

The tool runs a real passive assessment through `api/security-scan.js`, with Quick (homepage) and Expanded (homepage plus up to two eligible, same-origin informational links). It makes ordinary HTTPS GET requests, does not log in, submit forms, probe hidden paths, enumerate ports, or test exploits. Its animated progress follows actual streamed server stages, rather than a timer. Reports include evidence, qualitative confidence, scope, an export, and an email contact link. Raw HTML and cookie values are never returned in the report. The app does not persist reports or submissions, although Vercel/platform access logs may still exist.

### What the grade means

Six basic response checks total 100 points: certificate-validated HTTPS (20), HSTS with positive max-age (20), a basic enforced CSP source restriction (20), framing protection (15), nosniff (15), and referrer policy (10). A=90+, B=80+, C=65+, D=50+, F=below 50. Expanded mode uses the weakest observed result per control. The score describes these public configuration controls only. It is not an overall security score. Cookie attributes, HTTP resource references, technology banners, and PHP advisory indications appear separately and do not change the configuration grade. An unassessable homepage produces no grade. The report identifies skipped pages and truncated markup.

### PHP advisory rules

The selected, curated PHP rules were checked against the vendor on October 25, 2026. They cover CVE-2026-109618 and CVE-2026-109619 using the published fixes 8.2.35, 8.3.36, 8.4.27, and 8.5.12, plus a configuration-only notice for CVE-2026-115560. These are advisory-specific thresholds, not an automatically updated latest-version feed. Hidden, conflicting, prerelease, and distributor-suffixed banners remain unknown. Affected-looking banners are only potential exposure, since the tool cannot verify vendor backports or runtime configuration. WordPress markup never establishes a PHP version. Keep `lib/security-review.cjs` and the page’s review date updated when advisories change.

Primary sources:
- https://www.php.net/archive/2026.php
- https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w
- https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp

### Deployment and operational boundaries

Keep Vercel's Root Directory at the repository root. The static output remains `dist`; the root `api` directory is discovered as a Node.js Function. `package.json` selects Node 22 and the function is allowed 60 seconds. There are no AI, Gemini, or scanner API credentials to configure.

Requests are HTTPS-only on the standard port. Inputs are normalized to the homepage, and credentials/IP literals/local hostnames are rejected. Every DNS address must be public, the validated addresses are pinned into the actual HTTPS request, and redirects repeat validation. Expanded requests cannot leave the homepage’s final origin. Each response is capped at 256 KiB, redirects are limited, TLS verification remains enabled, and the review has a 35-second deadline. Private, loopback, link-local, reserved, multicast, and IPv4-mapped IPv6 destinations are blocked.

The API requires JSON, same-site browser requests, and an authorization declaration. It has per-instance limits of five requests per client hash per ten minutes, eight concurrent requests, and bounded rate-limit state. Client hashes are held in memory only and expire. **These limits are not distributed:** cold starts and additional Vercel instances have independent counters. For a high-traffic launch, enforce shared rate limits with the Vercel Firewall or a durable rate-limit service. Provider log retention and traffic costs are controlled in Vercel. No user input is passed to a shell or executed, and report rendering uses text nodes.

Run `npm test` for controller, SSRF, redirect/DNS pinning, report grading, PHP boundaries, and API tests. Browser verification may be limited by Vercel preview authentication. Review the preview on target devices before merging.
