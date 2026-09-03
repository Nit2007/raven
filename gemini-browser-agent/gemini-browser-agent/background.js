import { GeminiClient } from './gemini-client.js';
import { captureViewportM1 } from './m1-capture.js';
import { runM2DomAnalysis } from './m2-dom.js';
import { runM3VisualAnalysis } from './m3-vision.js';
import { runM4Ocr } from './m4-ocr.js';
import { runM5PiiScan } from './m5-pii.js';
import { runM6PerceptionFusion } from './m6-fusion.js';
import { StateTreeMemory } from './state-tree-memory.js';
import {
  BrowsingContext,
  captureCurrentContext,
  executeActionWithContextTracking,
  waitForTabReady,
  validateTargetInObservation,
  validateActionContext,
  ActionProgressTracker,
  logAgent
} from './browsing-context-manager.js';

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

// --- URL Safety & Auto-Navigation Helpers ---
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:')
  );
}

function extractInitialUrl(task) {
  if (!task) return 'https://www.google.com';
  // Check for explicit http(s) URL in task
  const urlMatch = task.match(/https?:\/\/[^\s"'`<>]+/i);
  if (urlMatch) return urlMatch[0];

  // Check for explicit domain names like github.com, saucedemo.com, etc.
  const domainMatch = task.match(/\b([a-zA-Z0-9-]+\.(?:com|org|io|net|edu|gov|co|in|ai))\b/i);
  if (domainMatch) return `https://${domainMatch[1]}`;

  // Check common site names
  const lower = task.toLowerCase();
  if (lower.includes('github')) return 'https://github.com';
  if (lower.includes('youtube')) return 'https://youtube.com';
  if (lower.includes('wikipedia')) return 'https://wikipedia.org';
  if (lower.includes('reddit')) return 'https://reddit.com';
  if (lower.includes('amazon')) return 'https://amazon.com';
  if (lower.includes('saucedemo')) return 'https://www.saucedemo.com';

  // Fallback to Google search for general tasks
  return 'https://www.google.com';
}

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
      const targetTab = await chrome.tabs.get(tabId).catch(() => null);
      if (isRestrictedUrl(targetTab?.url)) {
        return { ok: false, error: `Cannot capture internal browser page (${targetTab?.url}). Please open a regular website first.` };
      }
      return captureViewportM1(tabId);
    }
    case 'TRIGGER_M2': {
      let tabId = msg.tabId;
      if (!tabId) {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = activeTab?.id;
        } catch (_) {}
      }
      const targetTab = await chrome.tabs.get(tabId).catch(() => null);
      if (isRestrictedUrl(targetTab?.url)) {
        return { ok: false, error: `Cannot analyze internal browser page (${targetTab?.url}). Please open a regular website first.` };
      }
      return runM2DomAnalysis(tabId);
    }
    case 'TRIGGER_M3': {
      let tabId = msg.tabId;
      if (!tabId) {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = activeTab?.id;
        } catch (_) {}
      }
      const targetTab = await chrome.tabs.get(tabId).catch(() => null);
      if (isRestrictedUrl(targetTab?.url)) {
        return { ok: false, error: `Cannot run vision on internal browser page (${targetTab?.url}). Please open a regular website first.` };
      }
      const m1Res = await captureViewportM1(tabId);
      if (!m1Res?.ok || !m1Res.data?.screenshot) {
        return { ok: false, error: m1Res?.error || 'Failed to capture screenshot for M3' };
      }
      return runM3VisualAnalysis(m1Res.data.screenshot, { tabId });
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

  let targetTab = await chrome.tabs.get(tabId).catch(() => null);
  if (!targetTab) return { ok: false, error: 'Target tab could not be found.' };

  // If tab is on an internal restricted page (e.g. chrome://newtab), auto-navigate to destination
  if (isRestrictedUrl(targetTab.url)) {
    const initialUrl = extractInitialUrl(task.trim());
    await chrome.tabs.update(tabId, { url: initialUrl });
    await waitForTabLoad(tabId);
    await sleep(800);
    targetTab = await chrome.tabs.get(tabId).catch(() => null);
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (err) {
    return {
      ok: false,
      error: `Cannot inject into ${targetTab?.url || 'this page'}. Please open a regular website (e.g. https://google.com or https://github.com) first.`
    };
  }

  const initialState = {
    task: task.trim(),
    history: [],
    iteration: 0,
    stopped: false,
    status: 'running',
    visitedHashes: {},
    treeMemory: new StateTreeMemory().toJSON(),
    lastAction: null,
    lastHash: null,
    lastElement: null
  };
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

// --- The Core Loop (Auto-Resuming & Context-Aware) ---
async function runLoop(initialTabId) {
  let currentTabId = initialTabId;
  if (activeLoops.has(currentTabId)) return; 
  activeLoops.add(currentTabId);

  const progressTracker = new ActionProgressTracker();
  let observationVersion = 1;

  try {
    let state = await getTaskState(currentTabId);
    if (!state) return;

    if (state.observationVersion) {
      observationVersion = state.observationVersion;
    }

    while (!state.stopped && state.iteration < MAX_ITERATIONS && state.status === 'running') {
      state.iteration += 1;
      state.observationVersion = observationVersion;
      state.tabId = currentTabId;
      await setTaskState(currentTabId, state);

      // 1. Wait for tab to be ready and loaded using real Chrome tab status
      await waitForTabReady(currentTabId);

      // 2. Milestone M1: Real Viewport / Screenshot Capture on currentTabId
      logAgent(`capturing M1 for tab=${currentTabId}`);
      let m1Result = null;
      try {
        const m1Res = await captureViewportM1(currentTabId, { iteration: state.iteration });
        if (m1Res?.ok) m1Result = m1Res.data;
      } catch (m1Err) {
        console.warn('[M1 Capture] Non-fatal capture failure during loop:', m1Err);
      }

      // 3. Milestone M2: Semantic DOM Perception & Spatial Analysis on currentTabId
      let m2Result = null;
      try {
        const m2Res = await runM2DomAnalysis(currentTabId, { iteration: state.iteration });
        if (m2Res?.ok) m2Result = m2Res.data;
      } catch (m2Err) {
        console.warn('[M2 DOM] Non-fatal DOM analysis error during loop:', m2Err);
      }
      logAgent('M2 complete');

      // 4. Milestone M3: Lightweight Local Visual Perception on currentTabId screenshot
      let m3Result = null;
      if (m1Result?.screenshot) {
        try {
          const m3Res = await runM3VisualAnalysis(m1Result.screenshot, { tabId: currentTabId, iteration: state.iteration });
          if (m3Res?.ok) m3Result = m3Res.data;
        } catch (m3Err) {
          console.warn('[M3 Vision] Non-fatal visual perception error during loop:', m3Err);
        }
      }
      logAgent('M3 complete');

      // 5. Milestone M4: Local OCR Text Extraction on currentTabId
      let m4Result = null;
      try {
        const m4Res = await runM4Ocr({ m1Result, m2Result, tabId: currentTabId, iteration: state.iteration });
        if (m4Res?.ok) m4Result = m4Res.data;
      } catch (m4Err) {
        console.warn('[M4 OCR] Non-fatal OCR error during loop:', m4Err);
      }
      logAgent('M4 complete');

      // 6. Milestone M5: Privacy & Sensitive Redaction on currentTabId
      let m5Result = null;
      try {
        const m5Res = await runM5PiiScan({
          screenshotUrl: m1Result?.screenshot,
          elements: m2Result?.elements,
          textBlocks: m4Result?.blocks,
          tabId: currentTabId,
          iteration: state.iteration
        });
        if (m5Res?.ok) m5Result = m5Res.data;
      } catch (m5Err) {
        console.warn('[M5 PII] Non-fatal PII scanner error during loop:', m5Err);
      }
      logAgent('M5 complete');

      let stepSucceeded = false;
      let lastErr = '';

      for (let attempt = 1; attempt <= MAX_STEP_RETRIES; attempt++) {
        try {
          // Fetch scoped observation from content script on currentTabId
          let observation;
          try {
            observation = await sendToContent(currentTabId, { type: 'GET_OBSERVATION', observationVersion });
          } catch (_obsErr) {
            await waitForTabReady(currentTabId);
            try {
              await chrome.scripting.executeScript({ target: { tabId: currentTabId }, files: ['content.js'] });
            } catch (_) {}
            await sleep(400);
            observation = await sendToContent(currentTabId, { type: 'GET_OBSERVATION', observationVersion });
          }

          const currentContext = await captureCurrentContext(currentTabId, observationVersion, observation);

          if (!state.visitedHashes) state.visitedHashes = {};
          state.visitedHashes[observation.pageHash] = (state.visitedHashes[observation.pageHash] || 0) + 1;
          const visitCount = state.visitedHashes[observation.pageHash];

          // Rehydrate and advance StateTreeMemory
          const treeMemory = StateTreeMemory.fromJSON(state.treeMemory);
          if (state.lastAction && (state.lastObservation || state.lastHash)) {
            const outcome = StateTreeMemory.classifyOutcome(
              state.lastObservation,
              observation,
              state.lastAction
            );
            treeMemory.recordTransition(
              state.lastHash || state.lastObservation?.pageHash,
              observation.pageHash,
              state.lastAction,
              state.lastElement,
              outcome
            );
          }
          treeMemory.recordState(observation);
          const treeMemoryContext = treeMemory.getPromptContext(observation);
          state.treeMemory = treeMemory.toJSON();

          // Milestone M6: Perception Fusion & Fail-Closed Privacy Gate
          let safeObservation = observation;
          try {
            const m6Res = await runM6PerceptionFusion({
              m1Result,
              m2Result,
              m3Result,
              m4Result,
              m5Result,
              observation,
              iteration: state.iteration
            });
            if (m6Res?.ok && m6Res.data?.sanitizedObservation) {
              safeObservation = m6Res.data.sanitizedObservation;
            }
          } catch (m6Err) {
            console.warn('[M6 Fusion] Non-fatal perception fusion error during loop:', m6Err);
          }
          logAgent('M6 complete');

          logAgent(`Gemini observation=${observationVersion}`);

          // Pass the SAFE sanitized observation to Gemini (raw screenshot is NEVER forwarded)
          const action = await client.chooseNextAction(
            state.task,
            {
              ...safeObservation,
              pageHash: safeObservation.pageHash || observation.pageHash,
              visitCount,
              actionHistory: state.history,
              treeMemoryContext
            }
          );

          logAgent(`decision observationVersion=${observationVersion} target=${action.target_id || 'none'}`);

          // ACTION CONTEXT SNAPSHOT & STALE TARGET VALIDATION
          const currentTabInfo = await chrome.tabs.get(currentTabId).catch(() => null);
          const actionSnapshot = {
            action,
            targetId: action.target_id || null,
            observationVersion,
            tabId: currentTabId,
            windowId: currentContext ? currentContext.windowId : null,
            url: currentContext ? currentContext.url : '',
            pageFingerprint: observation.pageHash,
            domFingerprint: currentContext ? currentContext.domFingerprint : '',
            validTargetIds: new Set((observation.elements || []).map((e) => e.target_id))
          };

          const validation = validateActionContext(actionSnapshot, currentTabInfo);
          if (!validation.valid) {
            logAgent('STALE_TARGET_REJECTED', {
              target_id: action.target_id,
              observationVersion,
              reason: validation.reason
            });
            logAgent(`invalidating observation=${observationVersion}`);
            observationVersion++;
            await sleep(300);
            continue; // Re-observe current page with fresh observation
          }

          logAgent(`preExecute currentVersion=${observationVersion}`);
          logAgent(`execute observationVersion=${observationVersion} target=${action.target_id || 'none'}`);

          // Extract targeted element for semantic transition tracking on next iteration
          const targetEl = (observation.elements || []).find((el) => el.target_id === action.target_id) || null;
          state.lastAction = action;
          state.lastHash = observation.pageHash;
          state.lastObservation = observation;
          state.lastElement = targetEl ? {
            tag: targetEl.tag,
            type: targetEl.type,
            text: targetEl.text,
            structural_signature: targetEl.structural_signature,
            actionable: targetEl.actionable
          } : null;

          if (action.memory) delete action.memory;
          state.history.push(action);
          
          await setTaskState(currentTabId, state);
          await notifyPopup(currentTabId);

          if (action.action === 'done') {
            state.status = 'done';
            await setTaskState(currentTabId, state);
            await notifyPopup(currentTabId);
            return;
          }

          // EXECUTE ACTION WITH RIGOROUS CONTEXT & TAB TRACKING
          const execResult = await executeActionWithContextTracking(
            currentTabId,
            action,
            currentContext,
            sendToContent
          );

          // REPEATED-ACTION PROGRESS TRACKING (only for actions that actually executed)
          if (action.action !== 'wait' && action.action !== 'done') {
            const progress = progressTracker.recordAttempt(action, observation.pageHash);
            if (progress.isStuck) {
              logAgent('REPEATED_NO_PROGRESS_DETECTED', {
                action: action.action,
                target_id: action.target_id,
                consecutiveCount: progress.count
              });
              if (action.target_id) {
                treeMemory.recordTransition(
                  observation.pageHash,
                  observation.pageHash,
                  action,
                  null,
                  'NO_EFFECT'
                );
                state.treeMemory = treeMemory.toJSON();
              }
            }
          } else {
            progressTracker.reset();
          }

          // HANDLE BROWSING CONTEXT CHANGE (New Tab, In-Tab Navigation, Reload)
          if (execResult.contextChanged) {
            const previousTabId = currentTabId;
            const newTabId = execResult.newTabId;

            logAgent(`previousTabId=${previousTabId}`);
            logAgent('contextChanged=true', {
              newTabId,
              reason: execResult.reason
            });
            logAgent(`invalidating observation=${observationVersion}`);

            if (newTabId !== previousTabId) {
              // Switch loop tracking from previousTabId to newTabId
              activeLoops.delete(previousTabId);
              activeLoops.add(newTabId);

              // Transfer task state in storage
              state.tabId = newTabId;
              await setTaskState(newTabId, state);
              await chrome.storage.local.remove(`task_${previousTabId}`).catch(() => {});

              // Focus new tab so screenshots match active user viewport
              try {
                await chrome.tabs.update(newTabId, { active: true });
              } catch (_) {}

              currentTabId = newTabId;
            }

            observationVersion++;
            logAgent(`newObservationVersion=${observationVersion}`);
            progressTracker.reset();

            // Wait for new context to exist and finish loading completely
            await waitForTabReady(currentTabId);
          }

          stepSucceeded = true;
          break;
        } catch (err) {
          lastErr = messageOf(err);
          if (attempt < MAX_STEP_RETRIES) await sleep(1000);
        }
      }

      if (!stepSucceeded) {
        await fail(currentTabId, `Step ${state.iteration} failed after ${MAX_STEP_RETRIES} retries: ${lastErr}`);
        return;
      }
      
      await sleep(STEP_DELAY_MS);
      
      // Refresh state from storage in case the user clicked Stop during the sleep
      state = await getTaskState(currentTabId);
      if (!state) return;
    }

    if (!state.stopped && state.status === 'running') {
      state.status = 'max_iterations';
      await setTaskState(currentTabId, state);
      await notifyPopup(currentTabId);
    }
  } finally {
    activeLoops.delete(currentTabId);
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