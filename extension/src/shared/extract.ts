/**
 * Policy extraction logic using regex + heuristics.
 * No LLM required for v1.
 */

import type { PolicySummary, PolicyFields, PolicyConfidence } from './types';

type ConfidenceLevel = 'low' | 'medium' | 'high';

type ExtractResult = {
  value: string | null;
  confidence: ConfidenceLevel;
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
  const stripped = stripTagsToText(contentHtml);
  return normalizeText(stripped).slice(0, MAX_TEXT_LENGTH);
}

// ── Core extraction ──────────────────────────────────────────────

export function extractPolicyFromText(
  text: string,
  policyUrl: string,
  storeDomain: string,
): PolicySummary {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();

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
    rawTextSnippet: normalized.slice(0, 500),
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
  return text
    .split(SENTENCE_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function extractClause(text: string, matchIndex: number, radius: number): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ── Field extractors ────────────────────────────────────────────

const WORD_NUMBERS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  twentyone: '21',
  twentyeight: '28',
  thirty: '30',
  forty: '40',
  fortyfive: '45',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
};

function normalizeNumberWords(lower: string): string {
  let normalized = lower.replace(/-/g, ' ');
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), num);
  }
  // Normalize "twenty one" style leftovers.
  normalized = normalized
    .replace(/\btwenty\s+one\b/g, '21')
    .replace(/\btwenty\s+eight\b/g, '28')
    .replace(/\bforty\s+five\b/g, '45');
  return normalized;
}

function estimateConfidence(score: number): ConfidenceLevel {
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function summarizeSentences(sentences: string[], maxCount: number): string | null {
  if (sentences.length === 0) return null;
  const unique = Array.from(new Set(sentences.map((s) => s.trim()).filter(Boolean)));
  return unique
    .slice(0, maxCount)
    .map((s) => s.replace(/\s+/g, ' '))
    .join('; ')
    .slice(0, 260);
}

function sentenceHasAnchor(sentence: string): boolean {
  return FIELD_ANCHORS.test(sentence);
}

function strongestMatch(
  lower: string,
  patterns: RegExp[],
): { text: string; index: number; score: number } | null {
  let best: { text: string; index: number; score: number } | null = null;

  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(lower)) !== null) {
      const index = match.index;
      const clause = extractClause(lower, index, 120);
      const score =
        (sentenceHasAnchor(clause) ? 2 : 0) +
        (/\bif\b|\bunless\b|\bexcept\b/.test(clause) ? 1 : 0) +
        (/\breturn|refund|exchange\b/.test(clause) ? 2 : 0);
      if (!best || score > best.score) {
        best = { text: match[0], index, score };
      }
    }
  }

  return best;
}

function extractReturnWindow(lower: string): ExtractResult {
  const hardNegative = strongestMatch(lower, NEGATIVE_RETURN_PATTERNS);
  const normalized = normalizeNumberWords(lower);
  const durationPattern =
    /\b(?:within|up to|for|from|after|accept(?:ed)?\s+for|eligible\s+for)?\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(calendar\s+)?(day|week|month|year)s?\b/g;

  let best: { value: string; score: number } | null = null;
  let match: RegExpExecArray | null;

  while ((match = durationPattern.exec(normalized)) !== null) {
    const start = match.index;
    const clause = extractClause(normalized, start, 180);
    if (!sentenceHasAnchor(clause)) continue;

    const first = match[1];
    const second = match[2];
    const unit = match[4];
    const value = second ? `${first}-${second} ${unit}s` : `${first} ${unit}${first === '1' ? '' : 's'}`;

    let score = 3;
    if (/\bwithin|from delivery|from purchase|of receipt\b/.test(clause)) score += 1;
    if (/\bexchange|refund|return\b/.test(clause)) score += 1;
    if (/\bif\b|\bunless\b/.test(clause)) score -= 1;

    if (!best || score > best.score) best = { value, score };
  }

  if (hardNegative && !best) {
    return { value: hardNegative.text, confidence: 'high' };
  }

  if (hardNegative && best) {
    return { value: hardNegative.text, confidence: 'medium' };
  }

  if (best) {
    return { value: best.value, confidence: estimateConfidence(best.score) };
  }

  const openEnded = strongestMatch(lower, [
    /\breturns?\s+accepted\b/,
    /\bcontact\s+us\s+for\s+returns?\b/,
    /\bcase[- ]by[- ]case\b/,
  ]);
  if (openEnded) {
    return { value: extractClause(lower, openEnded.index, 90), confidence: 'medium' };
  }

  return { value: null, confidence: 'low' };
}

function extractConditionRequirements(lower: string): ExtractResult {
  const keywords = [
    'unworn',
    'unwashed',
    'tags attached',
    'tags still attached',
    'with tags',
    'original packaging',
    'original condition',
    'unused',
    'unaltered',
    'resalable condition',
    'resellable condition',
    'like new',
    'new condition',
    'in its original',
    'proof of purchase',
    'receipt required',
  ];

  const sentences = getSentences(lower);
  const matched: string[] = [];
  let bestScore = 0;

  for (const sentence of sentences) {
    const hits = keywords.filter((kw) => sentence.includes(kw));
    if (hits.length === 0) continue;

    const anchorBoost = sentenceHasAnchor(sentence) ? 1 : 0;
    const negativePenalty = /\bnot\b|\bno\b/.test(sentence) ? 1 : 0;
    const score = hits.length + anchorBoost - negativePenalty;
    bestScore = Math.max(bestScore, score);

    matched.push(sentence);
  }

  if (matched.length === 0) return { value: null, confidence: 'low' };

  return {
    value: summarizeSentences(matched, 2),
    confidence: estimateConfidence(bestScore),
  };
}

