# Return Clarity for Shopify

A Chrome extension and Rails API backend that helps consumers understand return policies on Shopify stores before making a purchase.

## Product Overview

**Return Clarity** detects when you're browsing a Shopify store and automatically extracts key return policy information into a simple, scannable format. No more hunting through dense legal text or getting surprised by hidden fees after checkout.

### What it does

- **Detects Shopify stores** automatically via page analysis
- **Extracts 5 key policy fields**:
  - Return window (e.g., "30 days")
  - Condition requirements (e.g., "unworn, tags attached")
  - Fees/restocking charges (e.g., "15% restocking fee")
  - Return shipping responsibility (e.g., "customer pays")
  - Exclusions (e.g., "final sale items, custom products")
- **Shows a badge** on detected Shopify stores
- **Displays summary** in extension popup
- **Optional snapshot saving** to backend for history tracking and sharing

### Privacy & Data Stance

- **No checkout or payment data** is ever collected
- **No store discovery or crawling** — extraction only happens on pages you visit
- **Opt-in snapshot saving** — data only sent to backend if you explicitly save
- **Transparency-focused** — we present signals, never label stores as "scams"

## Architecture

```
┌─────────────────────────────────────────┐
│          Chrome Extension (MV3)          │
├─────────────────────────────────────────┤
│  Content Script                         │
│   - Detects Shopify stores              │
│   - Resolves policy page URLs           │
│   - Extracts policy text                │
│                                         │
│  Background Service Worker              │
│   - Manages badge state                 │
│   - Coordinates messages                │
│   - Handles API communication           │
│                                         │
│  Popup UI                               │
│   - Displays detection confidence       │
│   - Shows 5-field summary               │
│   - Optional save to backend            │
└─────────────────────────────────────────┘
              ↓ (optional)
┌─────────────────────────────────────────┐
│        Rails API Backend                │
├─────────────────────────────────────────┤
│  - Token-based authentication           │
│  - Store snapshot persistence           │
│  - Snapshot history & diffing           │
│  - Feedback collection                  │
│  - Shareable policy cards (v1 simple)   │
└─────────────────────────────────────────┘
```

### Component Flow

1. **Content script** runs on all pages, detects Shopify via meta tags / `Shopify.shop` global
2. **Content script** sends `SHOPIFY_DETECTED` message to background service worker
3. **Background** updates badge (green "RC" for detected, gray otherwise)
4. **User clicks extension icon** → popup opens
5. **Popup** queries background for detection state and extracted summary
6. **Popup** displays confidence % and 5-field summary
7. **(Optional)** User clicks "Save snapshot" → background sends to Rails API
8. **(Optional)** User views history or shares policy card via backend

## 60-Second Demo Plan

1. Visit `example-shopify-store.myshopify.com`
2. Extension badge turns green with "RC" text
3. Click extension icon → popup shows:
   - "Shopify Store Detected: 98% confidence"
   - Return window: "30 days"
   - Condition: "Unworn with tags"
   - Fees: "No restocking fee"
   - Shipping: "Customer pays return shipping"
   - Exclusions: "Final sale items non-returnable"
4. (Optional) Click "Save snapshot" → backend stores with timestamp
5. (Optional) View history in backend dashboard

## Monorepo Structure

```
policy-check/
├── extension/          # Chrome MV3 extension (TypeScript + Vite)
├── backend/            # Rails 7 API (Ruby 3.3)
├── docs/               # Planning, architecture, API contract
├── scripts/            # Dev helpers (dev.sh)
├── .cursor/rules/      # Cursor AI rules
├── Makefile            # Top-level commands
└── README.md           # This file
```

## Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm** (for extension)
- **Ruby 3.3+** and **Rails 7.2+** (for backend)
- **Chrome/Edge** (for testing extension)

### Setup

```bash
# Fix Homebrew permissions (if needed)
sudo chown -R $(whoami) /opt/homebrew

# Install Ruby toolchain
brew install rbenv ruby-build
rbenv install 3.3.6
rbenv local 3.3.6
gem install rails -v '~> 7.2'
gem install bundler

# Install dependencies for both projects
make setup

# Start both extension watcher + Rails server
make dev
```

### Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist/` folder
5. Extension should appear with "RC" badge on Shopify stores

## Development Commands

```bash
make setup      # Install deps for extension + backend
make dev        # Start dev servers for both
make build      # Build extension for production
make lint       # Run linters for both projects
make test       # Run tests for both projects
```

## Project Documentation

- **[PRD (Product Requirements)](docs/PRD.md)** — v1 scope and explicit non-goals
- **[Architecture](docs/ARCHITECTURE.md)** — Component details and message flow
- **[API Contract](docs/API_CONTRACT.md)** — Backend endpoints, request/response shapes, error codes

## Tech Stack

### Extension
- **TypeScript** (strict mode)
- **Vite** + `@crxjs/vite-plugin` for MV3 builds
- **Chrome MV3 APIs**: `chrome.runtime`, `chrome.tabs`, `chrome.storage`, `chrome.action`
- **ESLint** + **Prettier**

### Backend
- **Ruby 3.3** + **Rails 7.2** (API mode)
- **SQLite3** (development/test, upgrade to Postgres for production)
- **rack-cors** for extension CORS
- **RSpec** for request specs
- **Rubocop** for linting

## Next Steps

Once the repository is fully scaffolded, the next phase involves:

1. **Implement Shopify detection logic** (`extension/src/shared/shopifyDetect.ts`)
   - Detect via `<meta property="og:type" content="product">` + `window.Shopify`
   - Check for `.myshopify.com` or Shopify CDN assets
   - Return confidence score (0-100)

2. **Implement policy URL resolver** (`extension/src/shared/policyResolver.ts`)
   - Prefer canonical routes: `/policies/refund-policy`, `/policies/shipping-policy`, etc.
   - Fallback to footer link detection if canonical not available
   - Handle multi-language stores

3. **Implement policy extraction** (`extension/src/shared/extract.ts`)
   - Regex patterns for return windows ("30 days", "60 days", etc.)
   - Heuristics for condition requirements, fees, shipping responsibility
   - Extract exclusions (final sale, custom, sale items)
   - Return structured `PolicySummary` with confidence per field

4. **Wire up extension message flow**
   - Content script → background → popup communication
   - Badge state management
   - Error handling and fallbacks

5. **Implement backend snapshot saving**
   - Token auth middleware
   - Checksum-based deduplication
   - History API with pagination
   - Diff algorithm for policy changes

6. **Add basic feedback mechanism**
   - "Was this accurate?" UI in popup
   - Feedback submission to backend
   - Use feedback to refine extraction heuristics

7. **Polish and test**
   - Test on 10+ real Shopify stores
   - Handle edge cases (missing policies, non-standard layouts)
   - Performance optimization (content script impact)
   - Accessibility (popup keyboard nav)

## Contributing

This is currently a solo project. Contributions welcome once v1 is stable.

## License

TBD (likely MIT or GPL-3.0)
