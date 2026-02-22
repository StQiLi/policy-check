/**
 * Policy extraction logic using regex + heuristics.
 * No LLM required for v1.
 */

import type { PolicySummary, PolicyFields, PolicyConfidence } from './types';

type ExtractResult = {
  value: string | null;
  confidence: 'low' | 'medium' | 'high';
};

// ── HTML stripping ───────────────────────────────────────────────

/**
 * Shopify policy pages use known content containers. Try to extract
 * just the policy body before falling back to full-page stripping.
 */
const CONTENT_SELECTORS = [
  '.shopify-policy__body',
  '.shopify-policy__container',
  '.rte',
  '[data-policy-body]',
  'article',
  'main .page-content',
  'main',
];

function extractContentFromContainer(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    for (const selector of CONTENT_SELECTORS) {
      const el = doc.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 100) {
        return el.innerHTML;
      }
    }
  } catch {
    // DOMParser not available (e.g. service worker context)
  }

  return null;
}

export function stripHtmlToText(html: string): string {
  const contentHtml = extractContentFromContainer(html) ?? html;

  let text = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    // Chat widgets, cookie banners, and other overlays
    .replace(/<div[^>]*(?:chat|livechat|intercom|drift|zendesk|tawk|crisp|cookie|consent|banner|popup|modal|overlay)[^>]*>[\s\S]*?<\/div>/gi, '');

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|li|h[1-6]|div)[^>]*>/gi, '\n');

  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ── Core extraction ──────────────────────────────────────────────

export function extractPolicyFromText(
  text: string,
  policyUrl: string,
  storeDomain: string,
): PolicySummary {
  const lower = text.toLowerCase();

  const returnWindowResult = extractReturnWindow(lower);
  const conditionResult = extractConditionRequirements(lower);
  const feesResult = extractFees(lower);
  const shippingResult = extractReturnShipping(lower);
  const exclusionsResult = extractExclusions(lower);

  const fields: PolicyFields = {
    returnWindow: returnWindowResult.value,
    conditionRequirements: conditionResult.value,
    fees: feesResult.value,
    returnShipping: shippingResult.value,
    exclusions: exclusionsResult.value,
  };

  return {
    storeDomain,
    policyUrl,
    extractedAt: new Date().toISOString(),
    fields,
    confidence: calculateConfidence(
      returnWindowResult,
      conditionResult,
      feesResult,
      shippingResult,
      exclusionsResult,
    ),
    rawTextSnippet: text.slice(0, 500),
  };
}

/**
 * Extract a structured policy summary from a policy page URL.
 * For v1 we only extract from the current DOM if we happen to be
 * on the policy page -- cross-origin fetching is deferred to v2.
 */
export function extractPolicy(policyUrl: string): PolicySummary {
  const onPolicyPage = window.location.href === policyUrl;
  const text = onPolicyPage ? stripHtmlToText(document.body.innerHTML) : '';
  return extractPolicyFromText(text, policyUrl, window.location.hostname);
}

// ── Sentence utilities ───────────────────────────────────────────

function getSentences(text: string): string[] {
  return text.split(/[.\n]+/).filter((s) => s.trim().length > 5);
}

function extractClause(text: string, matchIndex: number, radius: number): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + radius);
  return text.slice(start, end).trim();
}

// ── Field extractors ────────────────────────────────────────────

const WORD_NUMBERS: Record<string, string> = {
  seven: '7',
  fourteen: '14',
  fifteen: '15',
  thirty: '30',
  sixty: '60',
  ninety: '90',
};

function extractReturnWindow(lower: string): ExtractResult {
  const negativePattern = /no\s+returns?|all\s+sales?\s+(?:are\s+)?final|non[- ]?refundable/;
  const negativeMatch = lower.match(negativePattern);
  if (negativeMatch) {
    return { value: negativeMatch[0], confidence: 'high' };
  }

  let normalized = lower;
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), num);
  }

  const anchorPattern = /returns?|refunds?|exchanges?|replacement/;
  const durationPatterns = [
    /\d+[- ]?(?:calendar\s+)?days?/,
    /\d+[- ]?weeks?/,
    /\d+[- ]?months?/,
  ];

  for (const pattern of durationPatterns) {
    const re = new RegExp(pattern.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) !== null) {
      const windowStart = Math.max(0, match.index - 300);
      const windowEnd = Math.min(normalized.length, match.index + match[0].length + 300);
      if (anchorPattern.test(normalized.slice(windowStart, windowEnd))) {
        return { value: match[0], confidence: 'high' };
      }
    }
  }

  return { value: null, confidence: 'low' };
}

