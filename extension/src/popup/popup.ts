import type { ExtensionMessage, TabState, DetectionResult, PolicySummary } from '../shared/types';

type UIState = 'scanning' | 'not-shopify' | 'policy-not-found' | 'results';
type Sentiment = 'positive' | 'warning' | 'neutral';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};

const popupRoot = $<HTMLElement>('popup-root');
const statusBar = $<HTMLElement>('detection-status-section');
const detectionText = $<HTMLElement>('detection-text');
const detectionDomain = $<HTMLElement>('detection-domain');
const confidenceValueEl = $<HTMLSpanElement>('confidence-value');
const cacheBadgeEl = $<HTMLSpanElement>('cache-badge');

const scanningMessageEl = $<HTMLParagraphElement>('scanning-message');
const notFoundDomainEl = $<HTMLElement>('not-found-domain');
const detectionDebugEl = $<HTMLElement>('detection-debug');
const noDetectionActionsEl = $<HTMLElement>('no-detection-actions');

const returnWindowEl = $<HTMLSpanElement>('return-window');
const conditionEl = $<HTMLSpanElement>('condition');
const feesEl = $<HTMLSpanElement>('fees');
const shippingEl = $<HTMLSpanElement>('shipping');
const exclusionsEl = $<HTMLSpanElement>('exclusions');

const policyLinkEl = $<HTMLAnchorElement>('policy-link');
const saveSnapshotBtn = $<HTMLButtonElement>('save-snapshot');
const viewHistoryBtn = $<HTMLButtonElement>('view-history');
const openOptionsEl = $<HTMLAnchorElement>('open-options');
const runDetectionBtn = $<HTMLButtonElement>('run-detection-btn');
const errorMessageEl = $<HTMLDivElement>('error-message');

let currentState: TabState | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

const POLL_MS = 400;
const POLL_TIMEOUT_MS = 15000;

function runWithViewTransition(update: () => void): void {
  const transitionApi = (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition;
  if (typeof transitionApi === 'function') {
    transitionApi.call(document, update);
    return;
  }
  update();
}

function isPendingStatus(status: TabState['status']): boolean {
  return status === 'detecting' || status === 'fetching' || status === 'extracting';
}

function showState(state: UIState): void {
  runWithViewTransition(() => {
    popupRoot.setAttribute('data-state', state);
  });
}

function setScanningMessage(status: 'detecting' | 'fetching' | 'extracting'): void {
  scanningMessageEl.textContent = status === 'detecting' ? 'Detecting store...' : 'Analyzing policy...';
}

function renderDetectionDebug(detection: DetectionResult | null): void {
  noDetectionActionsEl.classList.add('hidden');

  if (!detection) {
    detectionDebugEl.textContent = 'Reload the store page or run detection manually.';
    detectionDebugEl.classList.remove('hidden');
    noDetectionActionsEl.classList.remove('hidden');
    return;
  }

  detectionDebugEl.textContent = '';
  detectionDebugEl.classList.add('hidden');
}

function classifyReturnWindow(value: string): Sentiment {
  const normalized = value.toLowerCase();
  if (normalized.includes('final sale') || normalized.includes('no returns')) return 'warning';

  const dayMatch = normalized.match(/(\d{1,3})\s*(business\s*)?days?/);
  const days = dayMatch ? Number(dayMatch[1]) : null;
  if (days !== null && Number.isFinite(days)) {
    if (days <= 14) return 'warning';
    if (days >= 30) return 'positive';
  }

  return 'neutral';
}

function classifyGeneric(value: string): Sentiment {
  const normalized = value.toLowerCase();
  if (normalized.includes('not specified') || normalized.includes('not found')) return 'neutral';
  if (/(free|none specified|no restocking fee|no fee|seller pays)/.test(normalized)) return 'positive';
  if (/(customer pays|buyer pays|restocking fee|final sale|non-returnable|fee)/.test(normalized)) return 'warning';
  return 'neutral';
}

function applyPillSentiment(el: HTMLElement, sentiment: Sentiment): void {
  el.classList.remove('pill--positive', 'pill--warning', 'pill--neutral');
  el.classList.add(
    sentiment === 'positive'
      ? 'pill--positive'
      : sentiment === 'warning'
        ? 'pill--warning'
        : 'pill--neutral',
  );
  el.setAttribute('data-sentiment', sentiment);
}

function setPillValue(el: HTMLSpanElement, text: string, sentiment: Sentiment): void {
  el.textContent = text;
  el.title = text;
  applyPillSentiment(el, sentiment);
}

function renderDetection(detection: DetectionResult): void {
  statusBar.setAttribute('data-detected', detection.isShopify ? 'true' : 'false');
  detectionText.textContent = detection.isShopify ? 'Shopify Store Detected' : 'Store Detection Failed';
  detectionDomain.textContent = detection.domain;
  confidenceValueEl.textContent = `${detection.confidence}%`;
}

function renderSummary(summary: PolicySummary): void {
  const fields = summary.fields;
  const returnWindow = fields.returnWindow ?? 'Not found';
  const condition = fields.conditionRequirements ?? 'Not specified';
  const fees = fields.fees ?? 'Not specified';
  const shipping = fields.returnShipping ?? 'Not specified';
  const exclusions = fields.exclusions ?? 'None specified';

  setPillValue(returnWindowEl, returnWindow, classifyReturnWindow(returnWindow));
  setPillValue(conditionEl, condition, classifyGeneric(condition));
  setPillValue(feesEl, fees, classifyGeneric(fees));
  setPillValue(shippingEl, shipping, classifyGeneric(shipping));
  setPillValue(exclusionsEl, exclusions, classifyGeneric(exclusions));

  policyLinkEl.href = summary.policyUrl;
  policyLinkEl.classList.remove('hidden');
}

function renderState(state: TabState | null): void {
  const status = state?.status ?? 'done';
  const fromCache = state?.fromCache ?? false;

  if (isPendingStatus(status)) {
    setScanningMessage(status as 'detecting' | 'fetching' | 'extracting');
    showState('scanning');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (status === 'error') {
    showError(state?.errorMessage ?? 'An error occurred.');
    showState('not-shopify');
    saveSnapshotBtn.disabled = true;
    return;
  }

  if (!state?.detection?.isShopify) {
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
  cacheBadgeEl.classList.toggle('hidden', !fromCache);
}

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
        if (state && isPendingStatus(state.status)) {
          setScanningMessage(state.status as 'detecting' | 'fetching' | 'extracting');
          return;
        }

        if (pollIntervalId) clearInterval(pollIntervalId);
        pollIntervalId = null;
        currentState = state;
        renderState(currentState);
      },
    );
  }, POLL_MS);
}

