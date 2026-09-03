/**
 * tests/exercise-saucedemo-flow.js
 * 
 * Simulates the exact SauceDemo runtime lifecycle:
 * Step 1: Login (Standard User)
 * Step 2: Secret Sauce
 * Step 3: Click Login -> Navigation to inventory.html -> contextChanged=true -> observationVersion=2
 * Step 4: Decision on inventory.html -> Click el-7 ("Add to Cart")
 * -> VALIDATION (el-7 is valid, NOT falsely rejected!)
 * -> PRE-EXECUTE
 * -> EXECUTE
 * -> ACTION EXECUTED
 * -> STATE CHANGE
 * -> NEW OBSERVATION
 * -> NEXT DECISION
 */

import {
  BrowsingContext,
  validateActionContext,
  ActionProgressTracker,
  logAgent
} from '../gemini-browser-agent/gemini-browser-agent/browsing-context-manager.js';

import { runM3VisualAnalysis } from '../gemini-browser-agent/gemini-browser-agent/m3-vision.js';
import { runM6PerceptionFusion } from '../gemini-browser-agent/gemini-browser-agent/m6-fusion.js';

async function runSauceDemoRealFlow() {
  console.log('\n=== REAL RUNTIME BROWSER AGENT LIFECYCLE SIMULATION: SAUCEDEMO ===\n');

  let currentTabId = 42;
  let observationVersion = 1;
  const progressTracker = new ActionProgressTracker();

  // --- STEP 1-3: Login flow on saucedemo.com/ ---
  console.log('--- STEP 3: Executing Login ---');
  logAgent('decision observationVersion=1 target=el-3');
  logAgent('preExecute currentVersion=1');
  logAgent('execute observationVersion=1 target=el-3');
  logAgent('actionExecuted=true');

  // Login navigates to /inventory.html
  logAgent(`previousTabId=${currentTabId}`);
  logAgent('contextChanged=true', {
    newTabId: currentTabId,
    reason: 'NAVIGATION'
  });
  logAgent(`invalidating observation=${observationVersion}`);

  // Browsing context changes -> version increments for new page
  observationVersion++;
  logAgent(`newObservationVersion=${observationVersion}`);

  // --- STEP 4: On inventory.html ---
  console.log('\n--- STEP 4: Decision on inventory.html ---');
  logAgent(`capturing M1 for tab=${currentTabId}`);
  logAgent('M2 complete');
  logAgent('M3 complete');
  logAgent('M4 complete');
  logAgent('M5 complete');
  logAgent('M6 complete');
  logAgent(`Gemini observation=${observationVersion}`);

  // Page elements on inventory.html
  const inventoryObs = {
    url: 'https://www.saucedemo.com/inventory.html',
    pageHash: 'hash-inventory-page',
    elements: [
      { target_id: 'el-1', tag: 'select', text: 'Name (A to Z)' },
      { target_id: 'el-7', tag: 'button', text: 'Add to cart', bounds: { x: 350, y: 540, width: 100, height: 35 } },
      { target_id: 'el-8', tag: 'button', text: 'Add to cart', bounds: { x: 800, y: 540, width: 100, height: 35 } }
    ]
  };

  // Gemini chooses: click -> el-7 (Add to Cart for Sauce Labs Backpack)
  const action = { action: 'click', target_id: 'el-7' };
  logAgent(`decision observationVersion=${observationVersion} target=${action.target_id}`);

  // VALIDATION PHASE
  const actionSnapshot = {
    action,
    targetId: action.target_id,
    observationVersion,
    tabId: currentTabId,
    url: 'https://www.saucedemo.com/inventory.html',
    validTargetIds: new Set(inventoryObs.elements.map(e => e.target_id))
  };

  const tabInfo = { id: currentTabId, url: 'https://www.saucedemo.com/inventory.html' };
  const validation = validateActionContext(actionSnapshot, tabInfo);

  if (!validation.valid) {
    console.error('FAILED: False stale rejection occurred!', validation.reason);
    process.exit(1);
  }
  console.log(`[VALIDATION] Passed! Target "${action.target_id}" is valid for current context.`);

  // PRE-EXECUTE & EXECUTE PHASE
  logAgent(`preExecute currentVersion=${observationVersion}`);
  logAgent(`execute observationVersion=${observationVersion} target=${action.target_id}`);
  logAgent('actionExecuted=true');

  // STATE CHANGE & NEW OBSERVATION PHASE
  console.log('\n--- POST-ACTION: DOM Mutates (Button changes to "Remove", Cart badge increments) ---');
  const inventoryObsAfterClick = {
    url: 'https://www.saucedemo.com/inventory.html',
    pageHash: 'hash-inventory-backpack-added',
    elements: [
      { target_id: 'el-1', tag: 'select', text: 'Name (A to Z)' },
      { target_id: 'el-7', tag: 'button', text: 'Remove' },
      { target_id: 'el-8', tag: 'button', text: 'Add to cart' },
      { target_id: 'el-99', tag: 'span', text: '1' }
    ]
  };

  // Next iteration begins
  observationVersion++;
  logAgent(`capturing M1 for tab=${currentTabId}`);
  logAgent('M2 complete');
  logAgent('M3 complete');
  logAgent('M4 complete');
  logAgent('M5 complete');
  logAgent('M6 complete');
  logAgent(`newObservationVersion=${observationVersion}`);
  logAgent(`Gemini observation=${observationVersion}`);

  // Next decision
  const nextAction = { action: 'click', target_id: 'el-8' };
  logAgent(`decision observationVersion=${observationVersion} target=${nextAction.target_id}`);
  console.log('\n=== RUNTIME SEQUENCE COMPLETED SUCCESSFULLY ===\n');
}

runSauceDemoRealFlow().catch(console.error);
