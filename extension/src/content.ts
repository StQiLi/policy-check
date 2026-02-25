/**
 * Content script -- runs on matched pages to detect Shopify stores
 * and extract return-policy summaries.
 */

import { detectShopify } from './shared/shopifyDetect';
import { resolvePolicyUrls, isPolicyPage } from './shared/policyResolver';
import { logger } from './shared/logger';
import { compactPolicyTextForApi, scorePolicyTextQuality, stripHtmlToText } from './shared/extract';
import type { ExtensionMessage, PolicyUrls } from './shared/types';

/**
 * Safely send a message to the background service worker.
 * Swallows "receiving end does not exist" errors that happen
 * when the background is not yet awake.
 */
function sendMessage(msg: ExtensionMessage): void {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      logger.warn('sendMessage failed:', chrome.runtime.lastError.message);
    }
  });
}

async function run(): Promise<void> {
  try {
    const detection = detectShopify();

    sendMessage({ type: 'SHOPIFY_DETECTED', data: detection });

    if (!detection.isShopify) return;

    if (isPolicyPage()) {
      const rawHtml = document.body.innerHTML;
      const text = stripHtmlToText(rawHtml);
      const quality = scorePolicyTextQuality(compactPolicyTextForApi(text));

      // Guard against false positives (e.g. generic help-center shell pages).
      if (quality >= 6) {
        sendMessage({
          type: 'POLICY_PAGE_FOUND',
          policyUrl: window.location.href,
          rawHtml,
          domain: detection.domain,
        });
        return;
      }

      logger.debug('Current page looked like policy URL but had low text quality; resolving candidates instead', {
        href: window.location.href,
        quality,
      });
    }

    const urls: PolicyUrls = await resolvePolicyUrls();
    sendMessage({ type: 'POLICY_URLS_RESOLVED', data: urls, domain: detection.domain });
  } catch (error) {
    logger.error('Content script error:', error);
    sendMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Execute after the DOM has settled.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void run());
} else {
  void run();
}
