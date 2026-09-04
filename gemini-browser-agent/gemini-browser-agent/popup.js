const taskEl = document.getElementById('task');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const optionsLink = document.getElementById('optionsLink');
const m1Btn = document.getElementById('m1Btn');

let activeTabId = null;

const m2Btn = document.getElementById('m2Btn');

m1Btn?.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  m1Btn.disabled = true;
  m1Btn.textContent = 'Capturing...';
  chrome.runtime.sendMessage({ type: 'TRIGGER_M1', tabId: activeTabId }, (res) => {
    m1Btn.disabled = false;
    m1Btn.textContent = 'Capture M1';
    if (!res?.ok) {
      statusEl.textContent = `M1 Error: ${res?.error || 'Capture failed'}`;
    } else {
      const v = res.data?.viewport;
      statusEl.textContent = `M1 Viewport: ${v?.width}×${v?.height} (${v?.ratio || v?.aspectRatio}) — ${res.data?.latencyMs}ms`;
    }
  });
});

m2Btn?.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  m2Btn.disabled = true;
  m2Btn.textContent = 'Analyzing...';
  chrome.runtime.sendMessage({ type: 'TRIGGER_M2', tabId: activeTabId }, (res) => {
    m2Btn.disabled = false;
    m2Btn.textContent = 'Analyze M2';
    if (!res?.ok) {
      statusEl.textContent = `M2 Error: ${res?.error || 'Analysis failed'}`;
    } else {
      const c = res.data?.counts;
      statusEl.textContent = `M2 DOM: ${c?.total} elements (${c?.interactive} interactive, ${c?.visible} visible) — ${res.data?.latencyMs}ms`;
    }
  });
});

const m3Btn = document.getElementById('m3Btn');
m3Btn?.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  m3Btn.disabled = true;
  m3Btn.textContent = 'Vision...';
  chrome.runtime.sendMessage({ type: 'TRIGGER_M3', tabId: activeTabId }, (res) => {
    m3Btn.disabled = false;
    m3Btn.textContent = 'Analyze M3';
    if (!res?.ok) {
      statusEl.textContent = `M3 Error: ${res?.error || 'Vision analysis failed'}`;
    } else {
      const d = res.data;
      statusEl.textContent = `M3 Vision: ${d?.totalDetections || 0} regions (${d?.detector}) — ${d?.processingTimeMs}ms`;
    }
  });
});

// FIX: There was previously no manual M5 trigger anywhere that was guaranteed
// to target the right tab — the Debug Center's "Scan Now" button fires from
// localhost:5173, so it always operated on whatever tab was focused (often
// the Debug Center itself). The popup, by contrast, only ever opens on top
// of the tab you're currently looking at, so this button always scans the
// right page.
const m5Btn = document.getElementById('m5Btn');
m5Btn?.addEventListener('click', async () => {
  activeTabId = await getActiveTabId();
  if (activeTabId == null) return;
  m5Btn.disabled = true;
  m5Btn.textContent = 'Scanning...';
  chrome.runtime.sendMessage({ type: 'TRIGGER_M5', tabId: activeTabId }, (res) => {
    m5Btn.disabled = false;
    m5Btn.textContent = 'Scan M5';
    if (!res?.ok) {
      statusEl.textContent = `M5 Error: ${res?.error || 'Face/PII scan failed'}`;
    } else {
      const d = res.data;
      statusEl.textContent = `M5 Privacy: ${d?.facesDetected || 0} face(s) blurred across ${d?.regionsScanned || 0} region(s) — ${d?.latencyMs}ms`;
    }
  });
});

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
  statusEl.textContent = 'Initializing task & navigating if needed...';
  startBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'START_TASK', tabId: activeTabId, task }, (res) => {
    if (!res?.ok) {
      startBtn.disabled = false;
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