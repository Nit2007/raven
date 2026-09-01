// background.js — MV3 service worker.
// Owns the loop: ask content script for the DOM -> ask Gemini for one action
// -> tell content script to execute it -> repeat until "done", an error, or
// MAX_ITERATIONS is hit. State is kept per-tab so multiple tabs could in
// theory run tasks independently.

import { GeminiClient } from './gemini-client.js';

const client = new GeminiClient();
const MAX_ITERATIONS = 25;
const STEP_DELAY_MS = 400; // let the DOM settle before re-observing

/** @type {Map<number, {task:string, history:object[], iteration:number, stopped:boolean, status:string, error?:string}>} */
const tasks = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; // keep the message channel open for the async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'START_TASK':
      return startTask(msg.tabId, msg.task);
    case 'STOP_TASK':
      return stopTask(msg.tabId);
    case 'GET_STATUS':
      return { ok: true, status: tasks.get(msg.tabId) || null };
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

async function startTask(tabId, task) {
  if (!task || !task.trim()) return { ok: false, error: 'Task text is empty.' };

  // Fresh inject each run — content.js guards itself against double-init.
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

  tasks.set(tabId, { task: task.trim(), history: [], memory: [], iteration: 0, stopped: false, status: 'running' });
  runLoop(tabId); // fire and forget — status is polled/pushed separately
  return { ok: true };
}

async function stopTask(tabId) {
  const state = tasks.get(tabId);
  if (state && state.status === 'running') {
    state.stopped = true;
    state.status = 'stopped';
    notifyPopup(tabId);
  }
  return { ok: true };
}

async function runLoop(tabId) {
  const state = tasks.get(tabId);
  if (!state) return;

  while (!state.stopped && state.iteration < MAX_ITERATIONS) {
    state.iteration += 1;

    let observation;
    try {
      observation = await sendToContent(tabId, { type: 'GET_OBSERVATION' });
    } catch (err) {
      return fail(tabId, `Could not read page: ${messageOf(err)}`);
    }

    let action;
    try {
      action = await client.chooseNextAction(state.task, { ...observation, actionHistory: state.history, memory: state.memory });
    } catch (err) {
      return fail(tabId, messageOf(err));
    }

    if (action.memory) state.memory.push(action.memory);
    const memoryNote = action.memory; // keep for logs if needed
    delete action.memory; // history stays clean — just the mechanical action
    state.history.push(action);
    notifyPopup(tabId);

    if (action.action === 'done') {
      state.status = 'done';
      notifyPopup(tabId);
      return;
    }

    try {
      await sendToContent(tabId, { type: 'EXECUTE_ACTION', action });
    } catch (err) {
      return fail(tabId, `Action execution failed: ${messageOf(err)}`);
    }

    await sleep(STEP_DELAY_MS);
  }

  if (!state.stopped && state.status === 'running') {
    state.status = 'max_iterations';
    notifyPopup(tabId);
  }
}

function fail(tabId, error) {
  const state = tasks.get(tabId);
  if (!state) return;
  state.status = 'error';
  state.error = error;
  notifyPopup(tabId);
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

function notifyPopup(tabId) {
  const state = tasks.get(tabId);
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', tabId, state }).catch(() => {
    // No popup open to receive it — fine, it'll pull GET_STATUS when opened.
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
