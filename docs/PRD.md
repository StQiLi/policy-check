# Product Requirements Document: Return Clarity for Shopify (v1)

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Scaffolding Complete → Implementation Phase

---

## Product Vision

Return Clarity helps online shoppers make informed purchasing decisions by surfacing key return policy information before checkout. By focusing on Shopify stores and providing a deterministic, privacy-focused extraction approach, we deliver immediate value without complex infrastructure.

---

## Problem Statement

1. **Hidden return policies** — Consumers often discover restrictive return policies only after purchase
2. **Dense legal text** — Policy pages are lengthy and buried in footer links
3. **Checkout friction** — Users must hunt for policy info mid-checkout, increasing cart abandonment
4. **Trust signals** — No easy way to compare return policies across stores before buying

---

## Target Users

**Primary:** Online shoppers browsing Shopify stores  
**Secondary (future):** Consumer advocates, price comparison sites

---

## v1 Scope (MVP)

### Core Features

#### 1. Shopify Store Detection
- **Trigger:** Content script runs on all pages
- **Detection method:**
  - Check for `window.Shopify.shop` global
  - Check for `<meta property="og:type" content="product">` or `<meta name="shopify-checkout-api-token">`
  - Check domain pattern `*.myshopify.com`
  - Check for Shopify CDN assets (`cdn.shopify.com`)
- **Output:** Confidence score (0-100%)

#### 2. Policy URL Resolution
- **Preferred method:** Canonical Shopify policy routes
  - `/policies/refund-policy`
  - `/policies/shipping-policy`
  - `/policies/privacy-policy`
  - `/policies/terms-of-service`
  - `/policies/subscription-policy`
- **Fallback:** Footer link detection (`<a href>` matching "return", "refund", "shipping")
- **Multi-language:** Detect language code in URL (`/fr/policies/`, `/de/policies/`)

#### 3. Policy Summary Extraction (5 Fields)

Extract using **regex + heuristics only** (no LLM required for v1):

| Field | Examples | Extraction Method |
|-------|----------|-------------------|
| **Return Window** | "30 days", "60 days", "No returns" | Regex: `(\d+)\s*(day|week|month)s?` near "return" |
| **Condition Requirements** | "Unworn with tags", "Original packaging", "Unused" | Keywords: "unworn", "tags", "packaging", "unused", "original condition" |
| **Fees / Restocking** | "15% restocking fee", "No fees", "$5 fee" | Regex: `(\d+%|\$\d+).*?(restocking|fee)` |
| **Return Shipping** | "Customer pays", "Free returns", "Seller pays" | Keywords: "customer pays", "free returns", "prepaid label", "seller pays" |
| **Exclusions** | "Final sale items", "Custom products", "Sale items" | Keywords: "final sale", "custom", "personalized", "non-returnable", "exclud" |

- **Confidence per field:** Low/Medium/High based on keyword match strength
- **No extraction:** Return `null` or "Not specified" if no data found

#### 4. Extension UI

**Badge:**
- Shows "RC" text
- Green background when Shopify detected
- Gray background otherwise
- Shows on all tabs automatically

**Popup (280px × 400px):**
```
┌─────────────────────────────────────┐
│  Return Clarity                   [x]│
├─────────────────────────────────────┤
│  ● Shopify Store Detected           │
│    Confidence: 98%                  │
│                                     │
│  📦 Return Summary                  │
│  ───────────────────────────────   │
│  Window:      30 days               │
│  Condition:   Unworn with tags      │
│  Fees:        No restocking fee     │
│  Shipping:    Customer pays         │
│  Exclusions:  Final sale items      │
│                                     │
│  [Save Snapshot] [View History]    │
└─────────────────────────────────────┘
```

- Auto-updates when tab changes
- Graceful degradation if policy not found

#### 5. Optional Backend Snapshot Saving

- **Opt-in:** User clicks "Save snapshot" button
- **Payload:** Store domain, policy URL, extracted summary, raw text snippet (first 500 chars), timestamp
- **Backend:** Rails API stores in SQLite (upgrade to Postgres for production)
- **Auth:** Simple token-based (placeholder in v1, improve in v2)

---

## Explicit Non-Goals (v1)

