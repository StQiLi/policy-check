# Architecture: Return Clarity for Shopify

**Version:** 1.0  
**Last Updated:** February 2026

---

## System Overview

Return Clarity is a **Chrome MV3 extension** with an optional **Rails API backend**. The extension operates independently for core functionality (detection + extraction + display), with the backend providing snapshot persistence, history, and sharing features.

---

## Component Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                     Chrome Extension (MV3)                     │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │ Content Script  │──────>│ Background SW   │               │
│  │  (content.ts)   │<──────│ (background.ts) │               │
│  └─────────────────┘      └─────────────────┘               │
│         │                         │                           │
│         │                         ├─────> Badge API          │
│         │                         │                           │
│         │                         v                           │
│         │                  ┌─────────────────┐               │
│         │                  │    Popup UI     │               │
│         │                  │ (popup.html/ts) │               │
│         │                  └─────────────────┘               │
│         │                                                     │
│         v                                                     │
│  ┌──────────────────────────────────────┐                    │
│  │         Shared Modules                │                    │
│  ├──────────────────────────────────────┤                    │
│  │  - shopifyDetect.ts                  │                    │
│  │  - policyResolver.ts                 │                    │
│  │  - extract.ts                        │                    │
│  │  - types.ts                          │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                          │
                          │ (Optional)
                          v
┌───────────────────────────────────────────────────────────────┐
│                    Rails API Backend                          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  POST /api/v1/snapshots       ─────> SnapshotsController     │
│  GET  /api/v1/stores/:domain/latest ─> StoresController      │
│  GET  /api/v1/stores/:domain/history -> StoresController     │
│  POST /api/v1/feedback        ─────> FeedbackController      │
│                                                               │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │ TokenAuth       │──────>│ ApplicationCtrl │               │
│  │ Middleware      │      └─────────────────┘               │
│  └─────────────────┘               │                         │
│                                     v                         │
│  ┌───────────────────────────────────────┐                   │
│  │         Database Models               │                   │
│  ├───────────────────────────────────────┤                   │
│  │  User, Store, PolicySnapshot,         │                   │
│  │  Feedback                             │                   │
│  └───────────────────────────────────────┘                   │
│                    │                                          │
│                    v                                          │
│           ┌──────────────┐                                    │
│           │  SQLite DB   │                                    │
│           └──────────────┘                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Extension Components

### 1. Content Script (`src/content.ts`)

**Purpose:** Runs on every page to detect Shopify stores and extract policy data.

**Lifecycle:**
- Injected via `manifest.json` with `matches: ["<all_urls>"]` (or restricted to common e-commerce patterns)
- Executes on `document_idle` to avoid blocking page load
- Runs detection immediately, then listens for DOM changes

**Responsibilities:**
- Call `shopifyDetect()` to determine if page is a Shopify store
- Call `policyResolver()` to find policy URLs
- Call `extract()` on policy pages to parse return policy text
- Send messages to background script:
  - `SHOPIFY_DETECTED` — when store is detected
  - `POLICY_EXTRACTED` — when summary is extracted
  - `POLICY_NOT_FOUND` — when no policy found

**Performance:**
- Execution time target: <100ms
- Debounce DOM mutations to avoid re-running detection on every change
- Cache results in `chrome.storage.local` (24h TTL)

**Code Structure:**
```typescript
// content.ts
import { detectShopify } from './shared/shopifyDetect';
import { resolvePolicyUrls } from './shared/policyResolver';
import { extractPolicy } from './shared/extract';

(async function() {
  const detection = await detectShopify();
  if (detection.isShopify) {
    chrome.runtime.sendMessage({
      type: 'SHOPIFY_DETECTED',
      data: detection
    });
    
    const policyUrls = await resolvePolicyUrls();
    if (policyUrls.refundPolicy) {
      const summary = await extractPolicy(policyUrls.refundPolicy);
      chrome.runtime.sendMessage({
        type: 'POLICY_EXTRACTED',
        data: summary
      });
    }
  }
})();
```

---

### 2. Background Service Worker (`src/background.ts`)

**Purpose:** Coordinates messages, manages badge state, and handles backend API calls.

**Lifecycle:**
- Service worker (non-persistent in MV3)
- Wakes up on messages from content script or popup
- May be terminated after 30s of inactivity

**Responsibilities:**
- Listen for `SHOPIFY_DETECTED` messages → update badge
- Listen for `POLICY_EXTRACTED` messages → store in-memory state
- Respond to popup queries (via `chrome.runtime.sendMessage`)
- Handle "Save Snapshot" requests → POST to backend API
- Manage auth tokens (stored in `chrome.storage.sync`)

**Badge Management:**
```typescript
// background.ts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'SHOPIFY_DETECTED') {
    chrome.action.setBadgeText({ 
      text: 'RC', 
      tabId: sender.tab.id 
    });
    chrome.action.setBadgeBackgroundColor({ 
      color: '#10B981', // green
      tabId: sender.tab.id 
    });
  }
});
```

