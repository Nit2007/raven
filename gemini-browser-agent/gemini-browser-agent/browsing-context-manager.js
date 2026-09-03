/**
 * browsing-context-manager.js — Generic Browsing Context & Tab Lifecycle Manager for RAVEN
 * 
 * Guarantees that every browser tab, page, and navigation context is treated as an
 * independent observation state.
 * 
 * Responsibilities:
 * 1. Tracks current browsing context: { tabId, windowId, url, pageFingerprint, domFingerprint, observationVersion }.
 * 2. Detects new tabs opened by actions (target="_blank", window.open, Ctrl+click).
 * 3. Detects in-tab navigation and major document replacements.
 * 4. Invalidates stale observations and scopes DOM element IDs to the current observation version.
 * 5. Prevents execution of stale element IDs originating from an obsolete tab or page state.
 * 6. Implements generic repeated-action safeguard to prevent endless loops on unreactive elements.
 * 7. Enforces real browser lifecycle waiting (no fake timeouts).
 */

export class BrowsingContext {
  constructor({
    tabId,
    windowId = null,
    url = '',
    title = '',
    pageFingerprint = '',
    domFingerprint = '',
    observationVersion = 1,
    timestamp = Date.now()
  }) {
    this.tabId = tabId;
    this.windowId = windowId;
    this.url = url;
    this.title = title;
    this.pageFingerprint = pageFingerprint;
    this.domFingerprint = domFingerprint;
    this.observationVersion = observationVersion;
    this.timestamp = timestamp;
  }

  isEquivalent(other) {
    if (!other) return false;
    return (
      this.tabId === other.tabId &&
      this.url === other.url &&
      this.pageFingerprint === other.pageFingerprint
    );
  }

  toJSON() {
    return {
      tabId: this.tabId,
      windowId: this.windowId,
      url: this.url,
      title: this.title,
      pageFingerprint: this.pageFingerprint,
      domFingerprint: this.domFingerprint,
      observationVersion: this.observationVersion,
      timestamp: this.timestamp
    };
  }
}

/**
 * Standardized debug logger matching RAVEN specifications
 */
