import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { TaskIntentParser } from '../src/agent/taskIntent.js';
import { AgentController } from '../src/agent/agentController.js';
import { GoalManager } from '../src/agent/goalManager.js';
import { ActionMemory } from '../src/agent/actionMemory.js';
// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
    const mockWindow = { location: { href: 'http://localhost/test' } };
    const mockDoc = { title: 'M11.1 Test Page' };
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
describe('RAVEN M11.1 — Goal-to-Action Grounding & User Intent Provenance Test Suite', () => {
    it('TEST 1: Goal "Search \'gokul\'" extracts explicit value "gokul" with USER_GOAL provenance', () => {
        const intent = TaskIntentParser.parseGoal("Search 'gokul'");
        assert.strictEqual(intent.intent, 'SEARCH');
        assert.ok(intent.value);
        assert.strictEqual(intent.value?.value, 'gokul');
        assert.strictEqual(intent.value?.source, 'USER_GOAL');
        assert.strictEqual(intent.value?.confidence, 1.0);
    });
    it('TEST 2: Goal "Search \'SIH 2026\'" extracts explicit value "SIH 2026"', () => {
        const intent = TaskIntentParser.parseGoal("Search 'SIH 2026'");
        assert.strictEqual(intent.intent, 'SEARCH');
        assert.strictEqual(intent.value?.value, 'SIH 2026');
        assert.strictEqual(intent.value?.source, 'USER_GOAL');
    });
    it('TEST 3: Previous task "Search SIH 2026" does NOT leak into current task "Search gokul"', () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        // Task 1: SIH 2026
        controller.initTask('Search SIH 2026');
        assert.strictEqual(controller.currentTaskIntent?.value?.value, 'SIH 2026');
        const task1Id = controller.taskId;
        // Task 2: gokul
        controller.initTask("Find the search box, search 'gokul'");
        const task2Id = controller.taskId;
        assert.notStrictEqual(task1Id, task2Id);
        assert.strictEqual(controller.currentTaskIntent?.value?.value, 'gokul');
        assert.strictEqual(controller.actionMemory.getHistory().length, 0);
    });
    it('TEST 4: Goal "Search \'gokul\'" rejects or overrides server proposing "SIH 2026"', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask("Find the search box, search 'gokul'");
        const origSend = ServerAdapter.sendToServer;
        ServerAdapter.sendToServer = () => Promise.resolve({
            ok: true, status: 200,
            body: { session_id: 's1', action: { action_type: 'type', target_element_id: 'search-input', value: 'SIH 2026' } }
        });
        const dom = async () => [{ tag: 'input', id: 'search-input', type: 'text', visibleText: 'Search' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        let dispatchedValue = '';
        const dispatch = async (cmd) => {
            dispatchedValue = cmd.value;
            return createPassReceipt('TYPE', 'search-input', `Typed "${cmd.value}"`);
        };
        await controller.executeIteration(dom, perception, dispatch);
        ServerAdapter.sendToServer = origSend;
        // Value must be overridden to 'gokul'
        assert.strictEqual(dispatchedValue, 'gokul');
    });
    it('TEST 5: Goal "Search gokul" with input containing "gokul" evaluates TYPE verification PASS', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'TYPE', targetElementId: 'search-input', value: 'gokul' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId, 'Typed value matched expected');
        assert.strictEqual(memory.hasEquivalentVerifiedAction({ type: 'TYPE', targetElementId: 'search-input', value: 'gokul' }), true);
    });
    it('TEST 6: Goal "Search gokul" with input containing "SIH 2026" evaluates TYPE verification FAIL', () => {
        const memory = new ActionMemory();
        const entry = memory.recordAction({ type: 'TYPE', targetElementId: 'search-input', value: 'SIH 2026' });
        memory.markExecuted(entry.actionId);
        memory.markVerified(entry.actionId, 'Typed value matched expected');
        // Querying for 'gokul' against 'SIH 2026' must fail
        assert.strictEqual(memory.hasEquivalentVerifiedAction({ type: 'TYPE', targetElementId: 'search-input', value: 'gokul' }), false);
    });
    it('TEST 7: Goal "Search gokul" with page change but no evidence of "gokul" does NOT mark complete', () => {
        const gm = new GoalManager();
        gm.initialize("Search 'gokul'");
        // Page state without 'gokul'
        const pageStateWithoutGokul = {
            elements: [{ tag: 'div', id: 'unrelated', visibleText: 'Unrelated content' }]
        };
        const isComplete = gm.evaluateCompletion(pageStateWithoutGokul);
        assert.strictEqual(isComplete, false);
        assert.strictEqual(gm.isComplete(), false);
    });
    it('TEST 8: Goal "Search gokul" with search verified completes with explicit semantic reason', async () => {
        const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
        controller.initTask("Find the search box, search 'gokul'");
        const origSend = ServerAdapter.sendToServer;
        let step = 0;
        ServerAdapter.sendToServer = () => {
            step++;
            if (step === 1) {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 's1', action: { action_type: 'type', target_element_id: 'search-input', value: 'SIH 2026' } } });
            }
            else {
                return Promise.resolve({ ok: true, status: 200, body: { session_id: 's1', action: { action_type: 'done' }, task_status: 'completed' } });
            }
        };
        const dom = async () => [{ tag: 'input', id: 'search-input', type: 'text', visibleText: 'gokul', value: 'gokul' }];
        const perception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
        const dispatch = async () => createPassReceipt('TYPE', 'search-input', 'Typed gokul into search');
        // Step 1: Type gokul
        const res1 = await controller.executeIteration(dom, perception, dispatch);
        assert.strictEqual(res1.done, false);
        // Step 2: Server signals done / re-observation confirms completion for gokul
        const res2 = await controller.executeIteration(dom, perception, dispatch);
        ServerAdapter.sendToServer = origSend;
        assert.strictEqual(res2.done, true);
        assert.strictEqual(res2.status, 'COMPLETED');
        assert.ok(res2.message.includes('gokul'));
    });
});
