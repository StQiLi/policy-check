import type {
  PolicyFields,
  SnapshotRecord,
  SnapshotsIndexResponse,
} from '../shared/types';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const PAGE_SIZE = 20;
const VIEW_MODE_KEY = 'snapshotHubViewMode';

type HubState = 'loading' | 'error' | 'empty' | 'ready';
type ExpirationStatus = 'active' | 'expiring' | 'expired';
type SortKey = 'newest' | 'oldest' | 'window' | 'store';
type ViewMode = 'grid' | 'list';
type Sentiment = 'positive' | 'warning' | 'neutral';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};

const rootEl = $<HTMLElement>('hub-root');
const snapshotCountEl = $<HTMLParagraphElement>('snapshot-count');
const storeFilterEl = $<HTMLInputElement>('store-filter');
const statusFilterEl = $<HTMLSelectElement>('status-filter');
const policyTypeFilterEl = $<HTMLSelectElement>('policy-type-filter');
const sortFilterEl = $<HTMLSelectElement>('sort-filter');
const gridToggleBtn = $<HTMLButtonElement>('view-grid');
const listToggleBtn = $<HTMLButtonElement>('view-list');
const errorTextEl = $<HTMLParagraphElement>('error-text');
const retryBtn = $<HTMLButtonElement>('retry-btn');
const noMatchesEl = $<HTMLParagraphElement>('no-matches');
const snapshotGridEl = $<HTMLDivElement>('snapshot-grid');
const loadMoreBtn = $<HTMLButtonElement>('load-more-btn');

let authToken = '';
let loadedSnapshots: SnapshotRecord[] = [];
let currentPage = 0;
let totalPages = 0;
let totalCount = 0;
let isLoadingMore = false;
let viewMode: ViewMode = 'grid';

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function runWithViewTransition(update: () => void): void {
  const transitionApi = (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition;
  if (typeof transitionApi === 'function') {
    transitionApi.call(document, update);
    return;
  }
  update();
}

function setState(state: HubState): void {
  rootEl.setAttribute('data-state', state);
}

function setViewMode(nextMode: ViewMode): void {
  viewMode = nextMode;
  runWithViewTransition(() => {
    rootEl.setAttribute('data-view', nextMode);
    gridToggleBtn.setAttribute('aria-pressed', String(nextMode === 'grid'));
    listToggleBtn.setAttribute('aria-pressed', String(nextMode === 'list'));
  });
  void chrome.storage.local.set({ [VIEW_MODE_KEY]: nextMode });
}

function getExpirationStatus(extractedAt: string): ExpirationStatus {
  const extractedAtMs = new Date(extractedAt).getTime();
  if (!Number.isFinite(extractedAtMs)) return 'expired';

  const days = (Date.now() - extractedAtMs) / (1000 * 60 * 60 * 24);
  if (days > 30) return 'expired';
  if (days > 14) return 'expiring';
  return 'active';
}

function formatExpirationLabel(status: ExpirationStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'expiring') return 'Expiring Soon';
  return 'Expired';
}

function formatAbsoluteDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return 'Unknown';

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  if (absMs < 60_000) return 'just now';
  if (absMs < 3_600_000) return relativeFormatter.format(Math.round(diffMs / 60_000), 'minute');
  if (absMs < 86_400_000) return relativeFormatter.format(Math.round(diffMs / 3_600_000), 'hour');
  return relativeFormatter.format(Math.round(diffMs / 86_400_000), 'day');
}

function toStoreUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function toSafeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseReturnWindowDays(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.toLowerCase().match(/(\d{1,3})\s*(business\s*)?days?/);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) ? days : null;
}

function classifySentiment(label: keyof PolicyFields, value: string | null): Sentiment {
  if (!value) return 'neutral';
  const normalized = value.toLowerCase();
  if (normalized.includes('not specified') || normalized.includes('not found')) return 'neutral';

  if (label === 'returnWindow') {
    const days = parseReturnWindowDays(value);
    if (days !== null && days <= 14) return 'warning';
    if (days !== null && days >= 30) return 'positive';
    if (/(final sale|no returns)/.test(normalized)) return 'warning';
    return 'neutral';
  }

  if (/(free|none specified|no restocking fee|no fee|seller pays)/.test(normalized)) return 'positive';
  if (/(customer pays|buyer pays|restocking fee|final sale|non-returnable|fee)/.test(normalized)) return 'warning';
  return 'neutral';
}

