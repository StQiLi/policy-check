/**
 * Background service worker -- coordinates messages between content
 * script and popup, manages the action badge, and talks to the
 * optional Rails backend.
 */

import { logger } from './shared/logger';
import type { ExtensionMessage, TabState, DetectionResult, PolicySummary } from './shared/types';

// ── Per-tab state (lost on service-worker restart) ──────────────

const tabStates = new Map<number, TabState>();

// ── API config ──────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000/api/v1'; // TODO: read from storage / env
const EXTENSION_VERSION = '1.0.0';

// ── Message handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case 'SHOPIFY_DETECTED':
        handleShopifyDetected(message.data, tabId);
        sendResponse({ success: true });
        return false;

      case 'POLICY_EXTRACTED':
        handlePolicyExtracted(message.data, tabId);
        sendResponse({ success: true });
        return false;

      case 'POLICY_NOT_FOUND':
        handlePolicyNotFound(message.domain, tabId);
        sendResponse({ success: true });
        return false;

      case 'GET_TAB_STATE': {
        const state = tabStates.get(message.tabId);
        sendResponse({ state: state ?? { detection: null, summary: null } });
        return false;
      }

      case 'SAVE_SNAPSHOT':
        // Async -- must return true to keep the channel open.
        saveSnapshot(message.data)
          .then((result) => sendResponse({ success: true, result }))
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;

      case 'ERROR':
        logger.error('Content script error:', message.error);
        sendResponse({ success: true });
        return false;

      default:
        logger.warn('Unknown message type received');
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;
    }
  }
);

// ── Handlers ────────────────────────────────────────────────────

function handleShopifyDetected(detection: DetectionResult, tabId?: number): void {
  if (!tabId) return;

  const current = tabStates.get(tabId) ?? { detection: null, summary: null };
  tabStates.set(tabId, { ...current, detection });

  if (detection.isShopify && detection.confidence >= 25) {
    chrome.action.setBadgeText({ text: 'RC', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

function handlePolicyExtracted(summary: PolicySummary, tabId?: number): void {
  if (!tabId) return;
  const current = tabStates.get(tabId) ?? { detection: null, summary: null };
  tabStates.set(tabId, { ...current, summary });
  logger.debug('Policy extracted for tab', tabId);
}

function handlePolicyNotFound(domain: string, tabId?: number): void {
  logger.debug('No policy found for', domain);
  if (tabId) {
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
  }
}

// ── Backend API ─────────────────────────────────────────────────

async function saveSnapshot(summary: PolicySummary): Promise<unknown> {
  const { authToken } = await chrome.storage.sync.get('authToken');

  if (!authToken) {
    throw new Error('No auth token configured. Set one in extension options.');
  }

  const payload = {
    store_domain: summary.storeDomain,
    policy_url: summary.policyUrl,
    policy_type: 'refund', // TODO: infer from URL via getPolicyType()
    summary: { fields: summary.fields, confidence: summary.confidence },
    raw_text_snippet: summary.rawTextSnippet,
    user_agent: navigator.userAgent,
    extension_version: EXTENSION_VERSION,
  };

  const response = await fetch(`${API_BASE_URL}/snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        `API responded with ${response.status}`
    );
  }

  return response.json();
}

// ── Tab lifecycle ───────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => tabStates.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
    tabStates.delete(tabId);
  }
});
