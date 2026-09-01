const taskEl = document.getElementById('task');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const optionsLink = document.getElementById('optionsLink');

let activeTabId = null;

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function refreshStatus() {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: activeTabId }, (res) => {
    render(res?.status || null);
  });
}

function render(state) {
  if (!state) {
    statusEl.textContent = 'Idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    logEl.innerHTML = '';
    return;
  }
  statusEl.textContent = `${state.status} — step ${state.iteration}${state.error ? ' — ' + state.error : ''}`;
  startBtn.disabled = state.status === 'running';
  stopBtn.disabled = state.status !== 'running';

  logEl.innerHTML = '';
  (state.history || []).forEach((a, i) => {
    const li = document.createElement('li');
    li.textContent = `${a.action}${a.target_id ? ' → ' + a.target_id : ''}${a.value ? ' = "' + a.value + '"' : ''}`;
    logEl.appendChild(li);
  });
}

startBtn.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  const task = taskEl.value.trim();
  if (!task) return;
  chrome.runtime.sendMessage({ type: 'START_TASK', tabId: activeTabId, task }, (res) => {
    if (!res?.ok) {
      statusEl.textContent = `Error: ${res?.error || 'could not start'}`;
      return;
    }
    refreshStatus();
  });
});

stopBtn.addEventListener('click', () => {
  if (activeTabId == null) return;
  chrome.runtime.sendMessage({ type: 'STOP_TASK', tabId: activeTabId }, refreshStatus);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE' && msg.tabId === activeTabId) {
    render(msg.state);
  }
});

refreshStatus();