function runDetection(callback?: () => void): void {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      showError('No active tab found.');
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

        if (tab.id && currentState && isPendingStatus(currentState.status)) {
          pollForTabState(tab.id);
        }

        callback?.();
      },
    );
  });
}

function isHttpUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function sendSaveSnapshot(summary: PolicySummary): void {
  const message: ExtensionMessage = { type: 'SAVE_SNAPSHOT', data: summary };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      const raw = response?.error ?? 'Failed to save snapshot';
      const isAuth = /auth|token|401|unauthorized/i.test(raw);
      showError(
        isAuth ? `${raw} Open extension Options (right-click icon) to set your token.` : raw,
      );
      saveSnapshotBtn.disabled = false;
      saveSnapshotBtn.classList.remove('btn--saving', 'btn--saved');
      saveSnapshotBtn.textContent = 'Save Snapshot';
      return;
    }

    saveSnapshotBtn.classList.remove('btn--saving');
    saveSnapshotBtn.classList.add('btn--saved');
    saveSnapshotBtn.textContent = 'Saved!';

    window.setTimeout(() => {
      saveSnapshotBtn.classList.remove('btn--saved');
      saveSnapshotBtn.textContent = 'Save Snapshot';
      saveSnapshotBtn.disabled = false;
    }, 2000);
  });
}

function handleSaveSnapshot(): void {
  if (!currentState?.summary) return;

  saveSnapshotBtn.disabled = true;
  saveSnapshotBtn.textContent = 'Saving...';
  saveSnapshotBtn.classList.add('btn--saving');

  const baseSummary = currentState.summary;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (chrome.runtime.lastError) {
      sendSaveSnapshot(baseSummary);
      return;
    }

    const summary = isHttpUrl(tab?.url) ? { ...baseSummary, pageUrl: tab.url } : baseSummary;
    sendSaveSnapshot(summary);
  });
}

function handleViewHistory(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/hub/index.html') }, () => {
    if (chrome.runtime.lastError) {
      showError('Failed to open history page.');
    }
  });
}

function handleOpenOptions(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') });
}

function showError(message: string): void {
  errorMessageEl.textContent = message;
  errorMessageEl.classList.remove('hidden');
  window.setTimeout(() => errorMessageEl.classList.add('hidden'), 3200);
}

saveSnapshotBtn.addEventListener('click', handleSaveSnapshot);
viewHistoryBtn.addEventListener('click', handleViewHistory);
openOptionsEl.addEventListener('click', (event) => {
  event.preventDefault();
  handleOpenOptions();
});
runDetectionBtn.addEventListener('click', () => runDetection());

showState('scanning');
runDetection();
