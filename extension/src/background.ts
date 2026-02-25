/**
 * Background service worker -- coordinates messages between content
 * script and popup, manages the action badge, and talks to the
 * optional Rails backend.
 */

import { logger } from './shared/logger';
import {
  stripHtmlToText,
  compactPolicyTextForApi,
  extractPolicyFromText,
  scorePolicyTextQuality,
} from './shared/extract';
import { getCachedSummary, setCachedSummary } from './shared/cache';
import { getPolicyType } from './shared/policyResolver';
import type {
  ExtensionMessage,
  TabState,
  DetectionResult,
  PolicySummary,
  PolicyFields,
  PolicyConfidence,
  PolicyUrls,
} from './shared/types';

// ── Per-tab state (lost on service-worker restart) ──────────────

const tabStates = new Map<number, TabState>();

// When popup requests "Run detection", we inject the content script and resolve when we get SHOPIFY_DETECTED (or timeout)
const pendingRunDetection = new Map<
  number,
  {
    resolve: (r: { state: TabState; injectError?: string }) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

// ── API config ──────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000/api/v1'; // TODO: read from storage / env
const EXTENSION_VERSION = '1.0.0';
const MIN_REFUND_POLICY_QUALITY = 6;
const RENDER_FALLBACK_CANDIDATE_LIMIT = 3;

// ── Message handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case 'SHOPIFY_DETECTED': {
        let resolvedTabId = tabId ?? (message as { tabId?: number }).tabId;
        if (resolvedTabId == null && pendingRunDetection.size === 1) {
          resolvedTabId = pendingRunDetection.keys().next().value;
        }
        handleShopifyDetected(message.data, resolvedTabId);
        if (resolvedTabId) {
          const pending = pendingRunDetection.get(resolvedTabId);
          if (pending) {
            pendingRunDetection.delete(resolvedTabId);
            clearTimeout(pending.timeoutId);
            pending.resolve({ state: tabStates.get(resolvedTabId)! });
          }
        }
        sendResponse({ success: true });
        return false;
      }

      case 'POLICY_EXTRACTED':
        handlePolicyExtracted(message.data, tabId);
        sendResponse({ success: true });
        return false;

      case 'POLICY_PAGE_FOUND':
        handlePolicyPageFound(message.rawHtml, message.policyUrl, message.domain, tabId)
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) => {
            logger.error('Policy page extraction failed:', err);
            if (tabId) {
              const cur = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
              tabStates.set(tabId, { ...cur, status: 'error', errorMessage: err.message });
            }
            sendResponse({ success: false, error: err.message });
          });
        return true;

      case 'POLICY_NOT_FOUND':
        handlePolicyNotFound(message.domain, tabId);
        sendResponse({ success: true });
        return false;

      case 'GET_TAB_STATE': {
        const state = tabStates.get(message.tabId);
        sendResponse({ state: state ?? { detection: null, summary: null, status: 'idle', fromCache: false } });
        return false;
      }

      case 'RUN_DETECTION': {
        const runTabId = message.tabId;
        const emptyState: TabState = {
          detection: null,
          summary: null,
          status: 'idle',
          fromCache: false,
        };
        const send = (state: TabState, injectError?: string) => sendResponse({ state, injectError });
        const resolveWith = (state: TabState, injectError?: string) => {
          const entry = pendingRunDetection.get(runTabId);
          if (!entry) return;
          pendingRunDetection.delete(runTabId);
          clearTimeout(entry.timeoutId);
          entry.resolve({ state, injectError });
        };

        chrome.tabs
          .get(runTabId)
          .then((tab) => {
            const url = tab?.url ?? '';
            if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || (!url.startsWith('http://') && !url.startsWith('https://'))) {
              send(emptyState, 'Open a store page (e.g. allbirds.ca) in this tab.');
              return;
            }
            const timeoutId = setTimeout(() => {
              resolveWith(tabStates.get(runTabId) ?? emptyState);
            }, 4000);
            pendingRunDetection.set(runTabId, {
              resolve: (r) => sendResponse(r),
              timeoutId,
            });
            chrome.scripting
              .executeScript({ target: { tabId: runTabId }, files: ['content.js'] })
              .catch((err: Error) => {
                resolveWith(emptyState, err?.message ?? 'Inject failed');
              });
          })
          .catch(() => {
            send(emptyState, 'Tab not found');
          });
        return true;
      }

      case 'POLICY_URLS_RESOLVED':
        handlePolicyUrlsResolved(message.data, message.domain, tabId)
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) => {
            logger.error('Policy fetch failed:', err);
            if (tabId) {
              const cur = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
              tabStates.set(tabId, { ...cur, status: 'error', errorMessage: err.message });
            }
            sendResponse({ success: false, error: err.message });
          });
        return true;

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

