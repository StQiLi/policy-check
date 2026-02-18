/**
 * Policy extraction logic using regex + heuristics.
 * No LLM required for v1.
 */

import type { PolicySummary, PolicyFields, PolicyConfidence } from './types';

/**
 * Extract a structured policy summary from a policy page URL.
 * For v1 we only extract from the current DOM if we happen to be
 * on the policy page -- cross-origin fetching is deferred to v2.
 */
export function extractPolicy(policyUrl: string): PolicySummary {
  const onPolicyPage = window.location.href === policyUrl;
  const text = onPolicyPage ? (document.body.textContent ?? '') : '';

  const fields = extractFields(text);
  const confidence = calculateConfidence(fields);

  return {
    storeDomain: window.location.hostname,
    policyUrl,
    extractedAt: new Date().toISOString(),
    fields,
    confidence,
    rawTextSnippet: text.slice(0, 500),
  };
}

// ── Field extractors ────────────────────────────────────────────

function extractFields(text: string): PolicyFields {
  return {
    returnWindow: extractReturnWindow(text),
    conditionRequirements: extractConditionRequirements(text),
    fees: extractFees(text),
    returnShipping: extractReturnShipping(text),
    exclusions: extractExclusions(text),
  };
}

function extractReturnWindow(text: string): string | null {
  // TODO: Improve proximity matching -- only match numbers near "return"/"refund"
  const patterns = [/(\d+)\s*days?/i, /(\d+)\s*weeks?/i, /(\d+)\s*months?/i, /no\s+returns?/i];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractConditionRequirements(text: string): string | null {
  // TODO: Extract surrounding sentence for more context
  const keywords = ['unworn', 'tags attached', 'original packaging', 'unused', 'original condition'];
  const lower = text.toLowerCase();
  const found = keywords.filter((kw) => lower.includes(kw));
  return found.length > 0 ? found.join(', ') : null;
}

function extractFees(text: string): string | null {
  // TODO: Improve to capture full clause, not just regex match
  const patterns = [
    /(\d+)%\s*(restocking|fee)/i,
    /\$(\d+)\s*(restocking|fee)/i,
    /no\s*(restocking\s*)?fee/i,
    /free\s*returns?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractReturnShipping(text: string): string | null {
  // TODO: Expand keyword list from real Shopify policy corpus
  const lower = text.toLowerCase();

  if (lower.includes('customer pays') || lower.includes('buyer pays'))
    return 'Customer pays';
  if (lower.includes('free return') || lower.includes('prepaid label'))
    return 'Free returns';
  if (lower.includes('seller pays') || lower.includes('we pay'))
    return 'Seller pays';

  return null;
}

function extractExclusions(text: string): string | null {
  // TODO: Add sentence extraction around matches
  const keywords = ['final sale', 'clearance', 'custom', 'personalized', 'non-returnable', 'sale items'];
  const lower = text.toLowerCase();
  const found = keywords.filter((kw) => lower.includes(kw));
  return found.length > 0 ? found.join(', ') : null;
}

// ── Confidence scoring ──────────────────────────────────────────

function calculateConfidence(fields: PolicyFields): PolicyConfidence {
  // TODO: Base confidence on regex match quality, keyword proximity, and page structure
  return {
    returnWindow: fields.returnWindow ? 'high' : 'low',
    conditionRequirements: fields.conditionRequirements ? 'medium' : 'low',
    fees: fields.fees ? 'high' : 'low',
    returnShipping: fields.returnShipping ? 'medium' : 'low',
    exclusions: fields.exclusions ? 'low' : 'low',
  };
}
