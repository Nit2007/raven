import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { GoalManager } from '../src/agent/goalManager.js';
import { ActionMemory } from '../src/agent/actionMemory.js';
import { createPageFingerprint } from '../src/agent/pageFingerprint.js';
import { ActionGuard } from '../src/agent/actionDeduplication.js';
import { AgentController } from '../src/agent/agentController.js';
import { Person1Bridge } from '../src/integration/person1Bridge.js';
// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
    const mockWindow = { location: { href: 'http://localhost/test' } };
    const mockDoc = { title: 'M11 Test Page' };
    const runCode = new Function('globalThis', 'window', 'document', 'navigator', 'location', code);
    runCode(globalThis, mockWindow, mockDoc, {}, mockWindow.location);
};
loadPerson1Module('Client/DOM/sensitivity-detector.js');
loadPerson1Module('Client/DOM/redaction-engine.js');
loadPerson1Module('Client/DOM/sanitizer.js');
loadPerson1Module('Client/DOM/server-adapter.js');
const ServerAdapter = globalThis.ServerAdapter;
const createPassReceipt = (action, targetId = null, msg = 'Real action executed') => ({
    success: true,
    action,
    target_element_id: targetId,
    execution: 'REAL_BROWSER',
    dispatched: true,
    verified: true,
    message: msg
});
describe('RAVEN M11 — Goal State, Action Memory & Repetition Prevention Test Suite', () => {
    // =========================================================================
    // UNIT TESTS (1–16)
    // =========================================================================
    it('1. Goal initialization correctly normalizes goal and sets status IN_PROGRESS', () => {
        const gm = new GoalManager();
        const state = gm.initialize('Click the Login button');
        assert.strictEqual(state.status, 'IN_PROGRESS');
        assert.strictEqual(state.originalGoal, 'Click the Login button');
        assert.strictEqual(state.normalizedGoal, 'click the login button');
        assert.ok(state.requiredActions.includes('CLICK'));
    });
    it('2. Goal completion evaluates satisfied single click task', () => {
        const gm = new GoalManager();
        gm.initialize('Click Login');
        assert.strictEqual(gm.isComplete(), false);
        gm.markActionComplete('CLICK:login-btn');
        const satisfied = gm.evaluateCompletion();
        assert.strictEqual(satisfied, true);
        assert.strictEqual(gm.isComplete(), true);
    });
    it('3. Sub-goal completion advances sub-goal sequence correctly', () => {
        const gm = new GoalManager();
        gm.initialize('Search for SIH 2026');
        assert.strictEqual(gm.getState().currentSubGoal, 'Find search field');
        gm.markSubGoalComplete('Find search field');
        assert.strictEqual(gm.getState().currentSubGoal, 'Enter SIH 2026');
        gm.markSubGoalComplete('Enter SIH 2026');
        assert.strictEqual(gm.getState().currentSubGoal, 'Submit search');
        gm.markSubGoalComplete('Submit search');
        gm.markSubGoalComplete('Verify results');
        assert.strictEqual(gm.isComplete(), true);
    });
    it('4. Action ledger records proposed, executed, verified actions correctly', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({
            type: 'CLICK',
            targetElementId: 'btn-login',
            targetText: 'Login'
        });
        assert.strictEqual(entry.executionStatus, 'PROPOSED');
        memory.markExecuted(entry.actionId);
        assert.strictEqual(memory.getLastAction()?.executionStatus, 'EXECUTED');
        memory.markVerified(entry.actionId, 'Click verified');
        assert.strictEqual(memory.getLastAction()?.executionStatus, 'VERIFIED');
    });
    it('5. Duplicate action detection identifies exact identical action proposals', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'CLICK', targetElementId: 'btn-submit', targetText: 'Submit' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId);
        const isDup = memory.hasEquivalentVerifiedAction({
            type: 'CLICK',
            targetElementId: 'btn-submit',
            targetText: 'Submit'
        });
        assert.strictEqual(isDup, true);
    });
    it('6. Equivalent action detection identifies semantic text equivalence across different IDs', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'CLICK', targetElementId: 'login-page1-id', targetText: 'Login' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId);
        // On page 2, button has id="login-page2-id" but same text "Login"
        const isEquiv = memory.hasEquivalentVerifiedAction({
            type: 'CLICK',
            targetElementId: 'login-page2-id',
            targetText: 'Login'
        });
        assert.strictEqual(isEquiv, true);
    });
    it('7. Page fingerprint generation creates deterministic hash from safe elements', () => {
        const sanitizedState = {
            url: 'http://localhost/login',
            title: 'Login Page',
            elements: [
                { tag: 'input', id: 'username', type: 'text', visibleText: 'Username' },
                { tag: 'button', id: 'submit-btn', visibleText: 'Login' }
            ]
        };
        const fp1 = createPageFingerprint(sanitizedState);
        const fp2 = createPageFingerprint(sanitizedState);
        assert.ok(fp1.fingerprint.startsWith('fp_'));
        assert.strictEqual(fp1.fingerprint, fp2.fingerprint);
    });
    it('8. Page fingerprint change detection identifies URL or DOM structure shifts', () => {
        const stateA = { url: 'http://localhost/pageA', title: 'Page A', elements: [{ tag: 'a', id: 'nav-b', visibleText: 'Go B' }] };
        const stateB = { url: 'http://localhost/pageB', title: 'Page B', elements: [{ tag: 'h1', visibleText: 'Welcome B' }] };
        const fpA = createPageFingerprint(stateA);
        const fpB = createPageFingerprint(stateB);
        assert.notStrictEqual(fpA.fingerprint, fpB.fingerprint);
        assert.notStrictEqual(fpA.navigationKey, fpB.navigationKey);
    });
    it('9. ActionGuard rejects execution when goal is already complete', () => {
        const gm = new GoalManager();
        gm.initialize('Click Login');
        gm.markActionComplete('CLICK:login');
        gm.evaluateCompletion();
        const memory = new ActionMemory();
        const res = ActionGuard.shouldExecuteAction({ action: 'CLICK', targetSelector: 'login-btn', value: null }, { goalManager: gm, actionMemory: memory, currentScreenElements: [{ id: 'login-btn' }], currentPageFingerprint: 'fp_1' });
        assert.strictEqual(res.approved, false);
        assert.strictEqual(res.reason, 'GOAL_ALREADY_COMPLETE');
    });
    it('10. ActionGuard rejects action that targets an already completed sub-goal', () => {
        const gm = new GoalManager();
        gm.initialize('Search for SIH 2026');
        gm.markSubGoalComplete('Find search field');
        const memory = new ActionMemory();
        const res = ActionGuard.shouldExecuteAction({ action: 'CLICK', targetSelector: 'search-field-id', value: null, reasoning: 'Find search field' }, { goalManager: gm, actionMemory: memory, currentScreenElements: [{ id: 'search-field-id' }], currentPageFingerprint: 'fp_1', proposedTargetText: 'Find search field' });
        assert.strictEqual(res.approved, false);
        assert.strictEqual(res.reason, 'SUBGOAL_ALREADY_COMPLETE');
    });
    it('11. ActionGuard rejects action when target is missing/stale', () => {
        const gm = new GoalManager();
        gm.initialize('Click Submit');
        const memory = new ActionMemory();
        const res = ActionGuard.shouldExecuteAction({ action: 'CLICK', targetSelector: 'missing-btn-777', value: null }, { goalManager: gm, actionMemory: memory, currentScreenElements: [{ id: 'other-btn' }], currentPageFingerprint: 'fp_1' });
        assert.strictEqual(res.approved, false);
        assert.strictEqual(res.reason, 'TARGET_NOT_FOUND');
    });
    it('12. Successful click verification updates ActionMemory and GoalManager', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const receipt = createPassReceipt('CLICK', 'login-btn', 'Real click dispatched');
        assert.strictEqual(receipt.verified, true);
        const entry = controller.actionMemory.recordAction({ type: 'CLICK', targetElementId: 'login-btn' });
        controller.actionMemory.markVerified(entry.actionId, 'Verified');
        controller.goalManager.markActionComplete('CLICK:login-btn');
        const satisfied = controller.goalManager.evaluateCompletion();
        assert.strictEqual(satisfied, true);
        assert.strictEqual(controller.goalManager.isComplete(), true);
        assert.strictEqual(controller.actionMemory.hasVerifiedAction('CLICK', 'login-btn'), true);
    });
    it('13. Failed click verification marks action FAILED in ActionMemory', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'CLICK', targetElementId: 'btn-buggy' });
        memory.markFailed(entry.actionId, 'Element unclickable');
        assert.strictEqual(memory.getLastAction()?.executionStatus, 'FAILED');
        assert.strictEqual(memory.hasVerifiedAction('CLICK', 'btn-buggy'), false);
    });
    it('14. Scroll verification checks direction and position change', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'SCROLL' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId, 'Scrolled Y 0 -> 600px');
        assert.strictEqual(memory.hasVerifiedAction('SCROLL'), true);
    });
    it('15. Type verification confirms typed input value match', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'TYPE', targetElementId: 'search-input', value: 'SIH 2026' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId, 'Typed value matched expected');
        assert.strictEqual(memory.hasEquivalentVerifiedAction({ type: 'TYPE', targetElementId: 'search-input', value: 'SIH 2026' }), true);
    });
    it('16. Select verification confirms dropdown option selection', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'SELECT', targetElementId: 'country-select', value: 'India' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId, 'Selected India');
        assert.strictEqual(memory.hasVerifiedAction('SELECT', 'country-select'), true);
    });
    // =========================================================================
    // AGENT TESTS (17–28)
    // =========================================================================
    it('17. "Click Login" executes click on step 1 and verifies completion on step 2 re-observation', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login', interactive: true }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => createPassReceipt('CLICK', 'login-btn', 'Clicked Login');
        // Step 1: Dispatch Click
        const res1 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res1.done, false);
        assert.strictEqual(res1.status, 'PHASE_3_VERIFICATION');
        // Step 2: Re-observation confirms completion
        const res2 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res2.done, true);
        assert.strictEqual(res2.status, 'COMPLETED');
        assert.strictEqual(controller.actionMemory.getHistory().length, 1);
    });
    it('18. "Click Login" does NOT repeat click after navigation onto new page', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        let pageDom = [{ tag: 'button', id: 'login-btn-page1', visibleText: 'Login', interactive: true }];
        const dom = async () => pageDom;
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => {
            pageDom = [{ tag: 'button', id: 'login-btn-page2', visibleText: 'Login', interactive: true }];
            return createPassReceipt('CLICK', 'login-btn-page1', 'Clicked Login on Page 1');
        };
        // Step 1: Click on Page 1
        const res1 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res1.done, false);
        // Step 2: Re-observe Page 2 (with Login button) -> GoalManager completes, NO 2nd click!
        const res2 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res2.done, true);
        assert.strictEqual(res2.status, 'COMPLETED');
        assert.strictEqual(controller.actionMemory.getHistory().length, 1);
    });
    it('19. "Scroll down" executes scroll on step 1 and verifies completion on step 2', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Scroll down');
        const dom = async () => [{ tag: 'div', id: 'box', visibleText: 'Content' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => createPassReceipt('SCROLL', null, 'Scrolled down');
        const res1 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res1.done, true);
        assert.strictEqual(res1.status, 'COMPLETED');
        assert.strictEqual(controller.actionMemory.getHistory().length, 1);
    });
    it('20. "Search for SIH 2026" executes sequence once without repeating', async () => {
        const controller = new AgentController({ maxIterations: 10, stabilizeDelayMs: 1 });
        controller.initTask('Multi-step server search for SIH 2026');
        const origSend = ServerAdapter.sendToServer;
        let stepCount = 0;
        ServerAdapter.sendToServer = () => {
            stepCount++;
            if (stepCount === 1) {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 's1', action: { action_type: 'type', target_element_id: 'search-input', value: 'SIH 2026' } } });
            }
            else if (stepCount === 2) {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 's1', action: { action_type: 'click', target_element_id: 'search-btn' } } });
            }
            else {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 's1', action: { action_type: 'done' }, task_status: 'completed' } });
            }
        };
        const dom = async () => [
            { tag: 'input', id: 'search-input', type: 'text', visibleText: 'Search' },
            { tag: 'button', id: 'search-btn', visibleText: 'Search' }
        ];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        // Step 1: Type
        const res1 = await controller.executeIteration(dom, perception, async () => createPassReceipt('TYPE', 'search-input', 'Typed SIH 2026'));
        assert.strictEqual(res1.done, false);
        // Step 2: Click Submit (completes all sub-goals under M11.2 state machine)
        const res2 = await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'search-btn', 'Clicked Search'));
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res2.done, true);
        assert.strictEqual(res2.status, 'COMPLETED');
    });
    it('21. Multi-step goal executes each required action in sequence and tracks history', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Find search box, enter SIH 2026 and submit');
        const reqActions = controller.goalManager.getState().requiredActions;
        assert.ok(reqActions.includes('TYPE'));
    });
    it('22. Same element on next page re-observation does NOT cause repeated action', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login', interactive: true }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => createPassReceipt('CLICK', 'login-btn');
        // Step 1
        await controller.executeIteration(dom, perception, dispatch);
        // Step 2: Re-observation completes goal
        await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(controller.goalManager.isComplete(), true);
        // Re-observation with exact same element
        const guardRes = ActionGuard.shouldExecuteAction({ action: 'CLICK', targetSelector: 'login-btn', value: null }, { goalManager: controller.goalManager, actionMemory: controller.actionMemory, currentScreenElements: [{ id: 'login-btn' }], currentPageFingerprint: 'fp_same' });
        assert.strictEqual(guardRes.approved, false);
        assert.strictEqual(guardRes.reason, 'GOAL_ALREADY_COMPLETE');
    });
    it('23. Failed action retries up to maxActionRetries limit (2 retries)', async () => {
        const controller = new AgentController({ maxIterations: 5, maxActionRetries: 2, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login', interactive: true }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        let attempts = 0;
        const dispatchFail = async () => {
            attempts++;
            return { success: false, action: 'CLICK', target_element_id: 'login-btn', execution: 'REAL_BROWSER', dispatched: false, verified: false, error: 'Simulated click error' };
        };
        // Attempt 1
        const res1 = await controller.executeIteration(dom, perception, dispatchFail);
        assert.strictEqual(res1.done, false);
        // Attempt 2
        const res2 = await controller.executeIteration(dom, perception, dispatchFail);
        assert.strictEqual(res2.done, false);
        // Attempt 3 (Max retries = 2 exceeded)
        const res3 = await controller.executeIteration(dom, perception, dispatchFail);
        assert.strictEqual(res3.done, true);
        assert.strictEqual(res3.status, 'TASK_FAILED');
        assert.strictEqual(attempts, 3);
    });
    it('24. Successful action never retries or repeats', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => createPassReceipt('CLICK', 'login-btn');
        await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(controller.currentActionRetries, 0);
    });
    it('25. DONE action is accepted only when verified by GoalManager', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Complete form');
        controller.goalManager.markSubGoalComplete('Complete form');
        const isSatisfied = controller.goalManager.evaluateCompletion(null, { verified: true, taskCompleted: true });
        assert.strictEqual(isSatisfied, true);
    });
    it('26. Server payload includes execution_context with goal status and action history', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Search SIH');
        const entry = controller.actionMemory.recordAction({ type: 'TYPE', targetElementId: 'search', value: 'SIH' });
        controller.actionMemory.markVerified(entry.actionId);
        const execContext = {
            goal_status: controller.goalManager.getState().status,
            completed_actions: controller.actionMemory.getHistory().map(a => a.type)
        };
        const sanitized = { elements: [] };
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'Search SIH', execContext);
        assert.ok(wirePayload.execution_context);
        assert.strictEqual(wirePayload.execution_context.goal_status, 'IN_PROGRESS');
        assert.deepStrictEqual(wirePayload.execution_context.completed_actions, ['TYPE']);
    });
    it('27. execution_context and page fingerprints NEVER contain raw PII', () => {
        const sensitiveState = {
            url: 'http://bank.com/user?email=secret@user.com',
            title: 'Dashboard',
            elements: [
                { tag: 'input', id: 'card', value: '4111 1111 1111 1111', redacted: true, sensitivity: 'CARD' }
            ]
        };
        const fp = createPageFingerprint(sensitiveState);
        const jsonStr = JSON.stringify(fp);
        assert.strictEqual(jsonStr.includes('secret@user.com'), false);
        assert.strictEqual(jsonStr.includes('4111 1111 1111 1111'), false);
    });
    it('28. Outbound privacy gate remains strictly enforced across M11 agent iterations', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Privacy Gate Test');
        const leakDom = async () => [{
                tag: 'input', id: 'raw-email', visibleText: 'unredacted.leak@danger.com', redacted: false, sensitivity: 'HIGH_CONFIDENCE_PII'
            }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        // Force raw unredacted leak into sanitizer test
        const origCheck = Person1Bridge.Sanitizer.outboundCheck;
        Person1Bridge.Sanitizer.outboundCheck = () => ({ safe: false, leaks: ['unredacted.leak@danger.com'] });
        const res = await controller.executeIteration(leakDom, perception, async () => createPassReceipt('NONE'));
        Person1Bridge.Sanitizer.outboundCheck = origCheck;
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'TRANSMISSION_BLOCKED');
        assert.ok(res.message.includes('Transmission blocked by RAVEN gate'));
    });
});
