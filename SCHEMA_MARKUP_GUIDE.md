# Schema Markup Implementation Guide

## Overview

This guide provides schema markup (JSON-LD) for all Looksy documentation pages to enhance SEO and enable rich snippets in search results.

## Implementation Method

### Option 1: Mintlify Custom Head (Recommended)

Add schema to `mint.json`:

```json
{
  "customHead": {
    "scripts": [
      {
        "type": "application/ld+json",
        "innerHTML": "{ ... schema here ... }"
      }
    ]
  }
}
```

### Option 2: Per-Page Schema

Use Mintlify's frontmatter or custom components to add page-specific schema.

### Option 3: Global Schema Template

Add organization and website schema globally, page-specific schema per page.

---

## Global Schema (Add Once)

### Organization Schema

Add to all pages via global header:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Looksy",
  "url": "https://withlooksy.com",
  "logo": "https://withlooksy.com/looksy_logo.svg",
  "description": "AI-powered virtual try-on for Shopify stores",
  "sameAs": [
    "https://twitter.com/withlooksy",
    "https://www.linkedin.com/company/withlooksy"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "support@looksy.ai",
    "contactType": "Customer Support",
    "availableLanguage": "English"
  }
}
```

### WebSite Schema

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Looksy Documentation",
  "url": "https://withlooksy.com/docs",
  "description": "Complete documentation for Looksy virtual try-on for Shopify",
  "publisher": {
    "@type": "Organization",
    "name": "Looksy"
  }
}
```

---

## Page-Specific Schema

### 1. FAQ Pages

**Pages:**
- `/faq/does-it-work-on-mobile`
- `/faq/which-products-work`
- `/faq/how-accurate-is-it`
- `/faq/will-it-slow-my-store`
- `/faq/pricing-and-plans`

**Schema Template:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does virtual try-on work on mobile?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Looksy virtual try-on is fully optimized for mobile devices and works seamlessly on smartphones and tablets. Since over 70% of Shopify traffic comes from mobile, mobile optimization is a core priority. The feature runs directly in the mobile browser using WebAR technology, requiring no app download."
      }
    }
  ]
}
```

#### Specific FAQ Schemas:

**does-it-work-on-mobile.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does virtual try-on work on mobile devices?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Looksy virtual try-on is fully optimized for mobile devices. It works seamlessly on smartphones and tablets, requiring no app download. The feature runs directly in the mobile browser using WebAR technology."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need to download an app to use virtual try-on on mobile?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Looksy runs directly in the mobile browser using WebAR technology. Customers don't need to download an app, create an account, or leave your store."
      }
    },
    {
      "@type": "Question",
      "name": "What mobile devices are compatible with virtual try-on?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Looksy works on iOS devices (iPhone 7 and newer with iOS 13+) and Android devices (most modern smartphones with Android 8+). It's compatible with tablets including iPad and Samsung Galaxy Tab."
      }
    },
    {
      "@type": "Question",
      "name": "Will virtual try-on slow down my mobile site?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Looksy is optimized for minimal performance impact on mobile. The button loads quickly and processing happens on Looksy's servers, not on the customer's device."
      }
    }
  ]
}
```

**which-products-work.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Which products work with virtual try-on?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Looksy virtual try-on works best with upper body apparel including tops, t-shirts, blouses, dresses, jackets, hoodies, activewear, and swimwear. The technology is optimized for clothing items that shoppers want to visualize on themselves."
      }
    },
    {
      "@type": "Question",
      "name": "Can customers try on pants and jeans?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Lower body try-on for pants, jeans, shorts, and skirts is currently in development and planned for 2026. Currently, Looksy focuses on upper body garments for optimal accuracy."
      }
    },
    {
      "@type": "Question",
      "name": "Does virtual try-on work for accessories?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Accessories like jewelry, hats, and bags are not currently supported. Looksy is optimized for apparel worn on the upper body."
      }
    }
  ]
}
```

**how-accurate-is-it.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How accurate is virtual try-on?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Looksy's virtual try-on delivers realistic previews with 95%+ accuracy for style and silhouette, 90%+ accuracy for color and pattern, and 85%+ accuracy for overall visualization. Accuracy depends on product image quality and selfie quality."
      }
    },
    {
      "@type": "Question",
      "name": "Will virtual try-on show me exactly how the garment fits?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Virtual try-on shows how the style looks on you, but it's not a precise fit predictor. It helps you visualize appearance, but you should still refer to size charts for fit guidance."
      }
    },
    {
      "@type": "Question",
      "name": "Does virtual try-on work for all body types?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Looksy is trained on diverse body types and works across different shapes, sizes, and skin tones. The AI adapts the garment rendering to match the person in the selfie."
      }
    }
  ]
}
```

