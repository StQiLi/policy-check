/**
 * Policy URL resolution -- prefer canonical Shopify routes,
 * fall back to footer link detection.
 */

import type { PolicyUrls } from './types';

const CANONICAL_PATHS: Record<string, string> = {
  refund: '/policies/refund-policy',
  shipping: '/policies/shipping-policy',
  privacy: '/policies/privacy-policy',
  terms: '/policies/terms-of-service',
  subscription: '/policies/subscription-policy',
};

/**
 * Build candidate policy URLs for the current store.
 *
 * In v1 we assume the canonical routes exist and let the
 * extraction step handle 404s gracefully.  A future version
 * should HEAD-check or probe the DOM for actual links.
 */
export async function resolvePolicyUrls(): Promise<PolicyUrls> {
  const base = window.location.origin;

  const refundPolicy = buildCanonicalUrl(base, 'refund') ?? findPolicyInFooter(['return', 'refund']);
  const shippingPolicy =
    buildCanonicalUrl(base, 'shipping') ?? findPolicyInFooter(['shipping', 'delivery']);
  const privacyPolicy = buildCanonicalUrl(base, 'privacy');
  const termsOfService = buildCanonicalUrl(base, 'terms');

  return { refundPolicy, shippingPolicy, privacyPolicy, termsOfService };
}

function buildCanonicalUrl(base: string, key: string): string | null {
  const path = CANONICAL_PATHS[key];
  return path ? `${base}${path}` : null;
}

/**
 * Search footer links for a policy URL matching one of the given keywords.
 */
function findPolicyInFooter(keywords: string[]): string | null {
  const footer = document.querySelector('footer');
  if (!footer) return null;

  const links = Array.from(footer.querySelectorAll<HTMLAnchorElement>('a[href]'));

  for (const link of links) {
    const text = link.textContent?.toLowerCase() ?? '';
    const href = link.getAttribute('href') ?? '';

    if (keywords.some((kw) => text.includes(kw) || href.includes(kw))) {
      try {
        const resolved = new URL(href, window.location.origin).href;
        if (new URL(resolved).origin !== window.location.origin) return null;
        return resolved;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Does the current page look like a Shopify policy page?
 */
export function isPolicyPage(): boolean {
  const path = window.location.pathname.toLowerCase();
  return (
    path.includes('/policies/') ||
    path.includes('/pages/return') ||
    path.includes('/pages/refund') ||
    path.includes('/pages/shipping')
  );
}

/**
 * Infer the policy type from a URL.
 */
export function getPolicyType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('refund') || lower.includes('return')) return 'refund';
  if (lower.includes('shipping') || lower.includes('delivery')) return 'shipping';
  if (lower.includes('privacy')) return 'privacy';
  if (lower.includes('terms')) return 'terms';
  if (lower.includes('subscription')) return 'subscription';
  return 'unknown';
}
