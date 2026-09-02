import { GeminiClient } from './gemini-client.js';

const client = new GeminiClient();

// Prevent duplicate loops running on the same tab in the same service worker instance
const activeLoops = new Set();
// In-memory buffer for redacted screenshots (tabId -> base64 dataUrl) to avoid storage quota bloat
const pendingScreenshots = new Map();
let lastCaptureTime = 0;

// --- Config Wrapper ---
async function getAgentConfig() {
  const { maxIterations, stepDelayMs, maxStepRetries } = await chrome.storage.local.get([
    'maxIterations',
    'stepDelayMs',
    'maxStepRetries'
  ]);
  return {
    maxIterations: Number.isInteger(maxIterations) && maxIterations > 0 ? maxIterations : 25,
    stepDelayMs: Number.isInteger(stepDelayMs) && stepDelayMs >= 0 ? stepDelayMs : 400,
    maxStepRetries: Number.isInteger(maxStepRetries) && maxStepRetries > 0 ? maxStepRetries : 3
  };
}

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
    case 'GET_STATUS':
      return { ok: true, status: await getTaskState(msg.tabId) };
    case 'TEST_API_KEY': {
      const { key, model, baseUrl } = msg;
      try {
        await client.testApiKey(key, model, baseUrl);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

function isRestrictedUrl(url) {
  if (!url) return false;
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('edge://') ||
         url.startsWith('about:') ||
         url.startsWith('view-source:');
}

// --- Task Lifecycle ---
async function startTask(tabId, task) {
  if (!task || !task.trim()) return { ok: false, error: 'Task text is empty.' };

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!isRestrictedUrl(tab?.url)) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (_e) {
      // Content script injection can fail on restricted or loading pages; will retry in loop
    }
  }

  const initialState = { task: task.trim(), history: [], memory: [], iteration: 0, stopped: false, status: 'running' };
  await setTaskState(tabId, initialState);

  runLoop(tabId);
  return { ok: true };
}

async function stopTask(tabId) {
  pendingScreenshots.delete(tabId);
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
    const config = await getAgentConfig();
    const MAX_ITERATIONS = config.maxIterations;
    const STEP_DELAY_MS = config.stepDelayMs;
    const MAX_STEP_RETRIES = config.maxStepRetries;

    let state = await getTaskState(tabId);
    if (!state) return;

    while (!state.stopped && state.iteration < MAX_ITERATIONS && state.status === 'running') {
      state.iteration += 1;
      await setTaskState(tabId, state);

      let stepSucceeded = false;
      let lastErr = '';

      for (let attempt = 1; attempt <= MAX_STEP_RETRIES; attempt++) {
        try {
          let observation;
          const currentTab = await chrome.tabs.get(tabId).catch(() => null);

          if (isRestrictedUrl(currentTab?.url)) {
            observation = {
              url: currentTab?.url || 'chrome://newtab',
              title: currentTab?.title || 'New Tab',
              elements: [],
              visibleText: []
            };
          } else {
            try {
              observation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
            } catch (_obsErr) {
              await waitForTabLoad(tabId);
              try {
                await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
                await sleep(500);
                observation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
              } catch (_injErr) {
                observation = {
                  url: currentTab?.url || 'about:blank',
                  title: currentTab?.title || 'Untitled',
                  elements: [],
                  visibleText: []
                };
              }
            }
          }

          // Flag sparse observation (< 3 elements) as strong signal to consider 'look'
          if (observation && Array.isArray(observation.elements) && observation.elements.length < 3) {
            observation.observationWasSparse = true;
          }

          // Check if a redacted screenshot is pending from a previous 'look' step
          let screenshot = null;
          if (pendingScreenshots.has(tabId)) {
            screenshot = pendingScreenshots.get(tabId);
            pendingScreenshots.delete(tabId); // Consume immediately so only attached for this single step
          }

          const action = await client.chooseNextAction(
            state.task,
            { ...observation, actionHistory: state.history, memory: state.memory, screenshot }
          );

          if (action.memory) state.memory.push(action.memory);
          delete action.memory;

          if (action.action === 'done') {
            state.history.push(action);
            state.status = 'done';
            await setTaskState(tabId, state);
            await notifyPopup(tabId);
            return;
          }

          if (action.action === 'look') {
            // 1. Verify tab is active before capture (prevent screenshotting wrong tab if user switched)
            const tab = await chrome.tabs.get(tabId);
            if (!tab.active) {
              await chrome.tabs.update(tabId, { active: true });
              await sleep(250);
            }

            // 2. Enforce capture rate limit (~2 calls/sec max in Chrome)
            const now = Date.now();
            const elapsed = now - lastCaptureTime;
            if (elapsed < 600) {
              await sleep(600 - elapsed);
            }
            lastCaptureTime = Date.now();

            // 3. Capture visible tab
            const rawDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });

            // 4. Query text PII bounds from page
            let piiBounds = [];
            try {
              const piiRes = await sendToContent(tabId, { type: 'GET_PII_BOUNDS' });
              if (piiRes && Array.isArray(piiRes.bounds)) {
                piiBounds = piiRes.bounds;
              }
            } catch (_e) {}

            // 5. Lazy-import on-device face & text redaction
            const { redactScreenshot } = await import('./vision-redact.js');
            const redactResult = await redactScreenshot(rawDataUrl, piiBounds);

            // 6. Store redacted screenshot in memory for the very next iteration only
            pendingScreenshots.set(tabId, redactResult.dataUrl);

            action.facesRedacted = redactResult.facesRedacted;
            action.textRegionsRedacted = redactResult.textRegionsRedacted;
            state.history.push(action);

            await setTaskState(tabId, state);
            await notifyPopup(tabId);

            stepSucceeded = true;
            break;
          }

          if (action.action === 'navigate') {
            state.history.push(action);
            await setTaskState(tabId, state);
            await notifyPopup(tabId);

            await chrome.tabs.update(tabId, { url: action.url });
            await waitForTabLoad(tabId);
            await sleep(600);
            try {
              await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            } catch (_e) {}

            stepSucceeded = true;
            break;
          }

          state.history.push(action);
          await setTaskState(tabId, state);
          await notifyPopup(tabId);

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
    pendingScreenshots.delete(tabId);
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
    } catch (e) {
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
    } catch (e) { return; } // Tab closed
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
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', tabId, state }).catch(() => { });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}