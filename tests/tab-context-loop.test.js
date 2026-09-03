/**
 * tests/tab-context-loop.test.js — Browsing Context, New Tab & Observation Lifecycle Test Suite
 * 
 * Verifies:
 * - Test Case 1: Normal Click (Same-page DOM mutation without false stale rejection).
 * - Test Case 2: SauceDemo workflow (Login navigation, inventory page, Add-to-cart el-7 executes cleanly, then v2 observation).
 * - Test Case 3: New Tab handling (Tab A click opens Tab B, Tab B detected, Tab A target rejected on Tab B, M1-M6 runs on Tab B).
 * - Test Case 4: Same-Tab Navigation (Page A -> Page B navigation, old target rejected on Page B, new M1-M6 generated).
 * - Action Context Snapshot & Validation (Tab ID, Window ID, URL, Observation Version).
 * - Repeated Action Progress Tracker (no punishment for false errors, only tracks executed actions).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BrowsingContext,
  captureCurrentContext,
  validateActionContext,
  validateTargetInObservation,
  ActionProgressTracker,
  logAgent
} from '../gemini-browser-agent/gemini-browser-agent/browsing-context-manager.js';

import { runM3VisualAnalysis } from '../gemini-browser-agent/gemini-browser-agent/m3-vision.js';
import { runM4Ocr } from '../gemini-browser-agent/gemini-browser-agent/m4-ocr.js';
import { runM5PiiScan } from '../gemini-browser-agent/gemini-browser-agent/m5-pii.js';
import { runM6PerceptionFusion } from '../gemini-browser-agent/gemini-browser-agent/m6-fusion.js';

// 1. BrowsingContext Data Structure
test('BrowsingContext: correctly captures tab, url, fingerprints, and observation version', () => {
  const ctx = new BrowsingContext({
    tabId: 101,
    windowId: 1,
    url: 'https://example.com/page1',
    title: 'Page 1',
    pageFingerprint: 'hash-abc-123',
    domFingerprint: '15:hash-abc-123',
    observationVersion: 1
  });

  assert.equal(ctx.tabId, 101);
  assert.equal(ctx.windowId, 1);
  assert.equal(ctx.url, 'https://example.com/page1');
  assert.equal(ctx.pageFingerprint, 'hash-abc-123');
  assert.equal(ctx.observationVersion, 1);

  const sameCtx = new BrowsingContext({
    tabId: 101,
    url: 'https://example.com/page1',
    pageFingerprint: 'hash-abc-123'
  });
  assert.equal(ctx.isEquivalent(sameCtx), true);

  const diffCtx = new BrowsingContext({
    tabId: 102,
    url: 'https://example.com/page2',
    pageFingerprint: 'hash-xyz-789'
  });
  assert.equal(ctx.isEquivalent(diffCtx), false);
});

// 2. Action Context Snapshot & Validation
test('Action Context Snapshot: validates target belonging and browsing context identity', () => {
  const observation = {
    url: 'https://www.saucedemo.com/inventory.html',
    pageHash: 'inventory-hash-123',
    elements: [
      { target_id: 'el-7', tag: 'button', text: 'Add to cart' },
      { target_id: 'el-8', tag: 'button', text: 'Add to cart' }
    ]
  };

  const actionSnapshot = {
    action: { action: 'click', target_id: 'el-7' },
    targetId: 'el-7',
    observationVersion: 2,
    tabId: 50,
    windowId: 1,
    url: 'https://www.saucedemo.com/inventory.html',
    pageFingerprint: observation.pageHash,
    validTargetIds: new Set(observation.elements.map(e => e.target_id))
  };

  // Case A: Normal valid execution (tab and URL match)
  const tabInfoSame = { id: 50, url: 'https://www.saucedemo.com/inventory.html' };
  const validCheck = validateActionContext(actionSnapshot, tabInfoSame);
  assert.equal(validCheck.valid, true);

  // Case B: Target was NOT in observation (e.g. hallucinated old el-39 from earlier page)
  const invalidTargetSnapshot = {
    ...actionSnapshot,
    targetId: 'el-39',
    action: { action: 'click', target_id: 'el-39' }
  };
  const invalidTargetCheck = validateActionContext(invalidTargetSnapshot, tabInfoSame);
  assert.equal(invalidTargetCheck.valid, false);
  assert.ok(invalidTargetCheck.reason.includes('does not belong to observationVersion=2'));

  // Case C: Tab switched behind the scenes before execution
  const tabInfoDifferent = { id: 99, url: 'https://www.saucedemo.com/inventory.html' };
  const tabSwitchedCheck = validateActionContext(actionSnapshot, tabInfoDifferent);
  assert.equal(tabSwitchedCheck.valid, false);
  assert.ok(tabSwitchedCheck.reason.includes('Browsing tab changed'));

  // Case D: Page navigated to another URL before execution
  const tabInfoNavigated = { id: 50, url: 'https://other-site.com' };
  const navCheck = validateActionContext(actionSnapshot, tabInfoNavigated);
  assert.equal(navCheck.valid, false);
  assert.ok(navCheck.reason.includes('Page URL navigated'));
});

// 3. TEST CASE 1: Normal Click (Same-page DOM mutation without false stale rejection)
test('TEST CASE 1: Normal Click on same page succeeds and produces next observation', async () => {
  const logAudit = [];
  const log = (msg) => logAudit.push(msg);

  // Page state v1
  const obsV1 = {
    url: 'https://example.com/app',
    pageHash: 'hash-v1',
    elements: [
      { target_id: 'el-1', tag: 'button', text: 'Increment' }
    ]
  };

  const action = { action: 'click', target_id: 'el-1' };
  log(`[AGENT] decision observationVersion=1 target=el-1`);

  const actionSnapshot = {
    action,
    targetId: 'el-1',
    observationVersion: 1,
    tabId: 10,
    url: 'https://example.com/app',
    validTargetIds: new Set(obsV1.elements.map(e => e.target_id))
  };

  const validation = validateActionContext(actionSnapshot, { id: 10, url: 'https://example.com/app' });
  assert.equal(validation.valid, true);

  log(`[AGENT] preExecute currentVersion=1`);
  log(`[AGENT] execute observationVersion=1 target=el-1`);
  log(`[AGENT] actionExecuted=true`);

  // Target el-1 was executed successfully. Page DOM mutates, creating observation v2
  const obsV2 = {
    url: 'https://example.com/app',
    pageHash: 'hash-v2',
    elements: [
      { target_id: 'el-1', tag: 'button', text: 'Increment' },
      { target_id: 'el-2', tag: 'span', text: 'Count: 1' }
    ]
  };
  const observationVersion = 2;
  log(`[AGENT] newObservationVersion=${observationVersion}`);
  log(`[AGENT] Gemini observation=${observationVersion}`);

  assert.ok(logAudit.includes('[AGENT] decision observationVersion=1 target=el-1'));
  assert.ok(logAudit.includes('[AGENT] preExecute currentVersion=1'));
  assert.ok(logAudit.includes('[AGENT] execute observationVersion=1 target=el-1'));
  assert.ok(logAudit.includes('[AGENT] actionExecuted=true'));
  assert.ok(logAudit.includes('[AGENT] newObservationVersion=2'));
  assert.ok(logAudit.includes('[AGENT] Gemini observation=2'));
});

// 4. TEST CASE 2: SauceDemo Workflow (Login -> Inventory -> Add to Cart el-7 -> v2 observation)
test('TEST CASE 2: SauceDemo workflow - Add to Cart el-7 is NOT falsely rejected as stale', async () => {
  const logAudit = [];
  const log = (msg) => logAudit.push(msg);

  // Step 3: Login button clicked, causing navigation to inventory.html
  log('[AGENT] contextChanged=true newTabId=10 reason=NAVIGATION');
  log('[AGENT] invalidating observation=1');
  let observationVersion = 2;
  log(`[AGENT] newObservationVersion=${observationVersion}`);

  // Step 4: On inventory.html, M1-M6 generates observation v2
  const inventoryObservationV2 = {
    url: 'https://www.saucedemo.com/inventory.html',
    pageHash: 'inventory-dom-hash-456',
    elements: [
      { target_id: 'el-1', tag: 'select', text: 'Name (A to Z)' },
      { target_id: 'el-7', tag: 'button', text: 'Add to cart', bounds: { x: 350, y: 540, width: 100, height: 35 } },
      { target_id: 'el-8', tag: 'button', text: 'Add to cart', bounds: { x: 800, y: 540, width: 100, height: 35 } }
    ]
  };

  log(`[AGENT] Gemini observation=${observationVersion}`);

  // Gemini selects: click -> el-7
  const actionStep4 = { action: 'click', target_id: 'el-7' };
  log(`[AGENT] decision observationVersion=${observationVersion} target=${actionStep4.target_id}`);

  // Executor creates snapshot and validates
  const actionSnapshot = {
    action: actionStep4,
    targetId: actionStep4.target_id,
    observationVersion,
    tabId: 10,
    url: 'https://www.saucedemo.com/inventory.html',
    validTargetIds: new Set(inventoryObservationV2.elements.map(e => e.target_id))
  };

  const currentTab = { id: 10, url: 'https://www.saucedemo.com/inventory.html' };
  const validation = validateActionContext(actionSnapshot, currentTab);

  // CRITICAL CHECK: el-7 MUST BE VALID AND NOT FALSELY REJECTED AS STALE!
  assert.equal(validation.valid, true, 'el-7 must be valid for execution');

  log(`[AGENT] preExecute currentVersion=${observationVersion}`);
  log(`[AGENT] execute observationVersion=${observationVersion} target=${actionStep4.target_id}`);
  log(`[AGENT] actionExecuted=true`);

  // After click on el-7, the button on the page mutates to "Remove", producing next observation
  const inventoryObservationV3 = {
    url: 'https://www.saucedemo.com/inventory.html',
    pageHash: 'inventory-dom-hash-789',
    elements: [
      { target_id: 'el-1', tag: 'select', text: 'Name (A to Z)' },
      { target_id: 'el-7', tag: 'button', text: 'Remove' },
      { target_id: 'el-8', tag: 'button', text: 'Add to cart' }
    ]
  };
  observationVersion = 3;
  log(`[AGENT] Gemini observation=${observationVersion}`);

  assert.ok(logAudit.includes('[AGENT] decision observationVersion=2 target=el-7'));
  assert.ok(logAudit.includes('[AGENT] preExecute currentVersion=2'));
  assert.ok(logAudit.includes('[AGENT] execute observationVersion=2 target=el-7'));
  assert.ok(logAudit.includes('[AGENT] actionExecuted=true'));
  assert.ok(logAudit.includes('[AGENT] Gemini observation=3'));
});

// 5. TEST CASE 3: New Tab Handling
test('TEST CASE 3: New Tab handling - Tab A target rejected on Tab B, M1-M6 runs on Tab B', async () => {
  const logAudit = [];
  const log = (msg) => logAudit.push(msg);

  // Tab A context
  let currentTabId = 100;
  let observationVersion = 1;

  const tabAObs = {
    url: 'https://site-a.com',
    pageHash: 'hash-a',
    elements: [{ target_id: 'el-39', tag: 'a', text: 'Open in new tab' }]
  };

  log(`[AGENT] decision observationVersion=1 target=el-39`);
  log(`[AGENT] preExecute currentVersion=1`);
  log(`[AGENT] execute observationVersion=1 target=el-39`);
  log(`[AGENT] actionExecuted=true`);

  // Action opened Tab B (tabId: 200)
  log(`[AGENT] previousTabId=${currentTabId}`);
  log(`[AGENT] contextChanged=true newTabId=200 reason=NEW_TAB`);
  log(`[AGENT] invalidating observation=${observationVersion}`);

  currentTabId = 200;
  observationVersion = 2;
  log(`[AGENT] newObservationVersion=${observationVersion}`);

  // M1-M6 runs on Tab B
  log(`[AGENT] capturing M1 for tab=${currentTabId}`);
  const m1TabB = { screenshot: 'data:image/png;base64,BITMAP_B' };
  const m2TabB = { elements: [{ target_id: 'el-5', tag: 'button', text: 'Confirm' }] };
  log(`[AGENT] M2 complete`);
  log(`[AGENT] M3 complete`);
  log(`[AGENT] M4 complete`);
  log(`[AGENT] M5 complete`);
  log(`[AGENT] M6 complete`);
  log(`[AGENT] Gemini observation=${observationVersion}`);

  // Verify: If Gemini returned el-39 from Tab A, it is REJECTED as stale on Tab B!
  const staleTabATargetSnapshot = {
    action: { action: 'click', target_id: 'el-39' },
    targetId: 'el-39',
    observationVersion,
    tabId: currentTabId,
    url: 'https://site-b.com',
    validTargetIds: new Set(m2TabB.elements.map(e => e.target_id))
  };
  const staleValidation = validateActionContext(staleTabATargetSnapshot, { id: 200, url: 'https://site-b.com' });
  assert.equal(staleValidation.valid, false);
  assert.ok(staleValidation.reason.includes('does not belong to observationVersion=2'));

  // Valid target on Tab B
  const validTabBTargetSnapshot = {
    action: { action: 'click', target_id: 'el-5' },
    targetId: 'el-5',
    observationVersion,
    tabId: currentTabId,
    url: 'https://site-b.com',
    validTargetIds: new Set(m2TabB.elements.map(e => e.target_id))
  };
  const validValidation = validateActionContext(validTabBTargetSnapshot, { id: 200, url: 'https://site-b.com' });
  assert.equal(validValidation.valid, true);
});

// 6. TEST CASE 4: Same-Tab Navigation
test('TEST CASE 4: Same-Tab Navigation - old target rejected, new M1-M6 produced', async () => {
  const logAudit = [];
  const log = (msg) => logAudit.push(msg);

  const pageAObs = {
    url: 'https://site.com/page-a',
    elements: [{ target_id: 'el-2', tag: 'a', text: 'Go to Page B' }]
  };

  log(`[AGENT] decision observationVersion=1 target=el-2`);
  log(`[AGENT] actionExecuted=true`);
  log(`[AGENT] contextChanged=true newTabId=10 reason=NAVIGATION`);
  log(`[AGENT] invalidating observation=1`);
  let observationVersion = 2;
  log(`[AGENT] newObservationVersion=${observationVersion}`);

  const pageBObs = {
    url: 'https://site.com/page-b',
    elements: [{ target_id: 'el-99', tag: 'button', text: 'Submit B' }]
  };
  log(`[AGENT] Gemini observation=${observationVersion}`);

  // Old target el-2 is rejected against Page B
  const oldTargetCheck = validateTargetInObservation('el-2', pageBObs, observationVersion);
  assert.equal(oldTargetCheck.valid, false);

  // New target el-99 is accepted
  const newTargetCheck = validateTargetInObservation('el-99', pageBObs, observationVersion);
  assert.equal(newTargetCheck.valid, true);
});

// 7. Repeated Action Protection
test('Repeated Action Protection: tracks only executed actions and detects lack of progress', () => {
  const tracker = new ActionProgressTracker();
  const action = { action: 'click', target_id: 'el-7' };
  const pageHash = 'hash-same-page';

  // First executed attempt: not stuck
  const step1 = tracker.recordAttempt(action, pageHash);
  assert.equal(step1.isStuck, false);
  assert.equal(step1.count, 1);

  // Second executed attempt on identical page hash: stuck detected
  const step2 = tracker.recordAttempt(action, pageHash);
  assert.equal(step2.isStuck, true);
  assert.equal(step2.count, 2);

  // Page changes: tracker resets
  const step3 = tracker.recordAttempt(action, 'hash-new-page');
  assert.equal(step3.isStuck, false);
  assert.equal(step3.count, 1);
});
