# Looksy documentation SEO and AEO strategy

## Objective

Make the existing documentation the clearest and most reliable public source for Looksy setup, product behavior, pricing, and troubleshooting. Search visibility and answer-engine reuse are outcomes of factual agreement, crawlability, useful answers, and measurable merchant value—not promises to manufacture citations.

## Priorities

1. **Factual trust:** keep volatile claims aligned with the current product, Looksy website, Shopify listing, and published policies.
2. **Answer extraction:** lead high-intent pages with a concise answer, then steps, caveats, and sources.
3. **Discovery parity:** keep navigation, sitemap, HTML, Markdown, `llms.txt`, and `skill.md` in agreement.
4. **Entity consistency:** use `Looksy`, legal name `Looksy, LLC`, and stable ID `https://withlooksy.com/#organization` across documentation schema.
5. **Measurement:** improve existing high-impression pages before expanding the corpus without evidence.

## 30-day operating cycle

### Week 1: truth and crawlability

- Reconcile pricing, credits, product capabilities, integrations, privacy, and limitations.
- Remove unsupported absolute claims and simulated merchant results.
- Keep all intended pages navigated and indexable.
- Verify canonical URLs, sitemap coverage, HTML, Markdown, and AI-discovery files.

### Week 2: answer and evidence quality

- Improve the highest-impression pages with a direct opening answer.
- Add primary sources or clearly identify illustrative examples.
- Use stable organization authorship and useful update dates.
- Strengthen internal links around merchant tasks rather than keyword repetition.

### Week 3: entity and distribution consistency

- Check that marketing pages and docs use the same current product facts.
- Keep Mintlify's first-party Article, TechArticle, WebSite, Organization, and breadcrumb schema internally consistent.
- Review the public `skill.md` and `llms.txt` after material content changes.

### Week 4: measurement and next actions

- Review Search Console impressions, clicks, CTR, and indexing.
- Review answer-engine referral sessions and assisted installs or demo bookings where available.
- Run manual factual spot checks for representative merchant questions.
- Select the next existing-page improvement from observed demand; create new content only for a demonstrated gap.

## Success measures

- zero contradicted high-risk facts;
- complete navigation, sitemap, Markdown, and AI-index parity;
- scheduled source and live audits passing;
- improved CTR and qualified traffic on priority existing pages;
- accurate answer-engine responses in repeatable manual spot checks;
- attributable assisted installs or enquiries from AI referrals where measurement is available.

## Release gate

Every docs pull request must pass the source audit. After Mintlify publishes `main`, the live audit must pass before the change is considered complete. A crawler, factual, canonical, or machine-readable-content failure is a real release defect, not a reason to weaken the check.
