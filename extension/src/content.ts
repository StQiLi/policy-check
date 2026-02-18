/**
 * Content script -- runs on matched pages to detect Shopify stores
 * and extract return-policy summaries.
 */

import { detectShopify } from './shared/shopifyDetect';
import { resolvePolicyUrls, isPolicyPage } from './shared/policyResolver';
import { extractPolicy } from './shared/extract';
import { logger } from './shared/logger';
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

    if (!detection.isShopify) return;

    logger.info('Shopify store detected:', detection.domain, `(${detection.confidence}%)`);
    sendMessage({ type: 'SHOPIFY_DETECTED', data: detection });

    if (isPolicyPage()) {
      const summary = extractPolicy(window.location.href);
      sendMessage({ type: 'POLICY_EXTRACTED', data: summary });
      return;
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
