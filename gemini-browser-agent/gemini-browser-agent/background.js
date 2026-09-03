import { GeminiClient } from './gemini-client.js';
import { captureViewportM1 } from './m1-capture.js';
import { runM2DomAnalysis } from './m2-dom.js';
import { StateTreeMemory } from './state-tree-memory.js';

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
    case 'TRIGGER_M2': {
      let tabId = msg.tabId;
      if (!tabId) {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = activeTab?.id;
        } catch (_) {}
      }
      return runM2DomAnalysis(tabId);
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

      // Milestone M2: Semantic DOM Perception & Spatial Analysis (local only, never sent to Gemini)
      try {
        await runM2DomAnalysis(tabId, { iteration: state.iteration });
      } catch (m2Err) {
        console.warn('[M2 DOM] Non-fatal DOM analysis error during loop:', m2Err);
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

          if (!state.visitedHashes) {
            state.visitedHashes = {};
          }
          state.visitedHashes[observation.pageHash] = (state.visitedHashes[observation.pageHash] || 0) + 1;
          const visitCount = state.visitedHashes[observation.pageHash];

          // Rehydrate and advance StateTreeMemory
          const treeMemory = StateTreeMemory.fromJSON(state.treeMemory);

          // If there was a previous action, record transition from lastHash to observation.pageHash
          if (state.lastAction && state.lastHash) {
            treeMemory.recordTransition(
              state.lastHash,
              observation.pageHash,
              state.lastAction,
              state.lastElement
            );
          }

          // Register current page state node in tree
          treeMemory.recordState(observation);

          // Generate prompt-safe structured memory block
          const treeMemoryContext = treeMemory.getPromptContext(observation);

          // DETECT BRUTE-FORCE LOOP: Check if we've tried too many actions at this state without progress
          const currentNode = treeMemory.nodes[observation.pageHash];
          const triedActions = currentNode?.triedActions || [];
          const failedActions = triedActions.filter(t => !t.resultedInStateChange);
          
          // Track global loop iterations across all states
          treeMemory.totalLoopIterations = (treeMemory.totalLoopIterations || 0) + 1;
          
          // If 5+ actions failed at this state OR 20+ total iterations without completion, force early termination
          if (failedActions.length >= 5 || treeMemory.totalLoopIterations >= 20) {
            state.status = 'error';
            state.error = `Loop detected: ${failedActions.length} failed actions at this state (total iterations: ${treeMemory.totalLoopIterations}). Task may be complete or impossible. Try a different approach.`;
            await setTaskState(tabId, state);
            await notifyPopup(tabId);
            return;
          }

          // Update treeMemory in task state
          state.treeMemory = treeMemory.toJSON();

          const action = await client.chooseNextAction(
            state.task,
            {
              ...observation,
              pageHash: observation.pageHash,
              visitCount,
              actionHistory: state.history,
              treeMemoryContext
            }
          );

          // Extract targeted element for semantic transition tracking on next iteration
          const targetEl = (observation.elements || []).find((el) => el.target_id === action.target_id) || null;
          state.lastAction = action;
          state.lastHash = observation.pageHash;
          state.lastElement = targetEl ? { tag: targetEl.tag, type: targetEl.type, text: targetEl.text } : null;

          if (action.memory) delete action.memory;
          state.history.push(action);
          
          await setTaskState(tabId, state);
          await notifyPopup(tabId);

          if (action.action === 'done') {
            state.status = 'done';
            // Capture final observation before generating commentary
            let finalObservation = null;
            try {
              finalObservation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
            } catch (e) {
              console.warn('Could not capture final observation for commentary:', e);
            }
            // Generate final commentary based on the task and what was accomplished
            const commentary = await generateAgentCommentary(state.task, state.history, treeMemory, finalObservation);
            state.agentCommentary = commentary;
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
async function generateAgentCommentary(task, history, treeMemory, finalObservation) {
  // Use Gemini to generate a natural language summary/insight about the task execution
  try {
    const keys = await client.getApiKeys();
    if (!keys || keys.length === 0) {
      return "Task completed. (API keys not configured for detailed insights)";
    }
    
    const actionSummary = history.map((h, i) => 
      `${i + 1}. ${h.action}${h.target_id ? ` on element ${h.target_id}` : ''}${h.value ? ` with value "${h.value}"` : ''}`
    ).join('\n');
    
    const visitedStates = Object.keys(treeMemory.nodes || {}).length;
    const totalActions = history.length;
    
    // Include actual page content from final state for data-driven insights
    let pageDataContext = '';
    if (finalObservation) {
      pageDataContext = `
FINAL PAGE URL: ${finalObservation.url || 'unknown'}
FINAL PAGE TITLE: ${finalObservation.title || 'unknown'}
VISIBLE TEXT ON PAGE: ${JSON.stringify(finalObservation.visibleText || []).slice(0, 3000)}
INTERACTIVE ELEMENTS: ${JSON.stringify(finalObservation.elements || []).slice(0, 1000)}
`;
    }
    
    const prompt = `You are a helpful AI assistant analyzing the results of a browser automation task.

TASK GIVEN BY USER: "${task}"

ACTIONS PERFORMED:
${actionSummary}

STATS:
- Total actions taken: ${totalActions}
- Unique page states visited: ${visitedStates}

${pageDataContext}

Based on the task and the ACTUAL DATA found on the final page, provide a brief, insightful commentary (2-4 sentences) in a conversational tone.
- If the task was about finding information (like "review my leetcode profile"), extract REAL numbers/facts from the VISIBLE TEXT ON PAGE above and give an honest assessment.
- CRITICAL: Only mention specific statistics (like "you solved X problems") if you can see them in the VISIBLE TEXT ON PAGE section above. DO NOT invent numbers.
- If you cannot find specific data in the page content, speak generally about what you observed or suggest the user check manually.
- If the task was about performing an action (like "sign up for newsletter"), confirm completion and mention any observations.
- Be direct and helpful. If you noticed patterns (e.g., "the page shows many unsolved problems" or "the site had multiple security steps"), mention them.
- Do NOT just list actions. Provide actual insight or analysis based on real page content.

Example GOOD commentary: "I reviewed your LeetCode profile page. The page shows you've been active recently, and I can see sections for your solved problems and contest ratings. Based on the visible stats, you appear to focus mainly on medium difficulty problems. Consider tackling more hard problems to improve your ranking."

Example BAD commentary (DO NOT DO THIS): "You solved 245 problems with 67% accuracy." <- Never invent specific numbers unless they appear in VISIBLE TEXT ON PAGE.

YOUR COMMENTARY:`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys[0]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    const data = await response.json();
    const commentary = data.candidates?.[0]?.content?.parts?.[0]?.text || "Task completed successfully.";
    return commentary.trim();
  } catch (err) {
    console.warn('Failed to generate commentary:', err);
    return "Task completed. (Could not generate detailed insights)";
  }
}

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