/**
 * Shopify store detection using multiple page signals.
 * Each indicator contributes to a 0-100 confidence score.
 */

import type { DetectionResult } from './types';

/**
 * Weight each indicator differently -- the Shopify JS global is the
 * strongest single signal, while the CDN check picks up themes that
 * load assets from cdn.shopify.com even on custom domains.
 */
const WEIGHTS: Record<keyof DetectionResult['indicators'], number> = {
  hasShopifyGlobal: 25,
  hasMetaTags: 25,
  hasCdnAssets: 25,
  isMyshopifyDomain: 25,
};

export function detectShopify(): DetectionResult {
  const domain = window.location.hostname;

  const indicators = {
    hasShopifyGlobal: checkShopifyGlobal(),
    hasMetaTags: checkMetaTags(),
    hasCdnAssets: checkCdnAssets(),
    isMyshopifyDomain: checkMyshopifyDomain(domain),
  };

  const confidence = Object.entries(indicators).reduce(
    (sum, [key, present]) =>
      sum + (present ? WEIGHTS[key as keyof typeof WEIGHTS] : 0),
    0
  );

  return {
    isShopify: confidence >= 25,
    confidence: Math.min(confidence, 100),
    domain,
    indicators,
  };
}

function checkShopifyGlobal(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof (window as any).Shopify !== 'undefined';
  } catch {
    return false;
  }
}

function checkMetaTags(): boolean {
  const selectors = [
    'meta[name="shopify-checkout-api-token"]',
    'meta[name="shopify-digital-wallet"]',
    'link[href*="cdn.shopify.com/s/files"]',
  ];
  return selectors.some((s) => document.querySelector(s) !== null);
}

function checkCdnAssets(): boolean {
  const resourceUrls = [
    ...Array.from(document.querySelectorAll('script[src]')).map(
      (el) => el.getAttribute('src') ?? ''
    ),
    ...Array.from(document.querySelectorAll('link[href]')).map(
      (el) => el.getAttribute('href') ?? ''
    ),
  ];
  return resourceUrls.some((url) => url.includes('cdn.shopify.com'));
}

function checkMyshopifyDomain(domain: string): boolean {
  return domain.endsWith('.myshopify.com');
}

/**
 * Best-effort store name from the Shopify global.
 */
export function getStoreName(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shopify = (window as any).Shopify;
    return (shopify?.shop as string) ?? null;
  } catch {
    return null;
  }
}