export function logAgent(event, details = {}) {
  const parts = Object.entries(details)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[AGENT] ${event}${parts ? ' ' + parts : ''}`);
}

/**
 * Captures current browsing context for a tab
 */
export async function captureCurrentContext(tabId, observationVersion = 1, observation = null) {
  let tab = null;
  if (typeof chrome !== 'undefined' && chrome.tabs?.get) {
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {}
  }

  const url = observation?.url || tab?.url || '';
  const title = observation?.title || tab?.title || '';
  const pageFingerprint = observation?.pageHash || '';
  const domFingerprint = observation?.elements
    ? `${observation.elements.length}:${pageFingerprint}`
    : '';

  return new BrowsingContext({
    tabId,
    windowId: tab?.windowId || null,
    url,
    title,
    pageFingerprint,
    domFingerprint,
    observationVersion
  });
}

/**
 * Waits for a tab to finish loading using real Chrome tab status
 */
export async function waitForTabReady(tabId, timeoutMs = 12000) {
  if (typeof chrome === 'undefined' || !chrome.tabs?.get) {
    return true;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) return false;
      if (tab.status === 'complete') {
        // Ensure content script is alive
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        } catch (_) {}
        return true;
      }
    } catch (_) {
      return false; // Tab closed
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Executes an action with rigorous pre/post tab and navigation tracking.
 * Detects if a new tab was created or if the current tab navigated.
 * 
 * @param {number} currentTabId
 * @param {object} action
 * @param {BrowsingContext} previousContext
 * @param {Function} sendActionFn
 * @returns {Promise<{actionExecuted: boolean, previousContext: BrowsingContext, resultingContext: BrowsingContext, contextChanged: boolean, newTabId: number|null, reason: string}>}
 */
export async function executeActionWithContextTracking(currentTabId, action, previousContext, sendActionFn) {
  logAgent(`action=${(action.action || '').toUpperCase()}`, {
    target_id: action.target_id || null,
    previousTabId: currentTabId
  });

  let createdTabId = null;
  const createdListener = (tab) => {
    // If a tab is opened by currentTabId or belongs to the current window
    if (tab.openerTabId === currentTabId || (previousContext.windowId && tab.windowId === previousContext.windowId)) {
      createdTabId = tab.id;
    }
  };

  let tabsBefore = [];
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      tabsBefore = await chrome.tabs.query({ currentWindow: true });
      chrome.tabs.onCreated.addListener(createdListener);
    } catch (_) {}
  }
  const tabIdsBefore = new Set(tabsBefore.map((t) => t.id));

  let actionExecuted = false;
  let actionError = null;

  try {
    await sendActionFn(currentTabId, { type: 'EXECUTE_ACTION', action });
    actionExecuted = true;
    logAgent('actionExecuted=true');
  } catch (err) {
    actionError = err;
  } finally {
    if (typeof chrome !== 'undefined' && chrome.tabs?.onCreated) {
      chrome.tabs.onCreated.removeListener(createdListener);
    }
  }

  if (actionError) {
    throw actionError;
  }

  // Allow brief browser event loop settlement (250ms) for new tab / navigation event dispatch
  await new Promise((r) => setTimeout(r, 250));

  let contextChanged = false;
  let newTabId = null;
  let changeReason = 'SAME_PAGE';

  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabsAfter = await chrome.tabs.query({ currentWindow: true });
      const newTabs = tabsAfter.filter((t) => !tabIdsBefore.has(t.id));

      // 1. Check if a new tab was opened
      if (newTabs.length > 0 || (createdTabId && !tabIdsBefore.has(createdTabId))) {
        newTabId = newTabs[0]?.id || createdTabId;
        contextChanged = true;
        changeReason = 'NEW_TAB';
      } else {
        // 2. Check if the active tab changed
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id !== currentTabId && !tabIdsBefore.has(activeTab.id)) {
          newTabId = activeTab.id;
          contextChanged = true;
          changeReason = 'NEW_TAB';
        } else {
          // 3. Check if the current tab navigated to a new URL
          const currentTab = await chrome.tabs.get(currentTabId).catch(() => null);
          if (currentTab) {
            if (previousContext.url && currentTab.url !== previousContext.url) {
              contextChanged = true;
              newTabId = currentTabId;
              changeReason = 'NAVIGATION';
            } else if (currentTab.status === 'loading') {
              contextChanged = true;
              newTabId = currentTabId;
              changeReason = 'RELOAD';
            }
          }
        }
      }
    } catch (_) {}
  }

  if (contextChanged) {
    logAgent('contextChanged=true', {
      previousTabId: currentTabId,
      newTabId: newTabId || currentTabId,
      reason: changeReason
    });
  }

  return {
    actionExecuted,
    previousContext,
    resultingContext: null, // Will be established when new observation is captured
    contextChanged,
    newTabId: newTabId || currentTabId,
    reason: changeReason
  };
}

/**
 * Validates action context snapshot before execution:
 * 1. Target belongs to the observation Gemini decided from.
 * 2. Browsing tab has not switched behind the scenes.
 * 3. Page URL is still compatible with the decision state.
 */
export function validateActionContext(actionSnapshot, currentTabInfo) {
  if (!actionSnapshot) return { valid: false, reason: 'Missing action context snapshot' };

  if (actionSnapshot.targetId) {
    if (!actionSnapshot.validTargetIds || !actionSnapshot.validTargetIds.has(actionSnapshot.targetId)) {
      return {
        valid: false,
        reason: `Target ID "${actionSnapshot.targetId}" does not belong to observationVersion=${actionSnapshot.observationVersion}`
      };
    }
  }

  if (currentTabInfo && actionSnapshot.tabId && currentTabInfo.id !== actionSnapshot.tabId) {
    return {
      valid: false,
      reason: `Browsing tab changed from ${actionSnapshot.tabId} to ${currentTabInfo.id} before execution`
    };
  }

  if (currentTabInfo && actionSnapshot.url && currentTabInfo.url !== actionSnapshot.url) {
    return {
      valid: false,
      reason: `Page URL navigated from "${actionSnapshot.url}" to "${currentTabInfo.url}" before action could execute`
    };
  }

  return { valid: true };
}

/**
 * Validates that a targeted element ID exists in the current observation.
 * Prevents executing stale element IDs from an obsolete observation version.
 */
export function validateTargetInObservation(targetId, currentObservation, observationVersion) {
  if (!targetId) return { valid: true };
  if (!currentObservation || !Array.isArray(currentObservation.elements)) {
    return { valid: false, reason: 'No active observation elements available' };
  }

  const exists = currentObservation.elements.some((el) => el.target_id === targetId);
  if (!exists) {
    return {
      valid: false,
      reason: `Target ID "${targetId}" is stale (does not exist in observationVersion=${observationVersion})`
    };
  }

  return { valid: true };
}

/**
 * Generic Repeated-Action Safeguard:
 * Detects if the agent is stuck attempting the exact same action and target on an unreactive page.
 */
export class ActionProgressTracker {
  constructor() {
    this.consecutiveIdenticalCount = 0;
    this.lastActionSignature = null;
    this.lastPageFingerprint = null;
  }

  recordAttempt(action, pageFingerprint) {
    const actSig = `${action.action}:${action.target_id || ''}:${action.value || ''}:${action.direction || ''}`;
    
    if (this.lastActionSignature === actSig && this.lastPageFingerprint === pageFingerprint) {
      this.consecutiveIdenticalCount++;
    } else {
      this.consecutiveIdenticalCount = 1;
      this.lastActionSignature = actSig;
      this.lastPageFingerprint = pageFingerprint;
    }

    return {
      isStuck: this.consecutiveIdenticalCount >= 2,
      count: this.consecutiveIdenticalCount,
      actionSignature: actSig
    };
  }

  reset() {
    this.consecutiveIdenticalCount = 0;
    this.lastActionSignature = null;
    this.lastPageFingerprint = null;
  }
}
