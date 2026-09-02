import { GeminiClient } from './gemini-client.js';
import { captureViewportM1 } from './m1-capture.js';

const client = new GeminiClient();
const MAX_ITERATIONS = 25;
const STEP_DELAY_MS = 400;
const MAX_STEP_RETRIES = 3;

// Prevent duplicate loops running on the same tab in the same service worker instance
const activeLoops = new Set();

// --- Storage Wrappers ---
async function getTaskState(tabId) {
  const res = await chrome.storage.local.get(`task_${tabId}`);
  return res[`task_${tabId}`] || null;
}

async function setTaskState(tabId, state) {
  await chrome.storage.local.set({ [`task_${tabId}`]: state });
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; 
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'START_TASK':
      return startTask(msg.tabId, msg.task);
    case 'STOP_TASK':
      return stopTask(msg.tabId);
    case 'TRIGGER_M1': {
      let tabId = msg.tabId;
      if (!tabId) {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = activeTab?.id;
        } catch (_) {}
      }
      return captureViewportM1(tabId);
    }
    case 'GET_STATUS':
      return { ok: true, status: await getTaskState(msg.tabId) };
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

// --- Task Lifecycle ---
async function startTask(tabId, task) {
  if (!task || !task.trim()) return { ok: false, error: 'Task text is empty.' };

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

  const initialState = { task: task.trim(), history: [], memory: [], iteration: 0, stopped: false, status: 'running' };
  await setTaskState(tabId, initialState);
  
  runLoop(tabId); 
  return { ok: true };
}

async function stopTask(tabId) {
  const state = await getTaskState(tabId);
  if (state && state.status === 'running') {
    state.stopped = true;
    state.status = 'stopped';
    await setTaskState(tabId, state);
    await notifyPopup(tabId);
  }
  return { ok: true };
}

// --- The Core Loop (Auto-Resuming) ---
async function runLoop(tabId) {
  if (activeLoops.has(tabId)) return; 
  activeLoops.add(tabId);

  try {
    let state = await getTaskState(tabId);
    if (!state) return;

    while (!state.stopped && state.iteration < MAX_ITERATIONS && state.status === 'running') {
      state.iteration += 1;
      await setTaskState(tabId, state);

      // Milestone M1: Real Viewport / Screenshot Capture (local only, never sent to Gemini)
      try {
        await captureViewportM1(tabId, { iteration: state.iteration });
      } catch (m1Err) {
        console.warn('[M1 Capture] Non-fatal capture failure during loop:', m1Err);
      }

      let stepSucceeded = false;
      let lastErr = '';

      for (let attempt = 1; attempt <= MAX_STEP_RETRIES; attempt++) {
        try {
          let observation;
          try {
            observation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
          } catch (_obsErr) {
            await waitForTabLoad(tabId);
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await sleep(500);
            observation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
          }

          const action = await client.chooseNextAction(
            state.task,
            { ...observation, actionHistory: state.history, memory: state.memory }
          );

          if (action.memory) state.memory.push(action.memory);
          delete action.memory;
          state.history.push(action);
          
          await setTaskState(tabId, state);
          await notifyPopup(tabId);

          if (action.action === 'done') {
            state.status = 'done';
            await setTaskState(tabId, state);
            await notifyPopup(tabId);
            return;
          }

          await sendToContent(tabId, { type: 'EXECUTE_ACTION', action });
          stepSucceeded = true;
          break;
        } catch (err) {
          lastErr = messageOf(err);
          if (attempt < MAX_STEP_RETRIES) await sleep(1000);
        }
      }

      if (!stepSucceeded) {
        await fail(tabId, `Step ${state.iteration} failed after ${MAX_STEP_RETRIES} retries: ${lastErr}`);
        return;
      }
      
      await sleep(STEP_DELAY_MS);
      
      // Refresh state from storage in case the user clicked Stop during the sleep
      state = await getTaskState(tabId);
      if (!state) return;
    }

    if (!state.stopped && state.status === 'running') {
      state.status = 'max_iterations';
      await setTaskState(tabId, state);
      await notifyPopup(tabId);
    }
  } finally {
    activeLoops.delete(tabId);
  }
}

// --- Auto-Resume Hooks ---

// 1. Wake up loop if the browser navigates to a new page
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Ignore iframe loads
  const tabId = details.tabId;
  const state = await getTaskState(tabId);
  
  if (state && state.status === 'running' && !state.stopped) {
    await sleep(500);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch(e) {
      console.warn("Auto-reinject skipped/failed:", e);
    }
    if (!activeLoops.has(tabId)) runLoop(tabId);
  }
});

// 2. Wake up loop if the Service Worker restarts
chrome.runtime.onStartup.addListener(resumeAllActiveTasks);
chrome.runtime.onInstalled.addListener(resumeAllActiveTasks);

async function resumeAllActiveTasks() {
  const all = await chrome.storage.local.get(null);
  for (const [key, state] of Object.entries(all)) {
    if (key.startsWith('task_') && state.status === 'running' && !state.stopped) {
      const tabId = parseInt(key.replace('task_', ''), 10);
      if (!activeLoops.has(tabId)) runLoop(tabId);
    }
  }
}

// --- Utilities ---
async function waitForTabLoad(tabId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch(e) { return; } // Tab closed
    await sleep(500);
  }
}

async function fail(tabId, error) {
  const state = await getTaskState(tabId);
  if (!state) return;
  state.status = 'error';
  state.error = error;
  await setTaskState(tabId, state);
  await notifyPopup(tabId);
}

function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.ok === false) {
        reject(new Error(response?.error || 'No response from content script'));
        return;
      }
      resolve(response.data);
    });
  });
}

async function notifyPopup(tabId) {
  const state = await getTaskState(tabId);
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', tabId, state }).catch(() => {});
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}