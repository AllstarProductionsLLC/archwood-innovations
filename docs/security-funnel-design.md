# Security check: product and research decisions

## The chosen freemium model

The quick homepage snapshot is free without an email. It provides real value: observed protections, configuration items to review, up to three highlights, a visible critical-PHP indication when warranted, and a context-aware next step. The full evidence report, readable download, and one expanded public review are unlocked through an emailed private link. This is an email-gated service tier, not a paid subscription.

The form asks for one email field and an optional, separate request for help. The visitor sees the value exchange and information-use notice before submitting. Confirming the emailed link is preferable here to treating any typed address as a confirmed lead. Owner notifications exclude the report access credential.

## Reduce clutter without changing the evidence

Progressive disclosure puts an approachable summary first and defers individual findings, PHP details, and coverage into closed panels. The previous large A–F grade is replaced with descriptive, qualified language and counts of observed checks. The underlying findings are preserved; scores have not been inflated to manufacture a better result.

Four visual states map to `lib/security-summary.cjs`:

- Green: all basic protections observed and no additional public risk flags. Encouraging language, with an explicit limited-coverage caveat.
- Blue: up to two configuration items to review, without other risk flags.
- Amber: several missing protections or other possible risk signals. Review is recommended without claiming danger or compromise.
- Red: an advertised PHP version matches selected critical advisories. Prompt verification is recommended; version banners and backported patches can make the inference wrong. Critical indications are not hidden behind the email form.

The CTA is visible directly below the assessment: maintain a good foundation, discuss a few next steps, prioritize several findings, or request a priority review. It is an invitation to help rather than a claim that the visitor must buy a service.

## Search and sharing

A clear public page title/H1, canonical URL, descriptive static copy and FAQ, relevant internal link, sitemap, robots policy, and WebPage/Service structured data explain the tool to visitors and search engines. Open Graph/Twitter tags use a dedicated 1200×630 brand card. No fabricated ratings or rich-result claims are included. Private results stay behind token-gated POST endpoints with noindex headers; public page URLs contain no scan data. These measures support discovery but do not guarantee ranking, snippets, rich results, or social-platform cache refreshes.

## Sources consulted

- Nielsen Norman Group, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- Nielsen Norman Group, 4 Principles to Reduce Cognitive Load in Forms: https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/
- HubSpot, Gated Content: https://blog.hubspot.com/marketing/ungated-content-free
- Google Search Central, title links: https://developers.google.com/search/docs/appearance/title-link
- Google Search Central, sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Open Graph protocol: https://ogp.me/
- Supabase, securing the API: https://supabase.com/docs/guides/api/securing-your-api
- Resend, email API: https://resend.com/docs/api-reference/emails/send-email
- Resend, idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys

The flow is a design inference from these sources and the business goal, not a claim of measured conversion improvement. Review actual request-to-link-open and help-request rates before adding further form fields or introducing paid tiers.
