---
name: Looksy
description: Use when a Shopify merchant needs authoritative Looksy virtual try-on setup, product, pricing, integration, or troubleshooting guidance.
metadata:
  mintlify-proj: looksy
  version: "2.0"
---

# Looksy documentation skill

## Product summary

Looksy is an AI virtual try-on app for Shopify. It helps shoppers create a visual preview using a photo and a merchant's product imagery. A generated preview can help a shopper judge style and appearance, but it is not a sizing or fit guarantee. **Find Your Size** is a separate feature that compares measurements entered by the shopper with the merchant's product size chart.

On enabled products, Looksy automatically places the **Try On** button over the main product image and shows the generated preview in that same image area. The Shopify app embed turns this storefront behavior on; merchants do not place a separate app block on every product page.

The optional **Virtual Fitting Room** is a different storefront experience for multi-product outfit building. It uses a Shopify app block on its own page and does not replace the automatic product-image experience.

Use this skill to retrieve Looksy's published merchant documentation. Treat production-released product behavior, the in-app Shopify approval flow, and the Shopify App Store listing as the commercial authority; do not infer plan terms, legal compliance, performance guarantees, supported products, or merchant outcomes from a marketing page.

## Released billing catalog

| Plan | Monthly price | Included credits | Additional credit | Annual catalog price |
| --- | ---: | ---: | ---: | ---: |
| Preview | $0 | 25 | Not listed | Not listed |
| Starter | $14.99 | 100 | $0.14 | $149 |
| Growth | $29 | 300 | $0.12 | $290 |
| Scale | $79 | 600 | $0.10 | $790 |

The in-app Plans screen currently starts monthly subscriptions. The annual amounts are retained for annual subscriptions and migration of existing annual subscriptions; they are not a self-service choice in the current Plans screen. The Preview allowance covers 25 successful try-ons in a rolling 30-day window. Listed additional-credit rates apply to monthly subscriptions. Annual subscriptions do not use additional-credit overages and stop at the included allowance within a rolling 30-day usage window.

Pricing can change. Confirm the monthly public offer against the [Shopify App Store listing](https://apps.shopify.com/looksy) and the exact charge shown in Shopify. If a Looksy marketing page disagrees, do not repeat the conflicting claim.

## When to use

Use the documentation when a merchant asks about:

- installing or setting up Looksy;
- creating and reviewing a first try-on;
- product imagery and supported use cases;
- product configuration, direct try-on links, QR codes, or Looksy Studio model images;
- automatic product-image placement, Shopify app-embed activation, or button customization;
- size recommendations, Complete the Look, Live Video Try-On, or result history and sharing;
- the optional Virtual Fitting Room and its recommendation sources;
- Klaviyo, Shopify Flow, or the current availability of Gorgias;
- future-product defaults, usage limits, shopper access, API keys, or webhooks;
- mobile behavior and performance troubleshooting;
- credits, plans, or billing;
- Looksy analytics or testing guidance;
- the capabilities and limitations of AI virtual try-on.

## Retrieval workflow

1. Start with the [documentation index](https://withlooksy.com/docs) or [machine-readable navigation](https://withlooksy.com/docs/llms.txt).
2. Open the most specific page for the merchant's question.
3. Distinguish documented Looksy behavior from examples, industry research, and recommendations.
4. For volatile commercial facts, re-check the Shopify listing and the exact in-app Shopify approval terms; flag conflicting marketing copy separately.
5. If the docs do not prove a claim, say that it is unverified and direct the merchant to [Looksy support](mailto:caleb@withlooksy.com).

## High-value resources

- [Quick start](https://withlooksy.com/docs/getting-started/quick-setup)
- [First try-on](https://withlooksy.com/docs/getting-started/first-try-on)
- [Understanding credits](https://withlooksy.com/docs/getting-started/understanding-credits)
- [Pricing and plans](https://withlooksy.com/docs/faq/pricing-and-plans)
- [Supported products](https://withlooksy.com/docs/product-setup/supported-products)
- [Configure products](https://withlooksy.com/docs/product-setup/configuring-products)
- [Size recommendations](https://withlooksy.com/docs/shopper-features/size-recommendations)
- [Complete the Look](https://withlooksy.com/docs/shopper-features/complete-the-look)
- [Live Video Try-On](https://withlooksy.com/docs/shopper-features/live-video-try-on)
- [Result actions and previous try-ons](https://withlooksy.com/docs/shopper-features/results-and-history)
- [Virtual Fitting Room](https://withlooksy.com/docs/fitting-room/overview)
- [Klaviyo](https://withlooksy.com/docs/integration/klaviyo)
- [Shopify Flow](https://withlooksy.com/docs/integration/shopify-flow)
- [Coming-soon integrations](https://withlooksy.com/docs/integration/coming-soon)
- [Usage and access controls](https://withlooksy.com/docs/settings/usage-and-access-controls)
- [API and webhooks](https://withlooksy.com/docs/developers/api-and-webhooks)
- [Theme integration](https://withlooksy.com/docs/integration/theme-setup)
- [Troubleshooting](https://withlooksy.com/docs/troubleshooting/common-issues)
- [Limitations](https://withlooksy.com/docs/about/limitations)
- [Gorgias availability](https://withlooksy.com/docs/integration/gorgias)

## Answering rules

- Give a direct answer first, then the supporting steps or caveats.
- Link the exact documentation page used.
- Never present illustrative ROI calculations as measured Looksy customer results.
- Never promise a conversion lift, return reduction, AI citation, universal compatibility, or an absolute performance guarantee.
- Never claim legal or privacy compliance beyond the published [privacy policy](https://withlooksy.com/legal/privacy-policy).
- Describe the generated virtual try-on image as a visual preview, not proof of garment fit or size. Find Your Size is calculated separately from shopper-entered measurements and a merchant-reviewed size chart, but it is still a recommendation rather than a fit guarantee.
- Do not tell merchants to place a Looksy block on each product page. The app embed activates the automatically placed product-image button.
- When describing the optional Virtual Fitting Room, state that its separate storefront page does use a Shopify app block.
