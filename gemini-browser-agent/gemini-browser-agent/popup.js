const taskEl = document.getElementById('task');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const optionsLink = document.getElementById('optionsLink');
const m1Btn = document.getElementById('m1Btn');
const commentarySection = document.getElementById('commentary-section');
const agentCommentaryEl = document.getElementById('agent-commentary');

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
    commentarySection.style.display = 'none';
    agentCommentaryEl.textContent = 'Waiting for analysis...';
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
  
  // Show agent commentary when task is done
  if (state.status === 'done' && state.agentCommentary) {
    commentarySection.style.display = 'block';
    agentCommentaryEl.textContent = state.agentCommentary;
  } else if (state.status === 'error' || state.status === 'max_iterations') {
    commentarySection.style.display = 'block';
    agentCommentaryEl.textContent = `⚠️ Task ended early: ${state.error || 'Max iterations reached'}. The agent got stuck or the task may be impossible.`;
  } else {
    commentarySection.style.display = 'none';
  }
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