**API Communication:**
```typescript
async function saveSnapshot(summary: PolicySummary) {
  const token = await chrome.storage.sync.get('authToken');
  const response = await fetch('http://localhost:3000/api/v1/snapshots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(summary)
  });
  return response.json();
}
```

---

### 3. Popup UI (`src/popup/popup.html`, `src/popup/popup.ts`)

**Purpose:** Display detection status and policy summary to user.

**Lifecycle:**
- Opens when user clicks extension icon
- Queries background script for current tab state
- Closes when user clicks away (state not persisted in popup itself)

**Layout (280px × 400px):**
```html
<!-- popup.html -->
<div class="popup-container">
  <header>
    <h1>Return Clarity</h1>
  </header>
  
  <section class="detection-status">
    <div class="status-indicator"></div>
    <span id="detection-text">Shopify Store Detected</span>
    <span id="confidence">Confidence: 98%</span>
  </section>
  
  <section class="policy-summary">
    <h2>Return Summary</h2>
    <dl>
      <dt>Window:</dt>
      <dd id="return-window">30 days</dd>
      
      <dt>Condition:</dt>
      <dd id="condition">Unworn with tags</dd>
      
      <dt>Fees:</dt>
      <dd id="fees">No restocking fee</dd>
      
      <dt>Shipping:</dt>
      <dd id="shipping">Customer pays</dd>
      
      <dt>Exclusions:</dt>
      <dd id="exclusions">Final sale items</dd>
    </dl>
  </section>
  
  <footer>
    <button id="save-snapshot">Save Snapshot</button>
    <button id="view-history">View History</button>
  </footer>
</div>
```

**State Management:**
```typescript
// popup.ts
async function loadState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({
    type: 'GET_TAB_STATE',
    tabId: tab.id
  });
  
  renderDetectionStatus(response.detection);
  renderPolicySummary(response.summary);
}
```

---

### 4. Shared Modules

#### `src/shared/types.ts`
```typescript
export interface DetectionResult {
  isShopify: boolean;
  confidence: number; // 0-100
  domain: string;
  indicators: {
    hasShopifyGlobal: boolean;
    hasMetaTags: boolean;
    hasCdnAssets: boolean;
    isMyshopifyDomain: boolean;
  };
}

export interface PolicySummary {
  storeId: string;
  domain: string;
  policyUrl: string;
  extractedAt: string; // ISO timestamp
  fields: {
    returnWindow: string | null;
    conditionRequirements: string | null;
    fees: string | null;
    returnShipping: string | null;
    exclusions: string | null;
  };
  confidence: {
    returnWindow: 'low' | 'medium' | 'high';
    conditionRequirements: 'low' | 'medium' | 'high';
    fees: 'low' | 'medium' | 'high';
    returnShipping: 'low' | 'medium' | 'high';
    exclusions: 'low' | 'medium' | 'high';
  };
  rawTextSnippet: string; // First 500 chars
}

export interface SnapshotPayload {
  storeDomain: string;
  policyUrl: string;
  summary: PolicySummary;
  userAgent: string;
  extensionVersion: string;
}
```

#### `src/shared/shopifyDetect.ts`
```typescript
export async function detectShopify(): Promise<DetectionResult> {
  // TODO: Implement multi-signal detection
  // 1. Check window.Shopify.shop
  // 2. Check meta tags
  // 3. Check domain pattern
  // 4. Check CDN assets
  // Return confidence score based on indicators
}
```

#### `src/shared/policyResolver.ts`
```typescript
export async function resolvePolicyUrls(): Promise<{
  refundPolicy: string | null;
  shippingPolicy: string | null;
  privacyPolicy: string | null;
}> {
  // TODO: Try canonical routes first, then footer links
}
```

#### `src/shared/extract.ts`
```typescript
export async function extractPolicy(url: string): Promise<PolicySummary> {
  // TODO: Fetch policy page, parse with regex/heuristics
  // Return structured summary with confidence scores
}
```

---

## Backend Components

### API Endpoints

#### `POST /api/v1/snapshots`
**Purpose:** Save a policy snapshot from extension.

**Request:**
```json
{
  "store_domain": "example.myshopify.com",
  "policy_url": "https://example.myshopify.com/policies/refund-policy",
  "summary": { /* PolicySummary object */ },
  "user_agent": "Mozilla/5.0...",
  "extension_version": "1.0.0"
}
```

**Response (201):**
```json
{
  "id": 123,
  "status": "saved",
  "created_at": "2026-02-17T10:30:00Z"
}
```

---

#### `GET /api/v1/stores/:domain/latest`
**Purpose:** Fetch latest snapshot for a store.

**Response (200):**
```json
{
  "id": 123,
  "store_domain": "example.myshopify.com",
  "policy_url": "https://example.myshopify.com/policies/refund-policy",
  "summary": { /* PolicySummary object */ },
  "extracted_at": "2026-02-17T10:30:00Z"
}
```

---

#### `GET /api/v1/stores/:domain/history`
**Purpose:** Fetch all snapshots for a store (paginated).

