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

const ALTERNATE_PATHS: Record<string, string[]> = {
  refund: ['/pages/returnpolicy', '/pages/refund-policy', '/pages/return-policy'],
};
const REFUND_TEXT_KEYWORDS = ['return', 'refund', 'exchange', 'returns'];
const REFUND_PATH_KEYWORDS = ['/policies/refund', '/return', '/refund', 'help-center'];
const REFUND_NEGATIVE_KEYWORDS = ['privacy', 'terms', 'shipping', 'faq', 'contact'];

/**
 * Build candidate policy URLs for the current store.
 *
 * In v1 we assume the canonical routes exist and let the
 * extraction step handle 404s gracefully.  A future version
 * should HEAD-check or probe the DOM for actual links.
 */
export async function resolvePolicyUrls(): Promise<PolicyUrls> {
  const base = window.location.origin;
  const footerRefundCandidates = findRefundCandidatesInFooter().flatMap((url) =>
    expandHelpCenterRefundCandidates(url)
  );
  const canonicalCandidates = buildCandidateUrls(base, 'refund');
  const refundPolicyCandidates = dedupeUrls([...canonicalCandidates, ...footerRefundCandidates]);

  const refundPolicy = refundPolicyCandidates[0] ?? null;
  const shippingPolicy =
    buildCanonicalUrl(base, 'shipping') ?? findPolicyInFooter(['shipping', 'delivery']);
  const privacyPolicy = buildCanonicalUrl(base, 'privacy');
  const termsOfService = buildCanonicalUrl(base, 'terms');

  return { refundPolicy, refundPolicyCandidates, shippingPolicy, privacyPolicy, termsOfService };
}

function buildCanonicalUrl(base: string, key: string): string | null {
  const path = CANONICAL_PATHS[key];
  return path ? `${base}${path}` : null;
}

function buildCandidateUrls(base: string, key: string): string[] {
  const candidates: string[] = [];
  const canonical = CANONICAL_PATHS[key];
  if (canonical) candidates.push(`${base}${canonical}`);
  const alternates = ALTERNATE_PATHS[key];
  if (alternates) candidates.push(...alternates.map((p) => `${base}${p}`));
  return candidates;
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

function findPolicyInFooter(includeKeywords: string[], avoidKeywords: string[] = []): string | null {
  return findBestFooterLink(includeKeywords, avoidKeywords);
}

/**
 * Search footer links for the best policy URL matching include keywords while
 * avoiding links that match avoid keywords.
 */
function findBestFooterLink(includeKeywords: string[], avoidKeywords: string[] = []): string | null {
  const footer = document.querySelector('footer');
  if (!footer) return null;

  const links = Array.from(footer.querySelectorAll<HTMLAnchorElement>('a[href]'));
  let best: { url: string; score: number } | null = null;

  for (const link of links) {
    const resolved = resolveSameOriginHref(link.getAttribute('href'));
    if (!resolved) continue;

    const text = (link.textContent ?? '').toLowerCase();
    const lowerUrl = resolved.toLowerCase();
    const includeHits = includeKeywords.filter((kw) => text.includes(kw) || lowerUrl.includes(kw)).length;
    if (includeHits === 0) continue;

    const avoidHits = avoidKeywords.filter((kw) => text.includes(kw) || lowerUrl.includes(kw)).length;
    const score = includeHits * 4 - avoidHits * 3 + (text.length > 4 ? 1 : 0);

    if (!best || score > best.score) best = { url: resolved, score };
  }

  return best?.url ?? null;
}

function findRefundCandidatesInFooter(): string[] {
  const footer = document.querySelector('footer');
  if (!footer) return [];

  const links = Array.from(footer.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const scored: { url: string; score: number }[] = [];

  for (const link of links) {
    const resolved = resolveSameOriginHref(link.getAttribute('href'));
    if (!resolved) continue;

    const text = (link.textContent ?? '').toLowerCase();
    const lowerUrl = resolved.toLowerCase();
    const merged = `${text} ${lowerUrl}`;

    const positiveTextHits = REFUND_TEXT_KEYWORDS.filter((kw) => text.includes(kw)).length;
    const positiveUrlHits = REFUND_PATH_KEYWORDS.filter((kw) => lowerUrl.includes(kw)).length;
    const negativeHits = REFUND_NEGATIVE_KEYWORDS.filter((kw) => merged.includes(kw)).length;
    const hasHelpCenter = lowerUrl.includes('help-center');
    const hcUrl = getHelpCenterArticlePath(lowerUrl);

    let score = positiveTextHits * 6 + positiveUrlHits * 5 - negativeHits * 3;
    if (hasHelpCenter) score += 1;
    if (hcUrl && /\breturn|refund|exchange\b/.test(hcUrl)) score += 6;
    if (text.includes('returns')) score += 3;
    if (lowerUrl.includes('/policies/refund-policy')) score += 8;
    if (score <= 0) continue;

    scored.push({ url: resolved, score });
  }

  return dedupeUrls(scored.sort((a, b) => b.score - a.score).map((s) => s.url));
}

function resolveSameOriginHref(rawHref: string | null): string | null {
  if (!rawHref) return null;
  try {
    const resolved = new URL(rawHref, window.location.origin).href;
    return new URL(resolved).origin === window.location.origin ? resolved : null;
  } catch {
    return null;
  }
}

function getHelpCenterArticlePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hcUrl = parsed.searchParams.get('hcUrl');
    return hcUrl ? decodeURIComponent(hcUrl).toLowerCase() : null;
  } catch {
    return null;
  }
}

