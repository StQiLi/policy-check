import type { ExtensionMessage, TabState, DetectionResult, PolicySummary } from '../shared/types';

// ── DOM references ──────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusIndicator       = $<HTMLDivElement>('status-indicator');
const detectionText         = $<HTMLDivElement>('detection-text');
const confidenceValueEl     = $<HTMLSpanElement>('confidence-value');
const cacheBadgeEl          = $<HTMLSpanElement>('cache-badge');

const popupRoot             = $<HTMLElement>('popup-root');
const notFoundDomainEl      = $<HTMLElement>('not-found-domain');
const detectionDebugEl      = $<HTMLElement>('detection-debug');
const noDetectionActionsEl = $<HTMLElement>('no-detection-actions');
const runDetectionBtn      = $<HTMLButtonElement>('run-detection-btn');

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
const scanningMessageEl = $<HTMLParagraphElement>('scanning-message');

let currentState: TabState | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

const POLL_MS = 400;
const POLL_TIMEOUT_MS = 15000;

function isPendingStatus(status: TabState['status']): boolean {
  return status === 'detecting' || status === 'fetching' || status === 'extracting';
}

/** Poll tab state until we have a final status (done/error) or timeout. */
function pollForTabState(tabId: number): void {
  if (pollIntervalId) clearInterval(pollIntervalId);
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  pollIntervalId = setInterval(() => {
    if (Date.now() > deadline) {
      if (pollIntervalId) clearInterval(pollIntervalId);
      pollIntervalId = null;
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'GET_TAB_STATE', tabId } as ExtensionMessage,
      (response: { state?: TabState }) => {
        if (chrome.runtime.lastError) return;
        const state = response?.state ?? null;
        const status = (state as TabState | null)?.status ?? 'done';
        if (isPendingStatus(status)) {
          setScanningMessage(status as 'detecting' | 'fetching' | 'extracting');
        } else {
          if (pollIntervalId) clearInterval(pollIntervalId);
          pollIntervalId = null;
          currentState = state;
          renderState(currentState);
        }
      },
    );
  }, POLL_MS);
}

/** Run detection on the active tab and render the result. Used on popup open and by "Run detection" button. */
function runDetection(callback?: () => void): void {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      showError('No active tab found');
      showState('not-shopify');
      renderDetectionDebug(null);
      callback?.();
      return;
    }
    setScanningMessage('detecting');
    showState('scanning');
    chrome.runtime.sendMessage(
      { type: 'RUN_DETECTION', tabId: tab.id } as ExtensionMessage,
      (response: { state?: TabState; injectError?: string }) => {
        if (chrome.runtime.lastError) {
          showError('Detection failed. Reload the store page and try again.');
          showState('not-shopify');
          renderDetectionDebug(null);
          callback?.();
          return;
        }
        currentState = response?.state ?? null;
        if (response?.injectError) showError(response.injectError);
        renderState(currentState);
        if (tab.id && currentState && isPendingStatus((currentState as TabState).status)) {
          pollForTabState(tab.id);
        }
        callback?.();
      },
    );
  });
}

// ── UI state ────────────────────────────────────────────────────

type UIState = 'scanning' | 'not-shopify' | 'policy-not-found' | 'results';

function showState(state: UIState): void {
  popupRoot?.setAttribute('data-state', state);
}

function setScanningMessage(status: 'detecting' | 'fetching' | 'extracting'): void {
  if (!scanningMessageEl) return;
  scanningMessageEl.textContent =
    status === 'detecting' ? 'Detecting store...' : 'Analyzing policy...';
}

function renderDetectionDebug(detection: DetectionResult | null): void {
  if (!detectionDebugEl) return;
  if (noDetectionActionsEl) noDetectionActionsEl.classList.add('hidden');
  if (!detection) {
    detectionDebugEl.textContent = 'Reload the store page or use Run detection now.';
    detectionDebugEl.classList.remove('hidden');
    noDetectionActionsEl?.classList.remove('hidden');
    return;
  }
  detectionDebugEl.textContent = '';
  detectionDebugEl.classList.add('hidden');
}

// ── Renderers ───────────────────────────────────────────────────

function renderState(state: TabState | null): void {
  const status = (state as any)?.status ?? 'done';
  const fromCache = (state as any)?.fromCache ?? false;

  if (status === 'detecting' || status === 'fetching' || status === 'extracting') {
    setScanningMessage(status);
    showState('scanning');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (status === 'error') {
    showError(state?.errorMessage ?? 'An error occurred');
    showState('not-shopify');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (!state || !state.detection || !state.detection.isShopify) {
    showState('not-shopify');
    renderDetectionDebug(state?.detection ?? null);
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
runDetectionBtn?.addEventListener('click', handleRunDetection);

showState('scanning');
runDetection();

function handleRunDetection(): void {
  runDetection();
}
