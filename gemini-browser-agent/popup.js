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
    statusEl.textContent = 'Ready';
    statusEl.className = 'status status-idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    logEl.innerHTML = '<li class="empty-state">No actions executed yet.</li>';
    return;
  }
  const isRunning = state.status === 'running';
  const statusLabel = state.status.toUpperCase();
  statusEl.textContent = `${statusLabel} — Step ${state.iteration}${state.error ? ' — ' + state.error : ''}`;
  statusEl.className = `status status-${state.status.toLowerCase()}`;
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;

  logEl.innerHTML = '';
  const history = state.history || [];
  if (history.length === 0) {
    logEl.innerHTML = '<li class="empty-state">Starting task...</li>';
    return;
  }

  history.forEach((a) => {
    const li = document.createElement('li');
    if (a.action === 'look') {
      const faces = a.facesRedacted ?? 0;
      const texts = a.textRegionsRedacted ?? 0;
      li.textContent = `👁️ Looked at screen (${faces} face${faces === 1 ? '' : 's'}, ${texts} text region${texts === 1 ? '' : 's'} redacted)`;
    } else if (a.action === 'navigate') {
      li.textContent = `🌐 Navigate → ${a.url}`;
    } else if (a.action === 'click') {
      li.textContent = `🖱️ Click → ${a.target_id}`;
    } else if (a.action === 'type') {
      li.textContent = `⌨️ Type → ${a.target_id} = "${a.value}"`;
    } else if (a.action === 'press') {
      li.textContent = `⏎ Press → ${a.value}`;
    } else if (a.action === 'scroll') {
      li.textContent = `📜 Scroll ${a.direction}`;
    } else if (a.action === 'wait') {
      li.textContent = `⏳ Wait ${a.wait_ms || 1000}ms`;
    } else if (a.action === 'done') {
      li.textContent = `✅ Goal completed`;
      li.className = 'log-done';
    } else {
      li.textContent = `${a.action}${a.target_id ? ' → ' + a.target_id : ''}${a.value ? ' = "' + a.value + '"' : ''}`;
    }
    logEl.appendChild(li);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

startBtn.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  const task = taskEl.value.trim();
  if (!task) return;
  chrome.runtime.sendMessage({ type: 'START_TASK', tabId: activeTabId, task }, (res) => {
    if (!res?.ok) {
      statusEl.textContent = `Error: ${res?.error || 'could not start'}`;
      statusEl.className = 'status status-error';
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