function extractConditionRequirements(lower: string): ExtractResult {
  const keywords = [
    'unworn',
    'unwashed',
    'tags attached',
    'tags still attached',
    'original packaging',
    'original condition',
    'unused',
    'unaltered',
    'like new',
    'new condition',
    'in its original',
  ];

  const sentences = getSentences(lower);
  const matched: string[] = [];
  let hasMultipleInSentence = false;

  for (const sentence of sentences) {
    const hits = keywords.filter((kw) => sentence.includes(kw));
    if (hits.length > 0) {
      const trimmed = sentence.trim();
      if (!matched.includes(trimmed)) matched.push(trimmed);
      if (hits.length >= 2) hasMultipleInSentence = true;
    }
  }

  if (matched.length === 0) return { value: null, confidence: 'low' };

  return {
    value: matched.slice(0, 2).join('; '),
    confidence: hasMultipleInSentence ? 'high' : 'medium',
  };
}

function extractFees(lower: string): ExtractResult {
  const specificFeePatterns = [
    /\d+%\s*restocking\s+fees?/,
    /\d+\s*percent\s+restocking/,
    /\$[\d.]+\s*restocking\s+fees?/,
    /a\s+\$[\d.]+\s+fee\s+will\s+be\s+charged/,
    /original\s+shipping\s+is\s+non[- ]?refundable/,
    /shipping\s+fees?\s+are\s+not\s+refunded/,
  ];

  for (const pattern of specificFeePatterns) {
    const match = lower.match(pattern);
    if (match && match.index !== undefined) {
      return { value: extractClause(lower, match.index, 40), confidence: 'high' };
    }
  }

  const noFeePatterns = [
    /no\s+restocking\s+fees?/,
    /no\s+fees?/,
    /free\s+returns?/,
    /no\s+charge/,
  ];

  for (const pattern of noFeePatterns) {
    const match = lower.match(pattern);
    if (match && match.index !== undefined) {
      return { value: extractClause(lower, match.index, 40), confidence: 'medium' };
    }
  }

  return { value: null, confidence: 'low' };
}

function extractReturnShipping(lower: string): ExtractResult {
  const freeExact = [
    'free returns',
    'free return shipping',
    'prepaid return label',
    "we'll provide a label",
    'return label will be',
    'free of charge',
    'at no cost to you',
  ];

  const sellerExact = [
    'seller pays',
    'we pay return shipping',
    "we'll pay",
    'at our expense',
  ];

  const customerExact = [
    'customer pays',
    'buyer pays',
    'at your expense',
    "at the customer's expense",
    'return shipping is your responsibility',
    'shipping costs are non-refundable',
    'you are responsible for',
  ];

  const freePartial = ['we cover', 'we pay'];

  for (const phrase of freeExact) {
    if (lower.includes(phrase)) return { value: 'Free returns', confidence: 'high' };
  }
  for (const phrase of sellerExact) {
    if (lower.includes(phrase)) return { value: 'Seller pays', confidence: 'high' };
  }
  for (const phrase of customerExact) {
    if (lower.includes(phrase)) return { value: 'Customer pays', confidence: 'high' };
  }
  for (const phrase of freePartial) {
    if (lower.includes(phrase)) return { value: 'Free returns', confidence: 'medium' };
  }

  return { value: null, confidence: 'low' };
}

function extractExclusions(lower: string): ExtractResult {
  const highConfidenceKeywords = ['final sale', 'cannot be returned'];
  const keywords = [
    'final sale',
    'clearance',
    'custom',
    'personalized',
    'non-returnable',
    'cannot be returned',
    'not eligible for return',
    'excluded from',
    'sale items',
    'underwear',
    'swimwear',
    'intimate',
    'digital',
    'downloadable',
    'gift card',
  ];

  const sentences = getSentences(lower);
  const matched: string[] = [];
  let hasHighConfidence = false;

  for (const sentence of sentences) {
    if (keywords.some((kw) => sentence.includes(kw))) {
      const trimmed = sentence.trim();
      if (!matched.includes(trimmed)) matched.push(trimmed);
      if (highConfidenceKeywords.some((kw) => sentence.includes(kw))) {
        hasHighConfidence = true;
      }
    }
  }

  if (matched.length === 0) return { value: null, confidence: 'low' };

  return {
    value: matched.slice(0, 3).join('; '),
    confidence: hasHighConfidence ? 'high' : 'medium',
  };
}

// ── Confidence scoring ──────────────────────────────────────────

function calculateConfidence(
  returnWindowResult: ExtractResult,
  conditionResult: ExtractResult,
  feesResult: ExtractResult,
  shippingResult: ExtractResult,
  exclusionsResult: ExtractResult,
): PolicyConfidence {
  return {
    returnWindow: returnWindowResult.confidence,
    conditionRequirements: conditionResult.confidence,
    fees: feesResult.confidence,
    returnShipping: shippingResult.confidence,
    exclusions: exclusionsResult.confidence,
  };
}
