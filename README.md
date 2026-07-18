# Looksy documentation

This is the public source repository for [withlooksy.com/docs](https://withlooksy.com/docs).

The repository root is the Mintlify project root. `docs.json`, `index.mdx`, and every navigated MDX page must stay together unless the Mintlify Git settings are deliberately migrated. This dedicated repository is the correct supported layout; the docs do not need to move into the Shopify application repository.

## Deployment

- GitHub repository: `withlooksy/docs`
- Production branch: `main`
- Publisher: Mintlify GitHub App
- Production URL: [withlooksy.com/docs](https://withlooksy.com/docs)

A push to `main` can publish the live docs. Use a feature branch and pull request for changes, then verify the Mintlify deployment before treating the change as live.

## Local checks

The audit has no package dependencies. Use Node 20 LTS for the pinned Mintlify CLI checks.

```bash
node scripts/aeo-audit.mjs --write-ai-index
node scripts/aeo-audit.mjs --json-output artifacts/aeo-source-audit.json
npx --yes mintlify@4.2.715 validate
npx --yes mintlify@4.2.715 broken-links --check-redirects
```

After a successful Mintlify deployment:

```bash
node scripts/aeo-audit.mjs --live --json-output artifacts/aeo-live-audit.json
```

See [AEO_RUNBOOK.md](./AEO_RUNBOOK.md) for the source-of-truth order, enforced checks, scheduled workflow, and failure handling.

## Content rules

- Answer the merchant's question directly before adding detail.
- Link primary sources beside facts that can change.
- Treat pricing, credits, product behavior, privacy, integrations, and legal terms as high-risk facts.
- Qualify industry research and illustrative calculations.
- Do not invent merchant results, universal compatibility, performance guarantees, legal compliance, or AI citations.
- Keep indexable pages in `docs.json` navigation; the site intentionally uses Mintlify's `navigable` indexing mode.

## Technical ownership

Mintlify generates the documentation sitemap, robots file, semantic HTML, and JSON-LD. The repository provides reviewed `llms.txt` and `skill.md` files so machine-readable discovery stays aligned with navigation and approved commercial facts.

Do not add custom root JavaScript or a second structured-data provider without an explicit review. Mintlify automatically loads root JavaScript files on every documentation page.

## Support

- Product and documentation support: [caleb@withlooksy.com](mailto:caleb@withlooksy.com)
- Public app listing: [apps.shopify.com/looksy](https://apps.shopify.com/looksy)