### Out of Scope
- ❌ **No LLM / AI extraction** — v1 uses regex + heuristics only
- ❌ **No store crawling** — Only extract from pages user visits
- ❌ **No store discovery engine** — Not building a database of all Shopify stores
- ❌ **No checkout interception** — No reading of cart/payment data
- ❌ **No labeling stores as "scams"** — We present signals, never judgments
- ❌ **No Chrome Web Store publication** — v1 is dev/test mode only
- ❌ **No multi-platform support** — Shopify only (no WooCommerce, BigCommerce, etc.)
- ❌ **No browser compatibility** — Chrome/Edge only (no Firefox/Safari)

### Deferred to v2+
- 🔄 Advanced diff visualization for policy changes
- 🔄 Shareable "policy cards" with public URLs
- 🔄 User feedback loop for extraction accuracy
- 🔄 Multi-language policy extraction
- 🔄 Email alerts for policy changes on saved stores
- 🔄 LLM-powered extraction for non-standard policy pages

---

## Success Metrics (v1)

### Quantitative
- **Detection accuracy:** >90% true positives on Shopify stores
- **Extraction completeness:** >70% of stores have ≥3 fields extracted
- **Performance:** Content script execution <100ms
- **Snapshot save rate:** >10% of detected stores

### Qualitative
- User can load extension unpacked and see badge on Shopify stores immediately
- Popup renders summary within 200ms of click
- Extraction is "good enough" to inform purchase decisions
- No false positives on non-Shopify stores

---

## User Flows

### Flow 1: First-Time User on Shopify Store
1. User installs extension (load unpacked from `extension/dist/`)
2. User visits `example-store.myshopify.com`
3. Extension badge turns green with "RC" text
4. User clicks badge → popup opens
5. Popup shows detection confidence and 5-field summary
6. User decides whether to trust store based on return policy

### Flow 2: Saving a Snapshot
1. User on Shopify store with extracted policy
2. Opens popup, clicks "Save Snapshot"
3. Extension sends data to Rails backend
4. Backend returns snapshot ID
5. Popup shows "Saved!" confirmation
6. User can click "View History" to see saved snapshots (future)

### Flow 3: No Policy Found
1. User on Shopify store without standard policy pages
2. Popup shows "Shopify detected, but no policy found"
3. Offers link to manually search for policy
4. User can still browse store (extension doesn't block)

---

## Technical Constraints

### Extension
- **Manifest V3** required (V2 deprecated by Google)
- **Least-privilege permissions:** `activeTab`, `storage` only
- **No `eval()` or `innerHTML`** with dynamic content (CSP compliance)
- **Content script impact:** <100ms execution time, <1MB memory

### Backend
- **Rails 7.2+** for API mode
- **SQLite3** for development (Postgres for production)
- **CORS:** Locked to `chrome-extension://*` and `http://localhost:*`
- **Auth:** Token-based placeholder (improve with JWT/OAuth in v2)

---

## Risk & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shopify changes canonical policy routes | Medium | High | Add footer link fallback detection |
| Non-standard policy page layouts | High | Medium | Show "extraction failed" message, allow manual view |
| False positive Shopify detection | Low | Medium | Multi-signal detection (meta tags + global + domain) |
| Privacy concerns (data collection) | Low | High | Clear opt-in for snapshots, no PII, transparent privacy policy |
| Performance impact on page load | Medium | Medium | Lazy-load extraction, debounce DOM queries |

---

## Timeline (Post-Scaffolding)

**Week 1:** Implement Shopify detection + policy URL resolution  
**Week 2:** Implement extraction logic (regex + heuristics)  
**Week 3:** Wire up extension message flow + popup UI  
**Week 4:** Backend snapshot API + auth  
**Week 5:** Testing on 10+ real Shopify stores, bug fixes  
**Week 6:** Polish, documentation, v1 complete

---

## Open Questions

1. Should we detect Shopify Plus stores differently? (No, treat same as standard Shopify)
2. How to handle policy pages that require login? (Skip extraction, show "Login required")
3. Should we cache extracted summaries? (Yes, in `chrome.storage.local` for 24h)
4. Should we support custom Shopify domains (non-.myshopify.com)? (Yes, detect via meta tags)
5. How to handle multi-page policies? (Extract first page only for v1)

---

## Appendix: Example Policy Pages

- **Standard Shopify:** `https://store.myshopify.com/policies/refund-policy`
- **Custom domain:** `https://example.com/policies/refund-policy`
- **Non-standard:** `https://example.com/pages/returns` (footer link fallback)
- **Multi-language:** `https://example.com/fr/policies/refund-policy`
