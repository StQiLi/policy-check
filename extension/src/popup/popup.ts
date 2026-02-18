import { logger } from '../shared/logger';
import type { ExtensionMessage, TabState, DetectionResult, PolicySummary } from '../shared/types';

// ── DOM references ──────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusIndicator       = $<HTMLDivElement>('status-indicator');
const detectionText         = $<HTMLDivElement>('detection-text');
const confidenceValueEl     = $<HTMLSpanElement>('confidence-value');
const cacheBadgeEl          = $<HTMLSpanElement>('cache-badge');

const scanningStateEl       = $<HTMLElement>('scanning-state');
const notShopifyStateEl     = $<HTMLElement>('not-shopify-state');
const policyNotFoundStateEl = $<HTMLElement>('policy-not-found-state');
const notFoundDomainEl      = $<HTMLElement>('not-found-domain');
const detectionStatusSectionEl = $<HTMLElement>('detection-status-section');
const policySummarySectionEl   = $<HTMLElement>('policy-summary');

const returnWindowEl   = $<HTMLElement>('return-window');
const conditionEl      = $<HTMLElement>('condition');
const feesEl           = $<HTMLElement>('fees');
const shippingEl       = $<HTMLElement>('shipping');
const exclusionsEl     = $<HTMLElement>('exclusions');

const returnWindowConfidenceEl  = $<HTMLElement>('return-window-confidence');
const conditionConfidenceEl     = $<HTMLElement>('condition-confidence');
const feesConfidenceEl          = $<HTMLElement>('fees-confidence');
const shippingConfidenceEl      = $<HTMLElement>('shipping-confidence');
const exclusionsConfidenceEl    = $<HTMLElement>('exclusions-confidence');

const policyLinkEl     = $<HTMLAnchorElement>('policy-link');
const saveSnapshotBtn  = $<HTMLButtonElement>('save-snapshot');
const viewHistoryBtn   = $<HTMLButtonElement>('view-history');
const errorMessageEl   = $<HTMLDivElement>('error-message');

let currentState: TabState | null = null;

// ── Bootstrap ───────────────────────────────────────────────────

async function loadState(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError('No active tab found');
      return;
    }

    const message: ExtensionMessage = { type: 'GET_TAB_STATE', tabId: tab.id };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        logger.error('Failed to get tab state:', chrome.runtime.lastError);
        showError('Failed to load data');
        return;
      }
      currentState = response.state as TabState;
      renderState(currentState);
    });
  } catch (err) {
    logger.error('loadState failed:', err);
    showError('Failed to load data');
  }
}

// ── UI state ────────────────────────────────────────────────────

type UIState = 'scanning' | 'not-shopify' | 'policy-not-found' | 'results';

function showState(state: UIState): void {
  scanningStateEl.classList.add('hidden');
  notShopifyStateEl.classList.add('hidden');
  policyNotFoundStateEl.classList.add('hidden');
  detectionStatusSectionEl.classList.add('hidden');
  policySummarySectionEl.classList.add('hidden');
  policyLinkEl.classList.add('hidden');

  if (state === 'scanning') {
    scanningStateEl.classList.remove('hidden');
  } else if (state === 'not-shopify') {
    notShopifyStateEl.classList.remove('hidden');
  } else if (state === 'policy-not-found') {
    policyNotFoundStateEl.classList.remove('hidden');
  } else {
    detectionStatusSectionEl.classList.remove('hidden');
    policySummarySectionEl.classList.remove('hidden');
  }
}

// ── Renderers ───────────────────────────────────────────────────

function renderState(state: TabState | null): void {
  const status = (state as any)?.status ?? 'done';
  const fromCache = (state as any)?.fromCache ?? false;

  if (status === 'detecting' || status === 'fetching' || status === 'extracting') {
    showState('scanning');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (status === 'error') {
    showError((state as any)?.errorMessage ?? 'An error occurred');
    showState('not-shopify');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (!state || !state.detection || !state.detection.isShopify) {
    showState('not-shopify');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (!state.summary) {
    showState('policy-not-found');
    notFoundDomainEl.textContent = state.detection.domain;
    saveSnapshotBtn.disabled = true;
    return;
  }

  showState('results');
  renderDetection(state.detection);
  renderSummary(state.summary);
  saveSnapshotBtn.disabled = false;

  if (fromCache) {
    cacheBadgeEl.classList.remove('hidden');
  } else {
    cacheBadgeEl.classList.add('hidden');
  }
}

function renderDetection(detection: DetectionResult): void {
  statusIndicator.classList.remove('detected', 'not-detected');
  statusIndicator.classList.add('detected');
  detectionText.textContent = 'Shopify Store Detected';
  confidenceValueEl.textContent = `Confidence: ${detection.confidence}%`;
}

function setConfidenceDot(el: HTMLElement, level: 'low' | 'medium' | 'high'): void {
  el.setAttribute('data-level', level);
}

function renderSummary(summary: PolicySummary): void {
  const f = summary.fields;
  const c = summary.confidence;

  returnWindowEl.textContent = f.returnWindow ?? 'Not found';
  conditionEl.textContent    = f.conditionRequirements ?? 'Not specified';
  feesEl.textContent         = f.fees ?? 'Not specified';
  shippingEl.textContent     = f.returnShipping ?? 'Not specified';
  exclusionsEl.textContent   = f.exclusions ?? 'None specified';

  setConfidenceDot(returnWindowConfidenceEl,  c.returnWindow);
  setConfidenceDot(conditionConfidenceEl,     c.conditionRequirements);
  setConfidenceDot(feesConfidenceEl,          c.fees);
  setConfidenceDot(shippingConfidenceEl,      c.returnShipping);
  setConfidenceDot(exclusionsConfidenceEl,    c.exclusions);

  policyLinkEl.href = summary.policyUrl;
  policyLinkEl.classList.remove('hidden');
}

// ── Actions ─────────────────────────────────────────────────────

function handleSaveSnapshot(): void {
  if (!currentState?.summary) return;

  saveSnapshotBtn.disabled = true;
  saveSnapshotBtn.textContent = 'Saving\u2026';

  const message: ExtensionMessage = { type: 'SAVE_SNAPSHOT', data: currentState.summary };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showError(response?.error ?? 'Failed to save snapshot');
      saveSnapshotBtn.disabled = false;
      saveSnapshotBtn.textContent = 'Save Snapshot';
      return;
    }

    saveSnapshotBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSnapshotBtn.textContent = 'Save Snapshot';
      saveSnapshotBtn.disabled = false;
    }, 2000);
  });
}

function handleViewHistory(): void {
  // TODO: Open history page in a new tab or implement inline history view
  showError('History view coming in a future release');
}

// ── Utilities ───────────────────────────────────────────────────

function showError(message: string): void {
  errorMessageEl.textContent = message;
  errorMessageEl.classList.remove('hidden');
  setTimeout(() => errorMessageEl.classList.add('hidden'), 3000);
}

// ── Wire up ─────────────────────────────────────────────────────

saveSnapshotBtn.addEventListener('click', handleSaveSnapshot);
viewHistoryBtn.addEventListener('click', handleViewHistory);
loadState();