function extractFees(lower: string): ExtractResult {
  const feePatterns = [
    /\b\d{1,2}%\s*(?:restocking|processing)?\s*fee\b/,
    /\b\d{1,2}\s*percent\s*(?:restocking|processing)?\s*fee\b/,
    /\$\s?\d+(?:\.\d{1,2})?\s*(?:return|restocking|label|processing)?\s*fee\b/,
    /\breturn\s+shipping\s+costs?\s+will\s+be\s+deducted\s+from\s+(?:your\s+)?refund\b/,
    /\boriginal\s+shipping\s+(?:fees?\s+)?(?:is|are)\s+non[- ]?refundable\b/,
    /\bshipping\s+fees?\s+are\s+not\s+refunded\b/,
  ];

  const noFeePatterns = [
    /\bno\s+restocking\s+fees?\b/,
    /\bno\s+return\s+fees?\b/,
    /\bfree\s+returns?\b/,
    /\bno\s+charge\b/,
    /\bfull\s+refund\b/,
  ];

  const feeHit = strongestMatch(lower, feePatterns);
  const noFeeHit = strongestMatch(lower, noFeePatterns);

  if (feeHit && noFeeHit) {
    const mixed = extractClause(lower, Math.min(feeHit.index, noFeeHit.index), 140);
    return { value: mixed, confidence: 'medium' };
  }

  if (feeHit) {
    return { value: extractClause(lower, feeHit.index, 90), confidence: estimateConfidence(feeHit.score + 2) };
  }

  if (noFeeHit) {
    return { value: extractClause(lower, noFeeHit.index, 80), confidence: 'medium' };
  }

  return { value: null, confidence: 'low' };
}

function extractReturnShipping(lower: string): ExtractResult {
  const freePatterns = [
    /\bfree\s+returns?\b/,
    /\bfree\s+return\s+shipping\b/,
    /\bprepaid\s+return\s+label\b/,
    /\bwe(?:\s+will|'ll)?\s+provide\s+(?:a\s+)?return\s+label\b/,
    /\bat\s+no\s+cost\s+to\s+you\b/,
  ];

  const sellerPatterns = [
    /\bwe\s+(?:pay|cover)\s+return\s+shipping\b/,
    /\bseller\s+pays\b/,
    /\bat\s+our\s+expense\b/,
  ];

  const customerPatterns = [
    /\bcustomer\s+pays\b/,
    /\bbuyer\s+pays\b/,
    /\byou\s+are\s+responsible\s+for\s+return\s+shipping\b/,
    /\breturn\s+shipping\s+is\s+your\s+responsibility\b/,
    /\bat\s+your\s+expense\b/,
  ];

  const freeHit = strongestMatch(lower, freePatterns);
  const sellerHit = strongestMatch(lower, sellerPatterns);
  const customerHit = strongestMatch(lower, customerPatterns);

  if ((freeHit || sellerHit) && customerHit) {
    const defectiveClause = strongestMatch(lower, [
      /\bif\s+(?:item|items)\s+(?:is|are)\s+(?:damaged|defective|incorrect)\b/,
      /\bfor\s+defective\s+items?\b/,
    ]);
    if (defectiveClause) {
      return {
        value: 'Customer pays (seller pays for defective/incorrect items)',
        confidence: 'high',
      };
    }
    return { value: 'Varies by item/reason', confidence: 'medium' };
  }

  if (freeHit) return { value: 'Free returns', confidence: estimateConfidence(freeHit.score + 2) };
  if (sellerHit) return { value: 'Seller pays', confidence: estimateConfidence(sellerHit.score + 2) };
  if (customerHit) return { value: 'Customer pays', confidence: estimateConfidence(customerHit.score + 2) };

  return { value: null, confidence: 'low' };
}

function extractExclusions(lower: string): ExtractResult {
  const strongExclusionPatterns = [
    /\bfinal\s+sale\b/,
    /\bcannot\s+be\s+returned\b/,
    /\bnot\s+eligible\s+for\s+return\b/,
    /\bnon[- ]?returnable\b/,
  ];

  const keywords = [
    'final sale',
    'clearance',
    'custom',
    'personalized',
    'sale items',
    'underwear',
    'swimwear',
    'intimate',
    'digital',
    'downloadable',
    'gift card',
    'earrings',
    'beauty products',
  ];

  const sentences = getSentences(lower);
  const matched: string[] = [];
  let bestScore = 0;
  let hasStrong = false;

  for (const sentence of sentences) {
    const hits = keywords.filter((kw) => sentence.includes(kw));
    const strong = strongExclusionPatterns.some((pattern) => pattern.test(sentence));
    if (hits.length === 0 && !strong) continue;

    const score = hits.length + (strong ? 3 : 0) + (sentenceHasAnchor(sentence) ? 1 : 0);
    bestScore = Math.max(bestScore, score);
    if (strong) hasStrong = true;
    matched.push(sentence);
  }

  if (matched.length === 0) return { value: null, confidence: 'low' };

  return {
    value: summarizeSentences(matched, 3),
    confidence: hasStrong ? 'high' : estimateConfidence(bestScore),
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