function expandHelpCenterRefundCandidates(url: string): string[] {
  const lower = url.toLowerCase();
  if (!lower.includes('help-center')) return [url];

  const candidates = [url];
  try {
    const parsed = new URL(url);
    const currentHcUrl = parsed.searchParams.get('hcUrl');
    const decoded = currentHcUrl ? decodeURIComponent(currentHcUrl).toLowerCase() : '';

    const refundArticlePaths = [
      '/en-us/return-policy-and-process',
      '/en-US/return-policy-and-process',
      '/en-us/returns',
      '/en-US/returns',
      '/en-us/return-policy',
      '/en-US/return-policy',
    ];

    for (const path of refundArticlePaths) {
      const next = new URL(parsed.href);
      next.searchParams.set('hcUrl', path);
      candidates.push(next.href);
    }

    if (decoded.includes('shipping-options')) {
      const patched = decoded.replace('shipping-options-prices-and-times', 'return-policy-and-process');
      const next = new URL(parsed.href);
      next.searchParams.set('hcUrl', patched);
      candidates.push(next.href);
    }
  } catch {
    // Keep original candidate only.
  }

  return dedupeUrls(candidates);
}

/**
 * Does the current page look like a Shopify policy page?
 */
export function isPolicyPage(): boolean {
  const path = window.location.pathname.toLowerCase();
  return (
    path.includes('/policies/') ||
    path.includes('/pages/return') ||
    path.includes('/pages/returnpolicy') ||
    path.includes('/pages/refund') ||
    path.includes('/pages/shipping')
  );
}

/**
 * Infer the policy type from a URL.
 */
export function getPolicyType(url: string): string {
  const lower = url.toLowerCase();
  const helpCenterArticle = getHelpCenterArticlePath(url);
  if (helpCenterArticle && /\brefund|return|exchange\b/.test(helpCenterArticle)) {
    return 'refund';
  }

  if (lower.includes('refund') || lower.includes('return')) return 'refund';
  if (lower.includes('shipping') || lower.includes('delivery')) return 'shipping';
  if (lower.includes('privacy')) return 'privacy';
  if (lower.includes('terms')) return 'terms';
  if (lower.includes('subscription')) return 'subscription';
  return 'unknown';
}
