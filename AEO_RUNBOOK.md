# Looksy docs AEO and crawlability runbook

## Ownership and deployment

- Source repository: `withlooksy/docs`
- Mintlify project root: the repository root, where `docs.json` lives
- Production URL: [withlooksy.com/docs](https://withlooksy.com/docs)
- Deployment branch: `main`
- Production behavior: Mintlify publishes a new deployment after a push to `main`

A dedicated documentation repository is a supported Mintlify layout. Do not move these files into the Shopify application repository unless the Mintlify Git settings and deployment ownership are deliberately migrated at the same time.

## Source-of-truth order

For commercial or product claims, use this order:

1. Current Looksy product behavior and billing configuration
2. [Looksy website](https://withlooksy.com/) and [Shopify App Store listing](https://apps.shopify.com/looksy)
3. Published docs
4. Old strategy, planning, or campaign documents

If the first two sources disagree, stop and resolve the product fact before publishing an answer. Never infer plan terms, legal compliance, performance guarantees, or merchant outcomes.

The machine-readable baseline is `facts/aeo-baseline.json`. Update it in the same pull request as an approved pricing or identity change.

## What the audit enforces

Run the source checks before every documentation change:

```bash
node scripts/aeo-audit.mjs --json-output artifacts/aeo-source-audit.json
```

When navigation, titles, or descriptions change, regenerate and review the public AI index first:

```bash
node scripts/aeo-audit.mjs --write-ai-index
```

The source audit verifies:

- every MDX page is present exactly once in Mintlify navigation;
- established routes remain live or have a permanent redirect, and new routes join the append-only protected inventory;
- every page has a unique title and description and is not marked `noindex`;
- root-relative documentation links resolve;
- canonical, indexing, and organization identity settings remain explicit;
- Mintlify remains the sole documentation structured-data owner and the retired SchemaRabbit injection stays absent;
- current pricing facts and their primary-source links are present;
- retired prices and unsupported absolute claims do not return.

Validate the complete Mintlify build and redirects as well:

```bash
npx --yes mintlify@4.2.715 validate
npx --yes mintlify@4.2.715 broken-links --check-redirects
```

Use Node 20 LTS for Mintlify CLI commands. When adding a route, add it to `protectedRoutes` in `facts/aeo-baseline.json`. When moving or retiring one, keep it in that inventory and add a permanent `docs.json` redirect to a current page.

Run the live checks after a successful Mintlify deployment:

```bash
node scripts/aeo-audit.mjs --live --json-output artifacts/aeo-live-audit.json
```

The live audit also verifies:

- `robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt` are served;
- Mintlify skill-discovery and MCP server-card endpoints are served;
- root Framer discovery routes match their reviewed repository sources;
- all navigated source pages appear in the sitemap;
- every sitemap URL returns indexable, self-canonical HTML with one H1 and article schema tied to the approved `Looksy, LLC` publisher;
- every page's Markdown variant matches its reviewed source and is served without bare-origin internal links;
- `llms-full.txt` contains every current page exactly once and no retired pages;
- the live pricing answer, homepage monthly plan summary, Shopify App Store pricing, and approved baseline agree; annual prices remain required on annual-plan surfaces and any conflicting annual claim still fails;
- common search and answer-engine user agents can retrieve HTML and Markdown representations across every top-level docs section.

## Root discovery completeness

Framer serves five reviewed static files at the main origin. Their repository sources and public routes are:

| Repository source | Public route |
| --- | --- |
| `root-discovery/robots.txt` | `/robots.txt` |
| `llms.txt` | `/llms.txt` |
| `skill.md` | `/skill.md` |
| `root-discovery/.well-known/skills/index.json` | `/.well-known/skills/index.json` |
| `root-discovery/.well-known/skills/looksy/SKILL.md` | `/.well-known/skills/looksy/skill.md` |

Framer normalizes the uploaded `SKILL.md` filename to lowercase. Its current plan permits five static files, so the recommended agent-skills manifest, agent card, and MCP server card remain canonical below `/docs`; do not buy a file add-on or create more root copies without an explicit owner decision.

The root skill gives answer engines a stable reviewed source while Mintlify regenerates its own `/docs/skill.md`. Mintlify documents that skill updates can take up to 24 hours. The live audit remains strict about the generated copy, so a recent content deployment can fail until that copy catches up; the daily run will verify eventual convergence.

The root `robots.txt` must allow `/docs` and advertise `https://withlooksy.com/docs/sitemap.xml` alongside the main-site sitemap. Root `/llms.txt` is a second publication of the reviewed documentation answer index in this repository. It must match that source, link to `/docs`, and avoid retired commercial facts or unsupported product claims.

Update these files in the repository, upload the mapped files through **Framer Dashboard -> withlooksy.com -> Files**, publish Framer, and run the live audit. The audit compares root resources to their reviewed repository sources; it does not require them to match Mintlify-generated resources byte for byte.

If `/docs/api-reference/openapi.json` serves Mintlify's sample Plant Store after this repository deploys without an OpenAPI configuration, remove the stale API specification in the Mintlify dashboard or ask Mintlify support to clear the project setting. The audit treats that unrelated answer surface as a failure. The purge is complete only when both the custom-domain and `looksy.mintlify.app` routes return HTTP 404 or 410 without the sample body.

Mintlify support confirmed that `X-Robots-Tag: noindex, nofollow` on generated Markdown and `.md` responses is currently platform-wide and is not controlled by `seo.indexing`. Keep that state visible as a warning while the corresponding HTML remains indexable. An HTML `noindex` remains a failure, and the docs must not add a conflicting response header to mask Mintlify's upstream policy.

## Schedule and failure handling

`.github/workflows/aeo-docs-audit.yml` runs source checks on pull requests and changes to `main`. It runs the complete live audit every day at 08:17 UTC, on manual dispatch, and after a successful Mintlify deployment event for the production docs URL. Deployment-triggered live checks retry six times over about eight minutes to absorb ordinary edge propagation. A terminal Mintlify deployment failure or error produces a failed workflow instead of a skipped green run.

A failed check is a release blocker for the affected docs change. The workflow uploads a 30-day JSON artifact and writes a concise GitHub job summary. Fix the source or deployment; do not weaken a check merely to make CI green.

## Content standard

- Lead answer pages with a direct, self-contained answer.
- Prefer primary sources and link them beside volatile facts.
- Use stable organization authorship: `Looksy editorial team`, published by `Looksy, LLC`.
- Qualify examples and industry research; do not present modeled outcomes as Looksy customer results.
- Do not promise AI citations. Measure discoverability, factual agreement, crawler access, referral sessions, and assisted conversions instead.
- Keep pages in navigation when they should be indexed. Mintlify's `navigable` indexing mode intentionally excludes unlisted pages.

## Monthly review

At least monthly, review:

- plan prices, credit allowances, and product capabilities;
- support questions that deserve a clearer existing answer;
- Search Console impressions, clicks, CTR, and indexing;
- answer-engine referrals and manual factual spot checks;
- failed or flaky scheduled audits;
- author, update-date, and source coverage on the highest-impression pages.