**will-it-slow-my-store.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Will virtual try-on slow down my store?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No, Looksy is optimized for minimal performance impact. Page load time remains unchanged, and Core Web Vitals stay in the 'Good' range. The virtual try-on button loads asynchronously and doesn't block page rendering."
      }
    },
    {
      "@type": "Question",
      "name": "Does virtual try-on affect SEO rankings?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Looksy has minimal performance impact and doesn't hurt SEO. Core Web Vitals remain in good range, and improved engagement metrics (lower bounce rate, higher time on site) may actually help SEO."
      }
    },
    {
      "@type": "Question",
      "name": "How much does virtual try-on impact page load speed?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Looksy adds less than 0.1 seconds to page interaction time. All AI processing happens on Looksy's servers, not on your store, so there's no strain on your site's performance."
      }
    }
  ]
}
```

**pricing-and-plans.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How much does Looksy virtual try-on cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Looksy offers plans starting at $99/month for the Starter plan (up to 1,000 try-ons), $249/month for Growth (up to 5,000 try-ons), and $499/month for Pro (up to 15,000 try-ons). All plans include a free 14-day preview with 100 try-ons."
      }
    },
    {
      "@type": "Question",
      "name": "Is there a free trial for Looksy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Looksy offers a free 14-day preview with 100 try-ons to test before committing. No credit card required."
      }
    },
    {
      "@type": "Question",
      "name": "Can I cancel Looksy anytime?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, there are no long-term contracts. You can cancel anytime. If you cancel within 30 days, you get a full refund."
      }
    }
  ]
}
```

---

### 2. HowTo Schema (Installation Guides)

**Pages:**
- `/getting-started/how-to-install`
- `/getting-started/quick-setup`
- `/getting-started/first-try-on`

**how-to-install.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Install Looksy Virtual Try-On on Shopify",
  "description": "Step-by-step guide to installing Looksy virtual try-on on your Shopify store in under 10 minutes.",
  "totalTime": "PT10M",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Install Looksy from Shopify App Store",
      "text": "Visit the Looksy app page on the Shopify App Store and click Add app. You'll be redirected to your Shopify admin to confirm and install.",
      "position": 1
    },
    {
      "@type": "HowToStep",
      "name": "Enable Products",
      "text": "Choose which products to enable virtual try-on for. You can enable by collection (recommended) or by individual products.",
      "position": 2
    },
    {
      "@type": "HowToStep",
      "name": "Add Try-On Button to Store",
      "text": "Go to Online Store → Themes, click Customize, open App embeds, and enable Looksy Virtual Try-On. Save your changes.",
      "position": 3
    },
    {
      "@type": "HowToStep",
      "name": "Test the Feature",
      "text": "Visit a product page, click Try it on, upload a selfie, and see the result in seconds.",
      "position": 4
    }
  ]
}
```

**quick-setup.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Looksy Quick Setup Guide",
  "description": "Get Looksy virtual try-on running on your Shopify store in 10 minutes with this step-by-step guide.",
  "totalTime": "PT10M",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Install Looksy",
      "text": "Install Looksy from the Shopify App Store and approve the installation in your Shopify admin.",
      "position": 1
    },
    {
      "@type": "HowToStep",
      "name": "Enable Products",
      "text": "Choose products to enable for virtual try-on, either by collection or individually.",
      "position": 2
    },
    {
      "@type": "HowToStep",
      "name": "Add Button to Store",
      "text": "Enable the Looksy app embed in your theme settings to display the try-on button.",
      "position": 3
    },
    {
      "@type": "HowToStep",
      "name": "Test",
      "text": "Visit a product page and test the virtual try-on feature with a selfie.",
      "position": 4
    },
    {
      "@type": "HowToStep",
      "name": "Optimize",
      "text": "Ensure product images meet quality standards and button is visible above the fold.",
      "position": 5
    },
    {
      "@type": "HowToStep",
      "name": "Promote",
      "text": "Let customers know virtual try-on is available through homepage banners and email campaigns.",
      "position": 6
    },
    {
      "@type": "HowToStep",
      "name": "Track Performance",
      "text": "Monitor results in your Looksy dashboard to track engagement, conversions, and ROI.",
      "position": 7
    }
  ]
}
```

---

### 3. Article Schema (Guides)

**Pages:**
- `/benefits/increase-conversions`
- `/benefits/reduce-returns`
- `/product-setup/best-practices`
- All other informational pages

**Template:**

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How Virtual Try-On Increases Conversion Rates",
  "description": "Virtual try-on can increase ecommerce conversion rates by 10-25% by reducing purchase uncertainty. Learn how Looksy drives more sales.",
  "author": {
    "@type": "Organization",
    "name": "Looksy"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Looksy",
    "logo": {
      "@type": "ImageObject",
      "url": "https://withlooksy.com/looksy_logo.svg"
    }
  },
  "datePublished": "2026-01-23",
  "dateModified": "2026-01-23"
}
```

**increase-conversions.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How Virtual Try-On Increases Conversion Rates",
  "description": "Virtual try-on can increase ecommerce conversion rates by 10-25% by reducing purchase uncertainty. Learn how Looksy drives more sales for Shopify stores.",
  "author": {
    "@type": "Organization",
    "name": "Looksy"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Looksy",
    "logo": {
      "@type": "ImageObject",
      "url": "https://withlooksy.com/looksy_logo.svg"
    }
  },
  "datePublished": "2026-01-23",
  "dateModified": "2026-01-23",
  "mainEntityOfPage": "https://withlooksy.com/docs/benefits/increase-conversions",
  "articleSection": "Benefits"
}
```