**Query Params:** `?page=1&per_page=10`

**Response (200):**
```json
{
  "snapshots": [
    { /* Snapshot 1 */ },
    { /* Snapshot 2 */ }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 3,
    "total_count": 25
  }
}
```

---

#### `POST /api/v1/feedback`
**Purpose:** Submit user feedback on extraction accuracy.

**Request:**
```json
{
  "snapshot_id": 123,
  "field_name": "returnWindow",
  "correction": "60 days (not 30 days)",
  "comment": "Policy changed last week"
}
```

**Response (201):**
```json
{
  "status": "received",
  "feedback_id": 456
}
```

---

## Message Flow

### Scenario 1: Detection + Extraction

```
User visits Shopify store
    │
    v
[Content Script]
    │
    ├─> detectShopify() → { isShopify: true, confidence: 98 }
    │
    ├─> chrome.runtime.sendMessage('SHOPIFY_DETECTED')
    │       │
    │       v
    │   [Background]
    │       │
    │       ├─> chrome.action.setBadgeText('RC')
    │       ├─> chrome.action.setBadgeBackgroundColor(green)
    │
    ├─> resolvePolicyUrls() → { refundPolicy: "/policies/refund-policy" }
    │
    ├─> extractPolicy() → PolicySummary
    │
    └─> chrome.runtime.sendMessage('POLICY_EXTRACTED')
            │
            v
        [Background]
            │
            └─> Store in memory (or chrome.storage)
```

---

### Scenario 2: User Opens Popup

```
User clicks extension icon
    │
    v
[Popup]
    │
    ├─> chrome.tabs.query({ active: true }) → Get current tab
    │
    ├─> chrome.runtime.sendMessage('GET_TAB_STATE', { tabId })
    │       │
    │       v
    │   [Background]
    │       │
    │       └─> Retrieve stored DetectionResult + PolicySummary
    │               │
    │               v
    │           Return to popup
    │
    ├─> renderDetectionStatus()
    ├─> renderPolicySummary()
    │
    └─> Popup visible to user
```

---

### Scenario 3: Save Snapshot

```
User clicks "Save Snapshot"
    │
    v
[Popup]
    │
    ├─> chrome.runtime.sendMessage('SAVE_SNAPSHOT', { summary })
    │       │
    │       v
    │   [Background]
    │       │
    │       ├─> Retrieve auth token from chrome.storage.sync
    │       │
    │       ├─> POST to backend API /api/v1/snapshots
    │       │       │
    │       │       v
    │       │   [Rails Backend]
    │       │       │
    │       │       ├─> TokenAuth middleware validates token
    │       │       ├─> SnapshotsController#create
    │       │       ├─> Save to database
    │       │       └─> Return { id, status: "saved" }
    │       │
    │       └─> Return success to popup
    │
    └─> Show "Saved!" confirmation
```

---

## Data Flow for Snapshots

```
Extension (Content) → Background → Rails API → Database
                                        │
                                        v
                               [PolicySnapshot Record]
                                        │
                                        ├─ store_id (FK)
                                        ├─ user_id (FK)
                                        ├─ policy_type ("refund")
                                        ├─ url
                                        ├─ raw_text (first 500 chars)
                                        ├─ summary (JSONB)
                                        ├─ extracted_at
                                        └─ checksum (SHA256 of summary)
```

---

## Security Considerations

1. **Content Security Policy (CSP):**
   - `script-src 'self'` — No inline scripts
   - `object-src 'none'` — No plugins
   - No `eval()` or `new Function()`

2. **Permissions (Manifest V3):**
   - `activeTab` — Only access current tab when user clicks
   - `storage` — Persist auth token and cache
   - No `<all_urls>` permission unless necessary

3. **Backend CORS:**
   - Locked to `chrome-extension://*` and `http://localhost:*` (dev)
   - Production: Whitelist extension ID via `ALLOWED_ORIGINS` env var

4. **Token Security:**
   - Store in `chrome.storage.sync` (encrypted by Chrome)
   - Use HTTPS for all API calls (even in dev)
   - Implement token rotation in v2

5. **Data Minimization:**
   - Only store first 500 chars of raw policy text
   - No PII collected (no user names, emails, cart data)
   - No tracking pixels or analytics in v1

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Content script execution | <100ms | Chrome DevTools Performance tab |
| Popup render time | <200ms | Time to interactive (TTI) |
| Badge update latency | <50ms | Time from message to badge visible |
| Memory footprint | <10MB | Chrome Task Manager |
| Backend API response | <200ms | Rails request logs |

---

## Deployment Architecture (Future)

```
[Extension]
    │
    ├─> Load unpacked (dev)
    └─> Chrome Web Store (production)

[Backend]
    │
    ├─> Heroku / Render (staging)
    └─> AWS ECS / Railway (production)
            │
            ├─> Postgres (primary DB)
            ├─> Redis (cache)
            └─> CloudFlare (CDN + DDoS protection)
```

For v1, both extension and backend run locally.
