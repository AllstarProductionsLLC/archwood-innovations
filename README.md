# Archwood Innovations

A responsive company website inspired by the supplied **Bridging Analog to Digital** pitch deck. Built with semantic HTML, CSS, and JavaScript, with no runtime dependencies or build step.

## What works

- Responsive navigation with a keyboard-accessible mobile menu.
- Four expandable service groups covering all eight offerings in the deck.
- Interactive time-allocation chart, based on the deck's illustrative 80/20 to 30/70 scenario.
- Subtle pointer and scroll response on the bridge artwork, with a motion toggle and automatic reduced-motion support.
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

From the repository root:

```sh
python3 -m http.server 3000 --directory dist
```

Then open `http://localhost:3000`. No package installation is needed. The same site can also be previewed by opening `dist/index.html` directly.

## Edit the site

| File | Purpose |
| --- | --- |
| `dist/index.html` | Content, services, navigation, chart markup, contact links, and metadata |
| `dist/styles.css` | Brand colors, typography, layout, responsive behavior, and motion styling |
| `dist/app.js` | Mobile menu, accordion enhancement, interactive chart, and bridge motion |
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

The delivery was checked for JavaScript syntax, valid asset references, working internal destinations, image/font integrity, and deployment archive integrity. Browser visual and end-to-end testing have not been performed in this environment. Review the private preview on your target devices before a public launch.
