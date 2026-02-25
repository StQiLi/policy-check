const AUTH_TOKEN_KEY = 'authToken';

const authInput = document.getElementById('auth-token') as HTMLInputElement;
const saveBtn = document.getElementById('save-options') as HTMLButtonElement;
const statusEl = document.getElementById('options-status') as HTMLParagraphElement;

function showStatus(message: string, type: 'success' | 'error'): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add(type);
  statusEl.setAttribute('aria-live', 'polite');
}

function hideStatus(): void {
  if (!statusEl) return;
  statusEl.classList.add('hidden');
}

async function loadStored(): Promise<void> {
  const { authToken } = await chrome.storage.sync.get(AUTH_TOKEN_KEY);
  const value = typeof authToken === 'string' ? authToken : '';
  if (authInput) authInput.value = value;
}

async function saveOptions(): Promise<void> {
  if (!authInput || !saveBtn) return;
  const token = authInput.value.trim();
  saveBtn.disabled = true;
  hideStatus();

  try {
    await chrome.storage.sync.set({ [AUTH_TOKEN_KEY]: token });
    showStatus(token ? 'Token saved. You can save snapshots and view history.' : 'Token cleared.', 'success');
  } catch (e) {
    showStatus('Failed to save. Try again.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn?.addEventListener('click', saveOptions);
loadStored();
