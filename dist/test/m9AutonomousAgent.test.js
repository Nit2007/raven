import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { Person1Bridge } from '../src/integration/person1Bridge.js';
import { AgentController } from '../src/agent/agentController.js';
import { ActionExecutor } from '../src/agent/actionExecutor.js';
// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
    const mockWindow = { location: { href: 'http://localhost/test' } };
    const mockDoc = { title: 'M9 Test Page' };
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
describe('RAVEN M9 — Full Autonomous Browser Agent Execution Loop Test Suite', () => {
    it('1. Server command validator approves valid raw actions', () => {
        const screenElements = [{ id: 'input-query', type: 'input', text: 'Search' }];
        const rawAction = { action_type: 'type', target_element_id: 'input-query', value: 'SIH 2026' };
        const val = ActionExecutor.validateAction(rawAction, screenElements);
        assert.strictEqual(val.valid, true);
        assert.strictEqual(val.command.action, 'TYPE');
        assert.strictEqual(val.command.value, 'SIH 2026');
    });
    it('2. Server command validator rejects hallucinated target element IDs', () => {
        const screenElements = [{ id: 'btn-search', type: 'button', text: 'Search' }];
        const rawAction = { action_type: 'click', target_element_id: 'fake-ghost-button-999' };
        const val = ActionExecutor.validateAction(rawAction, screenElements);
        assert.strictEqual(val.valid, false);
        assert.ok(val.errors.some(e => e.includes('not present in the currently analyzed page state')));
    });
    it('3. Action executor dispatches validated command to real browser callback', async () => {
        const command = { action: 'TYPE', targetSelector: 'input-query', value: 'SIH 2026', reasoning: 'Typing search query' };
        const receipt = await ActionExecutor.executeValidatedAction(command, async (cmd) => {
            assert.strictEqual(cmd.targetSelector, 'input-query');
            assert.strictEqual(cmd.value, 'SIH 2026');
            return createPassReceipt('TYPE', 'input-query', 'Typed "SIH 2026" into target');
        });
        assert.strictEqual(receipt.success, true);
        assert.strictEqual(receipt.execution, 'REAL_BROWSER');
        assert.strictEqual(receipt.dispatched, true);
        assert.strictEqual(receipt.verified, true);
    });
    it('4. Single-iteration execution loop processes perception, redacts PII, and runs action', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login button');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true,
            status: 200,
            body: {
                session_id: 'ss-test-1',
                action: { action_type: 'click', target_element_id: 'btn-search' },
                task_status: 'in_progress'
            }
        });
        const mockDom = async () => [{ tag: 'button', id: 'btn-search', visibleText: 'Search', interactive: true }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('CLICK', 'btn-search', 'Click executed on #btn-search');
        const result = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(result.done, false);
        assert.ok(result.status === 'VERIFYING' || result.status === 'PHASE_3_VERIFICATION');
        assert.strictEqual(controller.executionHistory.length, 1);
        assert.strictEqual(controller.executionHistory[0].actionTaken, 'CLICK');
    });
    it('5. Privacy gate blocks transmission if unredacted PII is present in screen state', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Privacy block test');
        const mockLeakDom = async () => [{
                tag: 'input', id: 'leak-email', visibleText: 'unredacted.leak@danger.com', redacted: false, sensitivity: 'NONE'
            }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('NONE');
        // Force raw unredacted leak into sanitizer check
        const Sanitizer = Person1Bridge.Sanitizer;
        const origCheck = Sanitizer.outboundCheck;
        Sanitizer.outboundCheck = () => ({ safe: false, leaks: ['unredacted.leak@danger.com'] });
        const result = await controller.executeIteration(mockLeakDom, mockPerception, mockDispatch);
        Sanitizer.outboundCheck = origCheck;
        assert.ok(result.done);
        assert.ok(result.status === 'TRANSMISSION_BLOCKED' || result.status === 'FAILED');
        assert.ok(result.message.includes('Transmission blocked by RAVEN gate'));
        assert.strictEqual(controller.executionHistory[0].privacySafe, false);
    });
    it('6. Server 400 rejection stops execution loop safely', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Server error test');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: false, status: 400, body: { error: 'Bad Request / Security Violation' }
        });
        const mockDom = async () => [{ tag: 'div', id: 'box', visibleText: 'Test Box' }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('NONE');
        const result = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.ok(result.done);
        assert.ok(result.status === 'ACTION_REJECTED' || result.status === 'FAILED');
        assert.ok(result.message.includes('Server rejected request'));
    });
    it('7. Server network failure stops execution loop gracefully', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Server down test');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({ ok: false, status: 503, body: null });
        const mockDom = async () => [{ tag: 'div', id: 'box', visibleText: 'Test Box' }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('NONE');
        const result = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.ok(result.done);
        assert.ok(result.status === 'SERVER_UNAVAILABLE' || result.status === 'FAILED');
        assert.ok(result.message.includes('Cannot reach RAVEN server'));
    });
    it('8. Server hallucinated element ID stops iteration with TARGET_NOT_FOUND', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Hallucination guard test');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 'ss-hallucinate', action: { action_type: 'click', target_element_id: 'non-existent-button-999' }, task_status: 'in_progress' }
        });
        const mockDom = async () => [{ tag: 'button', id: 'real-btn-1', visibleText: 'Real Button' }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('NONE');
        const result = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.ok(result.done);
        assert.ok(result.status === 'TARGET_NOT_FOUND' || result.status === 'FAILED');
        assert.ok(result.message.includes('validation failed'));
    });
    it('9. Execution dispatch failure stops loop with TASK_FAILED', async () => {
        const controller = new AgentController({ maxIterations: 5, maxActionRetries: 0, stabilizeDelayMs: 1 });
        controller.initTask('Generic step task');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 'ss-dispatch-fail', action: { action_type: 'click', target_element_id: 'btn-buggy' }, task_status: 'in_progress' }
        });
        const mockDom = async () => [{ tag: 'button', id: 'btn-buggy', visibleText: 'Buggy Button' }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockFailDispatch = async () => ({
            success: false,
            action: 'CLICK',
            target_element_id: 'btn-buggy',
            execution: 'REAL_BROWSER',
            dispatched: false,
            verified: false,
            error: 'Simulated click failure'
        });
        const result = await controller.executeIteration(mockDom, mockPerception, mockFailDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.ok(result.done);
        assert.ok(result.status === 'TASK_FAILED' || result.status === 'FAILED');
        assert.ok(result.message.includes('Action execution failed'));
    });
    it('10. Maximum iteration guard stops loop after maxIterations (10 steps)', async () => {
        const controller = new AgentController({ maxIterations: 2, stabilizeDelayMs: 1 });
        controller.initTask('Find search input, type query, and submit');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => {
            const stepNum = controller.currentIteration;
            if (stepNum === 1) {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 'ss-loop', action: { action_type: 'type', target_element_id: 'box-1', value: 'input' }, task_status: 'in_progress' } });
            }
            else {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 'ss-loop', action: { action_type: 'click', target_element_id: 'box-2' }, task_status: 'in_progress' } });
            }
        };
        const mockDom = async () => [
            { tag: 'input', id: 'box-1', visibleText: 'Input' },
            { tag: 'button', id: 'box-2', visibleText: 'Next' }
        ];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async (cmd) => createPassReceipt(cmd.action, cmd.targetSelector, 'Executed');
        // Step 1
        const res1 = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        assert.strictEqual(res1.done, false);
        // Step 2
        const res2 = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        assert.strictEqual(res2.done, false);
        // Step 3 (Exceeds maxIterations = 2)
        const res3 = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res3.done, true);
        assert.ok(res3.status === 'MAX_STEPS_REACHED' || res3.status === 'TASK_FAILED');
        assert.ok(res3.message?.includes('maximum agent steps reached'));
    });
    it('11. Navigation / re-observation refreshes screen state between steps', async () => {
        const controller = new AgentController({ maxIterations: 3, stabilizeDelayMs: 1 });
        controller.initTask('Find link to page 2, click link, and verify page 2 form');
        let currentDom = [{ tag: 'a', id: 'link-page2', visibleText: 'Go to Page 2', interactive: true }];
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = (payload) => {
            const targetId = payload.screen_state.elements[0]?.id;
            return Promise.resolve({
                ok: true, status: 200,
                body: { session_id: 'ss-nav', action: { action_type: 'click', target_element_id: targetId }, task_status: 'in_progress' }
            });
        };
        // Step 1: Click link on Page 1
        const res1 = await controller.executeIteration(async () => currentDom, async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }), async () => {
            // Navigation occurs! Page 2 loaded
            currentDom = [{ tag: 'button', id: 'btn-submit-page2', visibleText: 'Submit Form 2', interactive: true }];
            return createPassReceipt('CLICK', 'link-page2', 'Navigated to Page 2');
        });
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res1.done, false);
        assert.strictEqual(controller.currentIteration, 2);
        assert.strictEqual(currentDom[0].id, 'btn-submit-page2');
    });
    it('12. Privacy gate executes on EVERY iteration step', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Find multi-step form, enter step 1, and enter step 2');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = (payload) => {
            const stepNum = controller.currentIteration;
            return Promise.resolve({
                ok: true, status: 200,
                body: { session_id: 'ss-priv', action: { action_type: 'click', target_element_id: 'btn-' + stepNum }, task_status: 'in_progress' }
            });
        };
        const mockDom = async () => [
            { tag: 'button', id: 'btn-1', visibleText: 'Next 1', interactive: true },
            { tag: 'button', id: 'btn-2', visibleText: 'Next 2', interactive: true }
        ];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async (cmd) => createPassReceipt('CLICK', cmd.targetSelector, 'Clicked');
        await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.ok(controller.privacyChecksCount >= 2);
    });
    it('13. PII never reaches server across any iteration step', async () => {
        const rawDom = [
            { tag: 'input', name: 'card', value: '4111 1111 1111 1111' },
            { tag: 'input', name: 'phone', value: '+91 9876543210' }
        ];
        const classified = Person1Bridge.SensitivityDetector.classifyElements(rawDom);
        const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
        const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
        const wirePayload = Person1Bridge.ServerAdapter.buildOutboundPayload(sanitized, 'Test PII protection');
        const json = JSON.stringify(wirePayload);
        assert.strictEqual(json.includes('4111 1111 1111 1111'), false);
        assert.strictEqual(json.includes('+91 9876543210'), false);
    });
    it('14. Successful multi-step task execution loop (Step 1: Type -> Step 2: Click -> Step 3: Complete)', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Find search box, enter SIH 2026, and submit');
        let currentDomState = [
            { tag: 'input', type: 'text', id: 'search-box', placeholder: 'Search...' },
            { tag: 'button', type: 'submit', id: 'search-btn', visibleText: 'Search' }
        ];
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => {
            const stepNum = controller.currentIteration;
            if (stepNum === 1) {
                return Promise.resolve({
                    ok: true, status: 200,
                    body: { session_id: 'ss-multi', action: { action_type: 'type', target_element_id: 'search-box', value: 'SIH 2026' }, task_status: 'in_progress' }
                });
            }
            else if (stepNum === 2) {
                return Promise.resolve({
                    ok: true, status: 200,
                    body: { session_id: 'ss-multi', action: { action_type: 'click', target_element_id: 'search-btn' }, task_status: 'in_progress' }
                });
            }
            else {
                return Promise.resolve({
                    ok: true, status: 200,
                    body: { session_id: 'ss-multi', action: { action_type: 'done', reasoning: 'Search completed successfully' }, task_status: 'completed' }
                });
            }
        };
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        // Step 1 Execution (TYPE)
        const step1 = await controller.executeIteration(async () => currentDomState, mockPerception, async (cmd) => createPassReceipt('TYPE', 'search-box', `Typed "${cmd.value}" into search-box`));
        assert.strictEqual(step1.done, false);
        // Step 2 Execution (CLICK)
        const step2 = await controller.executeIteration(async () => currentDomState, mockPerception, async () => createPassReceipt('CLICK', 'search-btn', 'Search button clicked'));
        assert.strictEqual(step2.done, false);
        // Step 3 Execution (COMPLETED)
        const step3 = await controller.executeIteration(async () => currentDomState, mockPerception, async () => createPassReceipt('DONE'));
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(step3.done, true);
        assert.strictEqual(step3.success, true);
        assert.strictEqual(step3.status, 'COMPLETED');
    });
    it('15. Failed multi-step task stops gracefully when target element is missing', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click non-existent button');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 'ss-fail', action: { action_type: 'click', target_element_id: 'ghost-button-777' }, task_status: 'in_progress' }
        });
        const res = await controller.executeIteration(async () => [{ tag: 'div', id: 'real-container', visibleText: 'Text' }], async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }), async () => createPassReceipt('CLICK', 'ghost-button-777'));
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'TARGET_NOT_FOUND');
    });
    it('16. Task completion verification from newly observed page state', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Verify task completion');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 'ss-verify', action: { action_type: 'done', reasoning: 'Form submitted and confirmation text verified' }, task_status: 'completed' }
        });
        const res = await controller.executeIteration(async () => [{ tag: 'h1', visibleText: 'Submission Successful' }], async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }), async () => createPassReceipt('DONE'));
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res.done, true);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'COMPLETED');
    });
    it('17. Completion Honesty — Dispatched action does NOT mark task completed until re-observation confirms', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask('Click Login button');
        const ServerAdapter = Person1Bridge.ServerAdapter;
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 'ss-honest', action: { action_type: 'click', target_element_id: 'btn-login' }, task_status: 'in_progress' }
        });
        const mockDom = async () => [{ tag: 'button', id: 'btn-login', visibleText: 'Login' }];
        const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const mockDispatch = async () => createPassReceipt('CLICK', 'btn-login', 'Dispatched real browser click');
        const res1 = await controller.executeIteration(mockDom, mockPerception, mockDispatch);
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res1.done, false);
        assert.strictEqual(res1.status, 'PHASE_3_VERIFICATION');
    });
});