function iconForField(label: keyof PolicyFields): string {
  if (label === 'returnWindow') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4m0 0a7 7 0 1 1-7 7"/></svg>';
  if (label === 'conditionRequirements') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5 12 4l8 5.5v7L12 22l-8-5.5v-7Z"/></svg>';
  if (label === 'fees') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v5c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V7l-8-4Zm0 5v8"/></svg>';
  if (label === 'returnShipping') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v7H3V7Zm11 2h4l3 3v2h-7V9Zm2 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM7 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M6 6a8 8 0 0 1 11 11"/></svg>';
}

function createField(label: string, fieldKey: keyof PolicyFields, value: string | null): HTMLElement {
  const text = value ?? (fieldKey === 'exclusions' ? 'None specified' : 'Not specified');
  const sentiment = classifySentiment(fieldKey, text);

  const fieldEl = document.createElement('div');
  fieldEl.className = 'field';

  const headEl = document.createElement('div');
  headEl.className = 'field-head';
  headEl.innerHTML = `${iconForField(fieldKey)}<span>${label}</span>`;

  const pillEl = document.createElement('span');
  pillEl.className =
    sentiment === 'positive' ? 'pill pill--positive' : sentiment === 'warning' ? 'pill pill--warning' : 'pill pill--neutral';
  pillEl.textContent = text;
  pillEl.title = text;

  fieldEl.append(headEl, pillEl);
  return fieldEl;
}

function createSnapshotCard(snapshot: SnapshotRecord, index: number): HTMLElement {
  const card = document.createElement('article');
  card.className = 'snapshot-card';
  card.style.animationDelay = `${Math.min(index * 28, 220)}ms`;

  const status = getExpirationStatus(snapshot.extracted_at);
  const fields = snapshot.summary?.fields ?? {
    returnWindow: null,
    conditionRequirements: null,
    fees: null,
    returnShipping: null,
    exclusions: null,
  };

  const head = document.createElement('div');
  head.className = 'snapshot-head';

  const storeLink = document.createElement('a');
  storeLink.className = 'snapshot-store';
  storeLink.href = toStoreUrl(snapshot.store.domain);
  storeLink.target = '_blank';
  storeLink.rel = 'noopener noreferrer';
  storeLink.textContent = snapshot.store.name || snapshot.store.domain;

  const badge = document.createElement('span');
  badge.className = `pill expiration-badge ${status}`;
  badge.textContent = formatExpirationLabel(status);

  head.append(storeLink, badge);

  const links = document.createElement('div');
  links.className = 'snapshot-links';

  const policyUrl = toSafeHttpUrl(snapshot.policy_url);
  if (policyUrl) {
    const link = document.createElement('a');
    link.href = policyUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Policy source';
    links.append(link);
  }

  const pageUrl = toSafeHttpUrl(snapshot.page_url);
  if (pageUrl) {
    const link = document.createElement('a');
    link.href = pageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Saved page';
    links.append(link);
  }

  const meta = document.createElement('div');
  meta.className = 'snapshot-meta muted';

  const savedAt = document.createElement('span');
  savedAt.textContent = `Saved ${formatRelativeDate(snapshot.extracted_at)}`;
  savedAt.title = formatAbsoluteDate(snapshot.extracted_at);

  const policyType = document.createElement('span');
  policyType.textContent = `Policy type: ${snapshot.policy_type}`;

  meta.append(savedAt, policyType);

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'snapshot-fields';
  fieldGrid.append(
    createField('Return Window', 'returnWindow', fields.returnWindow),
    createField('Condition', 'conditionRequirements', fields.conditionRequirements),
    createField('Fees', 'fees', fields.fees),
    createField('Shipping', 'returnShipping', fields.returnShipping),
    createField('Exclusions', 'exclusions', fields.exclusions),
  );

  card.append(head, links, meta, fieldGrid);
  return card;
}

function setLoadMoreState(visible: boolean): void {
  loadMoreBtn.hidden = !visible;
  loadMoreBtn.disabled = isLoadingMore;
  loadMoreBtn.textContent = isLoadingMore ? 'Loading...' : 'Load more';
}