**reduce-returns.mdx:**

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Reducing Returns with Virtual Try-On",
  "description": "Virtual try-on reduces ecommerce return rates by 15-30% by setting realistic expectations. Learn how Looksy decreases returns and increases profitability.",
  "author": {
    "@type": "Organization",
    "name": "Looksy"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Looksy",
    "logo": {
      "@type": "ImageObject",
      "url": "https://withlooksy.com/looksy_logo.svg"
    }
  },
  "datePublished": "2026-01-23",
  "dateModified": "2026-01-23",
  "mainEntityOfPage": "https://withlooksy.com/docs/benefits/reduce-returns",
  "articleSection": "Benefits"
}
```

---

### 4. SoftwareApplication Schema (Main Product)

Add to homepage or main product pages:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Looksy Virtual Try-On",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web-based",
  "description": "AI-powered virtual try-on for Shopify stores. Increases conversions by 10-25% and reduces returns by 15-30%.",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "99",
    "highPrice": "499",
    "priceCurrency": "USD",
    "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "price": "99",
      "priceCurrency": "USD",
      "billingDuration": "P1M"
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "500",
    "bestRating": "5",
    "worstRating": "1"
  },
  "featureList": [
    "AI virtual try-on",
    "Mobile optimized",
    "No app download required",
    "Shopify native integration",
    "Analytics dashboard",
    "Multi-language support"
  ]
}
```

---

### 5. BreadcrumbList Schema

Add to all pages for navigation:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Documentation",
      "item": "https://withlooksy.com/docs"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Getting Started",
      "item": "https://withlooksy.com/docs/getting-started"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "How to Install",
      "item": "https://withlooksy.com/docs/getting-started/how-to-install"
    }
  ]
}
```

---

## Implementation Instructions

### Step 1: Add Global Schema

In `mint.json`, add Organization and WebSite schema that appears on all pages.

### Step 2: Add Per-Page Schema

For each page type:

1. **FAQ pages:** Add FAQPage schema
2. **Guide pages:** Add HowTo schema
3. **Article pages:** Add Article schema
4. **All pages:** Add BreadcrumbList schema

### Step 3: Validate Schema

Use these tools to validate:
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org/
- Google Search Console (after deployment)

### Step 4: Monitor Performance

After implementation:
- Check Google Search Console for rich results
- Monitor click-through rates
- Track rankings for target keywords

---

## Expected SEO Benefits

### Rich Snippets

**FAQ pages will display:**
- Expandable Q&A in search results
- Higher visibility
- Increased click-through rates (10-30%)

### Enhanced SERP Features

**How-to guides will display:**
- Step-by-step instructions in search results
- Estimated time to complete
- Higher rankings for how-to queries

### Knowledge Graph

**Organization schema enables:**
- Company information in Google Knowledge Panel
- Logo display in search results
- Social media links

---

## Testing Schema Markup

### Before Deployment

1. **Validate JSON-LD syntax:** Use online JSON validators
2. **Test with Google Rich Results Test**
3. **Preview in schema.org validator**

### After Deployment

1. **Google Search Console:** Check "Enhancements" section
2. **Monitor search appearance:** Look for rich snippets in results
3. **Track CTR changes:** Measure impact on click-through rates

---

## Maintenance

### Update Frequency

- **Organization schema:** Update if contact info changes
- **FAQ schema:** Update when answers change
- **Article schema:** Update dateModified when content changes
- **Product schema:** Update pricing or features as they change

### Monitoring

- Monthly: Check Google Search Console for schema errors
- Quarterly: Validate all schema with testing tools
- Annually: Review and update all schema for accuracy

---

## Common Issues

### Schema Not Appearing in Search

**Possible causes:**
- Recently deployed (can take 2-4 weeks)
- Schema validation errors
- Page not indexed yet
- Google chooses not to display (their discretion)

**Solution:**
- Wait 2-4 weeks after deployment
- Check Search Console for errors
- Request re-indexing

### Validation Errors

**Common errors:**
- Missing required properties
- Invalid URL formats
- Date format issues
- Currency format issues

**Solution:** Use Google's Rich Results Test to identify specific errors

---

## Resources

- Google Search Central - Structured Data: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Schema.org Documentation: https://schema.org/
- JSON-LD Playground: https://json-ld.org/playground/
- Rich Results Test: https://search.google.com/test/rich-results
