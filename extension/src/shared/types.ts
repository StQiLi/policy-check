/**
 * Shared type definitions for Return Clarity extension
 */

export interface DetectionResult {
  isShopify: boolean;
  confidence: number; // 0-100
  domain: string;
  indicators: {
    hasShopifyGlobal: boolean;
    hasMetaTags: boolean;
    hasCdnAssets: boolean;
    isMyshopifyDomain: boolean;
  };
}

export interface PolicyUrls {
  refundPolicy: string | null;
  refundPolicyCandidates?: string[];
  shippingPolicy: string | null;
  privacyPolicy: string | null;
  termsOfService: string | null;
}

export interface PolicyFields {
  returnWindow: string | null;
  conditionRequirements: string | null;
  fees: string | null;
  returnShipping: string | null;
  exclusions: string | null;
}

export interface PolicyConfidence {
  returnWindow: 'low' | 'medium' | 'high';
  conditionRequirements: 'low' | 'medium' | 'high';
  fees: 'low' | 'medium' | 'high';
  returnShipping: 'low' | 'medium' | 'high';
  exclusions: 'low' | 'medium' | 'high';
}

export interface PolicySummary {
  storeDomain: string;
  policyUrl: string;
  pageUrl?: string;
  extractedAt: string; // ISO timestamp
  fields: PolicyFields;
  confidence: PolicyConfidence;
  rawTextSnippet: string; // First 500 chars
}

export interface SnapshotStore {
  domain: string;
  name: string | null;
  platform: string;
}

export interface SnapshotRecord {
  id: number;
  store: SnapshotStore;
  policy_url: string;
  page_url: string | null;
  policy_type: string;
  summary: {
    fields: PolicyFields;
    confidence: PolicyConfidence;
  };
  extracted_at: string;
  created_at: string;
}

export interface SnapshotPagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
}

export interface SnapshotsIndexResponse {
  snapshots: SnapshotRecord[];
  pagination: SnapshotPagination;
}

export interface SnapshotPayload {
  storeDomain: string;
  policyUrl: string;
  policyType: string;
  summary: {
    fields: PolicyFields;
    confidence: PolicyConfidence;
  };
  rawTextSnippet: string;
  userAgent: string;
  extensionVersion: string;
}

export type ExtensionMessage =
  | { type: 'SHOPIFY_DETECTED'; data: DetectionResult }
  | { type: 'POLICY_EXTRACTED'; data: PolicySummary }
  | { type: 'POLICY_PAGE_FOUND'; policyUrl: string; rawHtml: string; domain: string }
  | { type: 'POLICY_NOT_FOUND'; domain: string }
  | { type: 'POLICY_URLS_RESOLVED'; data: PolicyUrls; domain: string }
  | { type: 'GET_TAB_STATE'; tabId: number }
  | { type: 'RUN_DETECTION'; tabId: number }
  | { type: 'SAVE_SNAPSHOT'; data: PolicySummary }
  | { type: 'ERROR'; error: string };

export interface TabState {
  detection: DetectionResult | null;
  summary: PolicySummary | null;
  status: 'idle' | 'detecting' | 'fetching' | 'extracting' | 'done' | 'error';
  fromCache: boolean;
  errorMessage?: string;
}