function applyFiltersAndRender(): void {
  const storeFilter = storeFilterEl.value.trim().toLowerCase();
  const statusFilter = statusFilterEl.value as 'all' | ExpirationStatus;
  const policyTypeFilter = policyTypeFilterEl.value;
  const sortBy = sortFilterEl.value as SortKey;

  const filtered = loadedSnapshots.filter((snapshot) => {
    const matchesStore =
      !storeFilter ||
      snapshot.store.domain.toLowerCase().includes(storeFilter) ||
      (snapshot.store.name ?? '').toLowerCase().includes(storeFilter);

    const matchesStatus =
      statusFilter === 'all' || getExpirationStatus(snapshot.extracted_at) === statusFilter;

    const matchesPolicyType =
      policyTypeFilter === 'all' || snapshot.policy_type.toLowerCase() === policyTypeFilter;

    return matchesStore && matchesStatus && matchesPolicyType;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'store') return a.store.domain.localeCompare(b.store.domain);

    if (sortBy === 'window') {
      const aWindow = parseReturnWindowDays(a.summary?.fields.returnWindow ?? null) ?? -1;
      const bWindow = parseReturnWindowDays(b.summary?.fields.returnWindow ?? null) ?? -1;
      if (aWindow !== bWindow) return bWindow - aWindow;
      return new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime();
    }

    const aTime = new Date(a.extracted_at).getTime();
    const bTime = new Date(b.extracted_at).getTime();
    return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
  });

  runWithViewTransition(() => {
    snapshotGridEl.replaceChildren(...filtered.map((snapshot, index) => createSnapshotCard(snapshot, index)));
    noMatchesEl.classList.toggle('hidden', filtered.length > 0 || loadedSnapshots.length === 0);
  });

  snapshotCountEl.textContent = `${filtered.length} shown - ${loadedSnapshots.length}/${totalCount || loadedSnapshots.length} loaded`;
  setLoadMoreState(currentPage < totalPages);
}

async function fetchSnapshotPage(page: number): Promise<SnapshotsIndexResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) });
  const response = await fetch(`${API_BASE_URL}/snapshots?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } }).error?.message ||
      `Failed to load snapshots (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as SnapshotsIndexResponse;
}

async function ensureAuthToken(): Promise<void> {
  const { authToken: rawToken } = await chrome.storage.sync.get('authToken');
  authToken = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!authToken) {
    throw new Error('No auth token. Open extension Options and add your API token.');
  }
}

async function hydrateViewMode(): Promise<void> {
  const stored = await chrome.storage.local.get(VIEW_MODE_KEY);
  const candidate = stored[VIEW_MODE_KEY];
  if (candidate === 'grid' || candidate === 'list') {
    viewMode = candidate;
  }
  setViewMode(viewMode);
}

async function loadInitialSnapshots(): Promise<void> {
  setState('loading');
  loadedSnapshots = [];
  currentPage = 0;
  totalPages = 0;
  totalCount = 0;

  try {
    await ensureAuthToken();
    const result = await fetchSnapshotPage(1);

    loadedSnapshots = result.snapshots;
    currentPage = result.pagination.current_page;
    totalPages = result.pagination.total_pages;
    totalCount = result.pagination.total_count;

    if (loadedSnapshots.length === 0) {
      setState('empty');
      snapshotCountEl.textContent = '0 snapshots';
      return;
    }

    setState('ready');
    applyFiltersAndRender();
  } catch (error) {
    errorTextEl.textContent = error instanceof Error ? error.message : 'Unable to load snapshots.';
    snapshotCountEl.textContent = 'Unable to load snapshots';
    setState('error');
  }
}

async function loadMoreSnapshots(): Promise<void> {
  if (isLoadingMore || currentPage >= totalPages) return;

  isLoadingMore = true;
  setLoadMoreState(true);

  try {
    const nextPage = currentPage + 1;
    const result = await fetchSnapshotPage(nextPage);

    loadedSnapshots = [...loadedSnapshots, ...result.snapshots];
    currentPage = result.pagination.current_page;
    totalPages = result.pagination.total_pages;
    totalCount = result.pagination.total_count;

    applyFiltersAndRender();
  } catch (error) {
    errorTextEl.textContent = error instanceof Error ? error.message : 'Failed to load more snapshots.';
    setState('error');
  } finally {
    isLoadingMore = false;
    if (rootEl.getAttribute('data-state') === 'ready') {
      setLoadMoreState(currentPage < totalPages);
    }
  }
}

retryBtn.addEventListener('click', () => {
  void loadInitialSnapshots();
});

loadMoreBtn.addEventListener('click', () => {
  void loadMoreSnapshots();
});

storeFilterEl.addEventListener('input', applyFiltersAndRender);
statusFilterEl.addEventListener('change', applyFiltersAndRender);
policyTypeFilterEl.addEventListener('change', applyFiltersAndRender);
sortFilterEl.addEventListener('change', applyFiltersAndRender);

gridToggleBtn.addEventListener('click', () => setViewMode('grid'));
listToggleBtn.addEventListener('click', () => setViewMode('list'));

void hydrateViewMode().then(() => loadInitialSnapshots());
