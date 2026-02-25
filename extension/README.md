# Return Clarity Extension

Chrome MV3 extension for detecting Shopify stores and extracting return policy summaries.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm (or npm)

### Install Dependencies

```bash
pnpm install
```

### Build Extension

```bash
# Development build with watch mode
pnpm dev

# Production build
pnpm build
```

### Load Unpacked Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top right)
3. Click **"Load unpacked"**
4. Select the `extension/dist/` folder
5. The extension should now appear in your extensions list

### Set auth token (required for Save Snapshot and View History)

1. In the backend, run `rails db:seed` to create a dev user and print a token (e.g. `dev-token-for-local-testing`).
2. In Chrome, right‑click the extension icon → **Options** (or click **Options (set auth token)** in the popup footer).
3. Paste the token and click **Save**.

### Testing

1. Visit a Shopify store (e.g., `https://example.myshopify.com`)
2. Extension badge should turn green with "RC" text
3. Click the extension icon to open popup
4. Popup should show detection confidence and policy summary (placeholder for v1)
5. Click **View History** to open the full Snapshot Hub page in a new tab

If the popup shows "Not a Shopify store" on a Shopify site, reload the store page or click **Run detection now**.

## Project Structure

```
extension/
├── manifest.json          # Extension manifest (MV3)
├── vite.config.ts         # Vite build configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies and scripts
├── src/
│   ├── content.ts         # Content script (runs on all pages)
│   ├── background.ts      # Service worker
│   ├── hub/
│   │   ├── index.html     # Snapshot hub page
│   │   ├── hub.ts         # Hub logic (fetch/render/filter/paginate)
│   │   └── hub.css        # Hub styles
│   ├── popup/
│   │   ├── index.html     # Popup HTML
│   │   ├── popup.ts       # Popup logic
│   │   └── popup.css      # Popup styles
│   └── shared/
│       ├── types.ts       # Shared TypeScript types
│       ├── shopifyDetect.ts  # Shopify detection logic
│       ├── policyResolver.ts # Policy URL resolution
│       └── extract.ts     # Policy extraction (regex + heuristics)
├── icons/                 # Extension icons (16, 32, 48, 128)
└── dist/                  # Build output (created by Vite)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development build with watch mode |
| `pnpm build` | Build for production |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint errors |
| `pnpm format` | Format code with Prettier |
| `pnpm type-check` | Check TypeScript types |

## Key Features (v1)

- **Shopify Detection**: Multi-signal detection using window.Shopify, meta tags, domain, CDN assets
- **Badge Indicator**: Green "RC" badge when Shopify store detected
- **Policy Extraction**: Regex-based extraction of 5 key fields:
  - Return window
  - Condition requirements
  - Fees/restocking
  - Return shipping responsibility
  - Exclusions
- **Popup UI**: Displays detection confidence and policy summary
- **Snapshot Hub**: View saved snapshots with expiration badges and product/policy links
- **Optional Backend Sync**: Save snapshots (with active tab page URL) to Rails API

## Development Notes

### Permissions

- `activeTab`: Access current tab when user clicks extension
- `storage`: Cache detection results and auth tokens
- Host permissions: `*://*.myshopify.com/*` for Shopify stores

### Message Passing

Communication flow:
```
Content Script → Background Service Worker → Popup
```

Message types:
- `SHOPIFY_DETECTED`: Store detected
- `POLICY_EXTRACTED`: Policy summary ready
- `POLICY_NOT_FOUND`: No policy found
- `GET_TAB_STATE`: Popup requests current state
- `SAVE_SNAPSHOT`: User wants to save to backend

### TODOs for Next Phase

1. **Implement robust Shopify detection**
   - Add detection for Shopify Plus
   - Handle custom domains
   - Cache detection results (24h TTL)

2. **Improve policy extraction**
   - Add more regex patterns for return windows
   - Better keyword matching for conditions
   - Extract multi-language policies
   - Calculate accurate confidence scores

3. **Add icon assets**
   - Create 16x16, 32x32, 48x48, 128x128 PNG icons
   - Design simple "RC" logo with policy theme

4. **Add tests**
   - Unit tests for detection logic
   - Unit tests for extraction logic
   - Integration tests for message passing

5. **Handle edge cases**
   - Policy pages requiring login
   - Non-standard policy layouts
   - Multi-page policies
   - Policy changes (diff detection)

## Troubleshooting

### Extension Not Loading

- Make sure you've run `pnpm build` first
- Check that `dist/` folder exists
- Verify `dist/manifest.json` is present

### Badge Not Showing

- Check browser console for errors
- Verify content script is running (`console.log` should appear)
- Make sure you're on a page that matches host permissions

### Popup Not Opening

- Check for JavaScript errors in popup DevTools (right-click popup → Inspect)
- Verify `dist/popup/index.html` exists
- Make sure Vite build completed successfully

### Hot Reload Not Working

- Vite watch mode (`pnpm dev`) rebuilds on file changes
- You still need to click "Reload" button in `chrome://extensions/` after each build
- Consider using `@crxjs/vite-plugin` hot reload features (experimental)

## Resources

- [Chrome Extension MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Extension API Reference](https://developer.chrome.com/docs/extensions/reference/)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