async function tryUseCachedSummary(domain: string, tabId: number): Promise<boolean> {
  try {
    const cached = await getCachedSummary(domain);
    if (!cached) return false;

    const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
    tabStates.set(tabId, { ...current, summary: cached, status: 'done', fromCache: true });
    logger.debug('Using cached policy summary', { domain, tabId, policyUrl: cached.policyUrl });
    return true;
  } catch (err) {
    logger.warn('Failed reading policy cache', { domain, err });
    return false;
  }
}

async function cacheSummary(domain: string, summary: PolicySummary): Promise<void> {
  try {
    await setCachedSummary(domain, summary);
  } catch (err) {
    logger.warn('Failed writing policy cache', { domain, err });
  }
}

function handleShopifyDetected(detection: DetectionResult, tabId?: number): void {
  if (!tabId) return;

  const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
  tabStates.set(tabId, { ...current, detection, status: 'detecting' });

  if (detection.isShopify && detection.confidence >= 25) {
    chrome.action.setBadgeText({ text: 'RC', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

function handlePolicyExtracted(summary: PolicySummary, tabId?: number): void {
  if (!tabId) return;
  const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
  tabStates.set(tabId, { ...current, summary, status: 'done', fromCache: false });
  void cacheSummary(summary.storeDomain, summary);
  logger.debug('Policy extracted for tab', tabId);
}

function handlePolicyNotFound(domain: string, tabId?: number): void {
  logger.debug('No policy found for', domain);
  if (tabId) {
    const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
    tabStates.set(tabId, { ...current, status: 'done' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
  }
}

async function handlePolicyPageFound(
  rawHtml: string,
  policyUrl: string,
  domain: string,
  tabId?: number,
): Promise<void> {
  if (!tabId) return;

  if (await tryUseCachedSummary(domain, tabId)) return;

  const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
  tabStates.set(tabId, { ...current, status: 'extracting' });

  const text = stripHtmlToText(rawHtml);
  const summary = await buildSummary(text, policyUrl, domain);

  await cacheSummary(domain, summary);
  tabStates.set(tabId, { ...tabStates.get(tabId)!, summary, status: 'done', fromCache: false });
}

async function handlePolicyUrlsResolved(
  urls: PolicyUrls,
  domain: string,
  tabId?: number,
): Promise<void> {
  if (!tabId) return;

  if (await tryUseCachedSummary(domain, tabId)) return;

  const current = tabStates.get(tabId) ?? { detection: null, summary: null, status: 'idle' as const, fromCache: false };
  tabStates.set(tabId, { ...current, status: 'fetching' });

  const candidates = urls.refundPolicyCandidates ?? (urls.refundPolicy ? [urls.refundPolicy] : []);
  if (candidates.length === 0 && !urls.shippingPolicy) {
    tabStates.set(tabId, { ...current, status: 'done', fromCache: false });
    return;
  }

  tabStates.set(tabId, { ...tabStates.get(tabId)!, status: 'extracting' });

  const result = await fetchBestPolicyCandidate(candidates);
  if (result && result.quality >= MIN_REFUND_POLICY_QUALITY) {
    logger.debug('Using refund policy candidate', { url: result.url, quality: result.quality });
    const summary = await buildSummary(result.text, result.url, domain);
    await cacheSummary(domain, summary);
    tabStates.set(tabId, { ...tabStates.get(tabId)!, summary, status: 'done', fromCache: false });
    return;
  }

  // Only fallback to shipping policy when we had no refund candidates at all.
  if (candidates.length === 0 && urls.shippingPolicy) {
    logger.debug('No refund candidates; falling back to shipping policy', urls.shippingPolicy);
    const shippingHtml = await fetchPolicyHtml(urls.shippingPolicy);
    const text = stripHtmlToText(shippingHtml);
    const summary = await buildSummary(text, urls.shippingPolicy, domain);
    await cacheSummary(domain, summary);
    tabStates.set(tabId, { ...tabStates.get(tabId)!, summary, status: 'done', fromCache: false });
    return;
  }

  logger.debug('No high-quality refund policy candidate found', {
    bestCandidate: result?.url ?? null,
    bestQuality: result?.quality ?? null,
    candidateCount: candidates.length,
  });

  if (candidates.some((u) => u.toLowerCase().includes('/pages/help-center'))) {
    const rendered = await fetchBestRenderedPolicyCandidate(
      candidates.slice(0, RENDER_FALLBACK_CANDIDATE_LIMIT)
    );
    if (rendered && rendered.quality >= MIN_REFUND_POLICY_QUALITY) {
      logger.debug('Using rendered fallback candidate', { url: rendered.url, quality: rendered.quality });
      const summary = await buildSummary(rendered.text, rendered.url, domain);
      await cacheSummary(domain, summary);
      tabStates.set(tabId, { ...tabStates.get(tabId)!, summary, status: 'done', fromCache: false });
      return;
    }
  }

  tabStates.set(tabId, { ...tabStates.get(tabId)!, status: 'done', fromCache: false });
}

// ── AI extraction ───────────────────────────────────────────────

async function buildSummary(
  text: string,
  policyUrl: string,
  domain: string,
): Promise<PolicySummary> {
  const compactText = compactPolicyTextForApi(text);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE_URL}/extract`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: compactText, domain }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { error?: { message?: string } })?.error?.message ??
          `Extract API responded with ${response.status}`
      );
    }

    const data = (await response.json()) as {
      fields: PolicyFields;
      confidence: PolicyConfidence;
    };

    const hasUsefulField = Object.values(data.fields ?? {}).some(
      (v) => typeof v === 'string' && v.trim().length > 0
    );
    if (!hasUsefulField) {
      return extractPolicyFromText(compactText, policyUrl, domain);
    }

    return {
      storeDomain: domain,
      policyUrl,
      extractedAt: new Date().toISOString(),
      fields: data.fields,
      confidence: data.confidence,
      rawTextSnippet: compactText.slice(0, 500),
    };
  } catch (err) {
    logger.warn('AI extract failed, falling back to local heuristics:', err);
    return extractPolicyFromText(compactText, policyUrl, domain);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchBestPolicyCandidate(
  candidates: string[],
): Promise<{ url: string; html: string; text: string; quality: number } | null> {
  let best: { url: string; html: string; text: string; quality: number } | null = null;

  for (const url of candidates) {
    try {
      const html = await fetchPolicyHtml(url);
      const text = stripHtmlToText(html);
      const compact = compactPolicyTextForApi(text);
      const quality = scorePolicyTextQuality(compact);
      const candidate = { url, html, text, quality };
      logger.debug('Policy candidate scored', { url, quality });

      if (!best || candidate.quality > best.quality) {
        best = candidate;
      }

      if (quality >= 8) {
        return candidate;
      }
    } catch {
      logger.debug('Candidate URL failed, trying next:', url);
    }
  }

  return best;
}

async function fetchPolicyHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    });

    if (!response.ok) {
      throw new Error(`Policy page returned ${response.status}: ${url}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Unexpected content type ${contentType} for ${url}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchBestRenderedPolicyCandidate(
  candidates: string[],
): Promise<{ url: string; text: string; quality: number } | null> {
  let best: { url: string; text: string; quality: number } | null = null;

  for (const url of candidates) {
    const renderedText = await fetchRenderedTextFromHiddenTab(url);
    if (!renderedText) continue;

    const compact = compactPolicyTextForApi(renderedText);
    const quality = scorePolicyTextQuality(compact);
    const candidate = { url, text: renderedText, quality };
    logger.debug('Rendered candidate scored', { url, quality });

    if (!best || candidate.quality > best.quality) best = candidate;
    if (quality >= 8) return candidate;
  }

  return best;
}

async function fetchRenderedTextFromHiddenTab(url: string): Promise<string | null> {
  let tabId: number | null = null;
  try {
    const created = await chrome.tabs.create({ url, active: false });
    tabId = created.id ?? null;
    if (!tabId) return null;

    await waitForTabComplete(tabId, 15000);

    const execution = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const hasSignal = (): boolean =>
          /\breturn|refund|exchange|final sale|non-returnable|defective|restocking\b/i.test(
            document.body?.innerText ?? ''
          );

        if (!hasSignal()) {
          await new Promise<void>((resolve) => {
            const timeoutId = setTimeout(() => resolve(), 5000);
            const observer = new MutationObserver(() => {
              if (hasSignal()) {
                clearTimeout(timeoutId);
                observer.disconnect();
                resolve();
              }
            });
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          });
        }

        return document.body?.innerText ?? '';
      },
    });

    const text = execution[0]?.result;
    return typeof text === 'string' ? text : null;
  } catch (err) {
    logger.debug('Rendered-tab extraction failed', { url, err });
    return null;
  } finally {
    if (tabId != null) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch {
      // Tab may close.
      return;
    }
    await sleep(250);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Backend API ─────────────────────────────────────────────────

async function saveSnapshot(summary: PolicySummary): Promise<unknown> {
  const { authToken: rawToken } = await chrome.storage.sync.get('authToken');
  const authToken = typeof rawToken === 'string' ? rawToken.trim() : '';

  if (!authToken) {
    throw new Error('No auth token configured. Set one in extension options.');
  }

  const payload = {
    store_domain: summary.storeDomain,
    policy_url: summary.policyUrl,
    policy_type: getPolicyType(summary.policyUrl),
    summary: { fields: summary.fields, confidence: summary.confidence },
    raw_text_snippet: summary.rawTextSnippet,
    user_agent: 'Chrome Extension',
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
