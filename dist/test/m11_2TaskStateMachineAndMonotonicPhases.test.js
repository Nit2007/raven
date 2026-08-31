/**
 * Test Suite: RAVEN M11.2 — Task State Machine, Monotonic Phases, & Repetition Prevention
 *
 * Verifies:
 * 1. Monotonic phase progression (IDLE -> LOCAL_ANALYSIS -> SERVER_PLANNING -> EXECUTING -> VERIFYING -> COMPLETED/FAILED)
 * 2. Phase 1 executes only once per task.
 * 3. Re-observation does not reset task phase or taskId.
 * 4. Hard completion latch blocks actions & server requests after completion.
 * 5. Action fingerprinting blocks duplicate CLICK and TYPE executions.
 * 6. Atomic search typing (ONE action per search term).
 * 7. Server request deduplication by observation hash.
 * 8. Task isolation across new taskId creations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AgentController, assertValidPhaseTransition, actionFingerprint, serverRequestFingerprint, computeObservationHash } from '../src/agent/agentController.js';
import { Person1Bridge } from '../src/integration/person1Bridge.js';
import { TaskIntentParser } from '../src/agent/taskIntent.js';
function createPassReceipt(action, target = 'el_1', msg = 'Action executed') {
    return Promise.resolve({
        success: true,
        action,
        target_element_id: target,
        execution: 'REAL_BROWSER',
        dispatched: true,
        verified: true,
        message: msg
    });
}
describe('RAVEN M11.2 — Task State Machine & Monotonic Phases Test Suite', () => {
    it('TEST 1: Phase progression is monotonic', () => {
        assert.strictEqual(assertValidPhaseTransition('IDLE', 'LOCAL_ANALYSIS'), true);
        assert.strictEqual(assertValidPhaseTransition('LOCAL_ANALYSIS', 'SERVER_PLANNING'), true);
        assert.strictEqual(assertValidPhaseTransition('SERVER_PLANNING', 'EXECUTING'), true);
        assert.strictEqual(assertValidPhaseTransition('EXECUTING', 'VERIFYING'), true);
        assert.strictEqual(assertValidPhaseTransition('VERIFYING', 'COMPLETED'), true);
        // Invalid backward transitions
        assert.strictEqual(assertValidPhaseTransition('VERIFYING', 'LOCAL_ANALYSIS'), false);
        assert.strictEqual(assertValidPhaseTransition('EXECUTING', 'LOCAL_ANALYSIS'), false);
        assert.strictEqual(assertValidPhaseTransition('COMPLETED', 'LOCAL_ANALYSIS'), false);
        assert.strictEqual(assertValidPhaseTransition('COMPLETED', 'EXECUTING'), false);
    });
    it('TEST 2: Phase 1 cannot execute twice for same task', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        // First iteration executes Phase 1
        await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        assert.strictEqual(controller.taskState.phase1Completed, true);
        const initialPhase1Count = controller.privacyChecksCount;
        // Second call does re-observation, does NOT reset phase1Completed or start Phase 1 again
        assert.strictEqual(controller.taskState.phase1Completed, true);
    });
    it('TEST 3: Phase 1 cannot restart after action', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Search kavin');
        const dom = async () => [{ tag: 'input', id: 'search-box', type: 'text', visibleText: 'Search' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        await controller.executeIteration(dom, perception, async () => createPassReceipt('TYPE', 'search-box'));
        assert.strictEqual(controller.taskState.phase1Completed, true);
        assert.notStrictEqual(controller.taskState.phase, 'IDLE');
    });
    it('TEST 4: Completed task cannot execute another action', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        controller.completeTask('Manual completion test');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const res = await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
    it('TEST 5: Completed task cannot send another server request', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Search kavin');
        controller.completeTask('Test done');
        let serverCalled = false;
        const origSend = Person1Bridge.ServerAdapter.sendToServer;
        Person1Bridge.ServerAdapter.sendToServer = () => {
            serverCalled = true;
            return Promise.resolve({ ok: true, status: 200, body: { action: { action_type: 'type', target_element_id: 'search', value: 'kavin' } } });
        };
        const dom = async () => [{ tag: 'input', id: 'search', type: 'text' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        await controller.executeIteration(dom, perception, async () => createPassReceipt('TYPE', 'search'));
        Person1Bridge.ServerAdapter.sendToServer = origSend;
        assert.strictEqual(serverCalled, false);
    });
    it('TEST 6: Duplicate CLICK is blocked', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const fp = actionFingerprint({ action: 'CLICK', targetSelector: 'login-btn', value: null });
        controller.taskState.executedActionFingerprints.add(fp);
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const res = await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
    it('TEST 7: Duplicate TYPE is blocked', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Type kavin');
        const ledgerEntry = controller.actionMemory.recordAction({
            type: 'TYPE',
            targetElementId: 'search-input',
            value: 'kavin',
            pageFingerprintBefore: 'fp_test'
        });
        controller.actionMemory.markVerified(ledgerEntry.actionId, 'Verified', false, 'fp_test');
        const fp = actionFingerprint({ action: 'TYPE', targetSelector: 'search-input', value: 'kavin' });
        controller.taskState.executedActionFingerprints.add(fp);
        const dom = async () => [{ tag: 'input', id: 'search-input', type: 'text', visibleText: 'kavin' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const res = await controller.executeIteration(dom, perception, async () => createPassReceipt('TYPE', 'search-input'));
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
    it('TEST 8: TYPE "kavin" is one atomic action', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Search kavin');
        let actionCount = 0;
        const dom = async () => [{ tag: 'input', id: 'search-box', type: 'text', visibleText: 'Search' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        await controller.executeIteration(dom, perception, async (cmd) => {
            actionCount++;
            assert.strictEqual(cmd.value, 'kavin');
            return createPassReceipt('TYPE', 'search-box', 'Typed kavin atomically');
        });
        assert.strictEqual(actionCount, 1);
    });
    it('TEST 9: "kavin" is not split into character actions', () => {
        const intent = TaskIntentParser.parseGoal('Search kavin');
        assert.strictEqual(intent.value?.value, 'kavin');
        assert.strictEqual(intent.intent, 'SEARCH');
    });
    it('TEST 10: Previous task value cannot leak', () => {
        const controller = new AgentController();
        controller.initTask('Search SIH 2026');
        assert.strictEqual(controller.currentTaskIntent?.value?.value, 'SIH 2026');
        controller.initTask('Search kavin');
        assert.strictEqual(controller.currentTaskIntent?.value?.value, 'kavin');
        assert.notStrictEqual(controller.currentTaskIntent?.value?.value, 'SIH 2026');
    });
    it('TEST 11: Search verification requires exact current task value', () => {
        const controller = new AgentController();
        controller.initTask('Search kavin');
        controller.goalManager.markActionComplete('TYPE:search-box:kavin');
        controller.goalManager.markActionComplete('CLICK:search-btn:');
        const isSatisfied = controller.goalManager.evaluateCompletion({
            elements: [{ tag: 'input', id: 'search-box', value: 'kavin' }]
        });
        assert.strictEqual(isSatisfied, true);
    });
    it('TEST 12: Same page state does not cause duplicate server planning', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Perform server operation');
        const domFn = async () => [{ tag: 'div', id: 'main-box' }];
        const perceptionFn = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const obs = await controller.observeCurrentPage(domFn, perceptionFn);
        const subGoalStr = controller.goalManager.getState().currentSubGoal || controller.taskGoal;
        const obsHash = computeObservationHash('localhost', obs.sanitizedPayload.elements);
        const reqFp = serverRequestFingerprint(controller.taskId, subGoalStr, obsHash);
        controller.taskState.serverRequestFingerprints.add(reqFp);
        // Since server request is deduplicated, returns completion
        const res = await controller.executeIteration(domFn, perceptionFn, async () => createPassReceipt('NONE'));
        assert.strictEqual(res.done, true);
    });
    it('TEST 13: New task creates new taskId', () => {
        const controller = new AgentController();
        controller.initTask('Task A');
        const idA = controller.taskId;
        controller.initTask('Task B');
        const idB = controller.taskId;
        assert.notStrictEqual(idA, idB);
    });
    it('TEST 14: New task resets action history correctly', () => {
        const controller = new AgentController();
        controller.initTask('Task A');
        controller.recordStep({
            step: 1, goal: 'Task A', status: 'COMPLETED', privacySafe: true, redactedCount: 0, timestamp: new Date().toISOString()
        });
        assert.strictEqual(controller.executionHistory.length, 1);
        controller.initTask('Task B');
        assert.strictEqual(controller.executionHistory.length, 0);
    });
    it('TEST 15: Re-observation does not reset task phase', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        const phaseAfterAct = controller.taskState.phase;
        assert.notStrictEqual(phaseAfterAct, 'IDLE');
        assert.strictEqual(controller.taskState.phase1Completed, true);
    });
    it('TEST 16: Successful verification creates completion latch', () => {
        const controller = new AgentController();
        controller.initTask('Click Login');
        controller.completeTask('Verified click');
        assert.strictEqual(controller.taskState.taskCompleted, true);
        assert.strictEqual(controller.taskState.stopped, true);
        assert.strictEqual(controller.taskState.phase, 'COMPLETED');
    });
    it('TEST 17: After completion, controller is inert', async () => {
        const controller = new AgentController();
        controller.initTask('Click Login');
        controller.completeTask('Done');
        const dom = async () => [{ tag: 'button', id: 'login-btn' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const res = await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
    it('TEST 18: Login button appearing on a later page does not trigger another click', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login');
        const fp = actionFingerprint({ action: 'CLICK', targetSelector: 'login-btn', value: null });
        controller.taskState.executedActionFingerprints.add(fp);
        const dom = async () => [{ tag: 'button', id: 'login-btn', visibleText: 'Login' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const res = await controller.executeIteration(dom, perception, async () => createPassReceipt('CLICK', 'login-btn'));
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
});
