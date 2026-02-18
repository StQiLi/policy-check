/**
 * Popup UI -- shows detection status and the 5-field policy summary
 * for the currently active tab.
 */

import { logger } from '../shared/logger';
import type { ExtensionMessage, TabState, DetectionResult, PolicySummary } from '../shared/types';

// ── DOM references ──────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusIndicator = $<HTMLDivElement>('status-indicator');
const detectionText = $<HTMLDivElement>('detection-text');
const confidenceText = $<HTMLDivElement>('confidence-text');
const returnWindowEl = $<HTMLElement>('return-window');
const conditionEl = $<HTMLElement>('condition');
const feesEl = $<HTMLElement>('fees');
const shippingEl = $<HTMLElement>('shipping');
const exclusionsEl = $<HTMLElement>('exclusions');
const saveSnapshotBtn = $<HTMLButtonElement>('save-snapshot');
const viewHistoryBtn = $<HTMLButtonElement>('view-history');
const errorMessageEl = $<HTMLDivElement>('error-message');

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

// ── Renderers ───────────────────────────────────────────────────

function renderState(state: TabState | null): void {
  if (!state) {
    renderNoDetection();
    return;
  }

  state.detection ? renderDetection(state.detection) : renderNoDetection();

  if (state.summary) {
    renderSummary(state.summary);
    saveSnapshotBtn.disabled = false;
  } else {
    renderNoSummary();
    saveSnapshotBtn.disabled = true;
  }
}

function renderDetection(detection: DetectionResult): void {
  if (detection.isShopify) {
    statusIndicator.classList.add('detected');
    detectionText.textContent = 'Shopify Store Detected';
    confidenceText.textContent = `Confidence: ${detection.confidence}%`;
  } else {
    statusIndicator.classList.add('not-detected');
    detectionText.textContent = 'Not a Shopify store';
    confidenceText.textContent = '';
  }
}

function renderNoDetection(): void {
  detectionText.textContent = 'No store detected';
  confidenceText.textContent = 'Visit a Shopify store to see return policy info';
  saveSnapshotBtn.disabled = true;
}

function renderSummary(summary: PolicySummary): void {
  const f = summary.fields;
  returnWindowEl.textContent = f.returnWindow ?? 'Not found';
  conditionEl.textContent = f.conditionRequirements ?? 'Not specified';
  feesEl.textContent = f.fees ?? 'Not specified';
  shippingEl.textContent = f.returnShipping ?? 'Not specified';
  exclusionsEl.textContent = f.exclusions ?? 'None specified';
}

function renderNoSummary(): void {
  const dash = '\u2014';
  returnWindowEl.textContent = dash;
  conditionEl.textContent = dash;
  feesEl.textContent = dash;
  shippingEl.textContent = dash;
  exclusionsEl.textContent = dash;
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
