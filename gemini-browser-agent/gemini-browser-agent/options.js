const brandLogo = document.getElementById('brandLogo');
brandLogo?.addEventListener('error', () => {
  brandLogo.style.display = 'none';
  const fallback = document.querySelector('.brand-logo-fallback');
  if (fallback) fallback.style.display = 'block';
});
const keysEl = document.getElementById('keys');
const saveBtn = document.getElementById('saveBtn');
const savedMsg = document.getElementById('savedMsg');

async function load() {
  const { geminiApiKeys } = await chrome.storage.local.get(['geminiApiKeys']);
  keysEl.value = (geminiApiKeys || []).join('\n');
}

saveBtn.addEventListener('click', async () => {
  const keys = keysEl.value
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);
  await chrome.storage.local.set({ geminiApiKeys: keys, geminiKeyIndex: 0 });
  savedMsg.textContent = `Saved ${keys.length} key(s).`;
  setTimeout(() => (savedMsg.textContent = ''), 2500);
});

load();

