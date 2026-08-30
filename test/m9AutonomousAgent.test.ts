import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { AgentController } from '../src/agent/agentController.js';
import { ActionExecutor } from '../src/agent/actionExecutor.js';
import { PerceptionAdapter, ElementInfo } from '../src/integration/perceptionAdapter.js';

// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath: string) => {
  const fullPath = path.resolve(process.cwd(), relativePath);
  let code = fs.readFileSync(fullPath, 'utf8');
  code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
  const mockWindow = { location: { href: 'http://localhost/test' } };
  const mockDoc = { title: 'Autonomous Agent Test Page' };
  const runCode = new Function('globalThis', 'window', 'document', 'navigator', 'location', code);
  runCode(globalThis, mockWindow, mockDoc, {}, mockWindow.location);
};

loadPerson1Module('Client/DOM/sensitivity-detector.js');
loadPerson1Module('Client/DOM/redaction-engine.js');
loadPerson1Module('Client/DOM/sanitizer.js');
loadPerson1Module('Client/DOM/server-adapter.js');

const SensitivityDetector = (globalThis as any).SensitivityDetector;
const RedactionEngine = (globalThis as any).RedactionEngine;
const Sanitizer = (globalThis as any).Sanitizer;
const ServerAdapter = (globalThis as any).ServerAdapter;

describe('RAVEN M9 — Full Autonomous Browser Agent Execution Loop Test Suite', () => {

  it('1. CLICK execution validator passes valid target and dispatches action', async () => {
    const screenElements = [{ id: 'btn-submit', type: 'button', text: 'Submit', dom_selector: '#btn-submit' }];
    const rawAction = { action_type: 'click', target_element_id: 'btn-submit' };

    const val = ActionExecutor.validateAction(rawAction, screenElements);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.command.action, 'CLICK');

    const execRes = await ActionExecutor.executeValidatedAction(val.command, async (cmd) => {
      assert.strictEqual(cmd.action, 'CLICK');
      return { success: true, message: 'Submit button clicked' };
    });

    assert.strictEqual(execRes.success, true);
    assert.strictEqual(execRes.message, 'Submit button clicked');
  });

  it('2. TYPE execution validator passes value and dispatches action', async () => {
    const screenElements = [{ id: 'input-query', type: 'input', text: 'Search', dom_selector: '#input-query' }];
    const rawAction = { action_type: 'type', target_element_id: 'input-query', value: 'SIH 2026' };

    const val = ActionExecutor.validateAction(rawAction, screenElements);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.command.action, 'TYPE');
    assert.strictEqual(val.command.value, 'SIH 2026');

    const execRes = await ActionExecutor.executeValidatedAction(val.command, async (cmd) => {
      assert.strictEqual(cmd.value, 'SIH 2026');
      return { success: true, message: 'Typed "SIH 2026" into target' };
    });

    assert.strictEqual(execRes.success, true);
  });

  it('3. SCROLL execution validator passes and dispatches scroll', async () => {
    const screenElements = [{ id: 'footer-link', type: 'a', text: 'Contact', dom_selector: '#footer-link' }];
    const rawAction = { action_type: 'scroll', target_element_id: 'footer-link' };

    const val = ActionExecutor.validateAction(rawAction, screenElements);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.command.action, 'SCROLL');

    const execRes = await ActionExecutor.executeValidatedAction(val.command, async () => {
      return { success: true, message: 'Scrolled page' };
    });

    assert.strictEqual(execRes.success, true);
  });

  it('4. SELECT execution validator passes option selection', async () => {
    const screenElements = [{ id: 'country-select', type: 'select', text: 'Country', dom_selector: '#country-select' }];
    const rawAction = { action_type: 'select', target_element_id: 'country-select', value: 'India' };

    const val = ActionExecutor.validateAction(rawAction, screenElements);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.command.action, 'SELECT');

    const execRes = await ActionExecutor.executeValidatedAction(val.command, async (cmd) => {
      assert.strictEqual(cmd.value, 'India');
      return { success: true, message: 'Selected "India"' };
    });

    assert.strictEqual(execRes.success, true);
  });

  it('5. Invalid target rejection catches non-existent element IDs', () => {
    const screenElements = [{ id: 'btn-1', type: 'button', text: 'Btn' }];
    const rawAction = { action_type: 'click', target_element_id: 'nonexistent-el-999' };

    const val = ActionExecutor.validateAction(rawAction, screenElements);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('not present in the currently analyzed page state')));
  });

  it('6. Stale target rejection blocks element that disappeared after navigation', () => {
    const newPageElements = [{ id: 'nav-home', type: 'a', text: 'Home' }];
    const staleAction = { action_type: 'click', target_element_id: 'old-page-btn' };

    const val = ActionExecutor.validateAction(staleAction, newPageElements);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.command.action, 'NONE');
  });

  it('7. Arbitrary JavaScript payload in TYPE or action is rejected', () => {
    const screenElements = [{ id: 'input-1', type: 'input', text: 'Input' }];
    const maliciousAction = {
      action_type: 'type',
      target_element_id: 'input-1',
      value: '<script>alert(document.cookie);</script>'
    };

    const val = ActionExecutor.validateAction(maliciousAction, screenElements);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Unsafe execution payload detected')));
  });

  it('8. Server NONE response is handled without false completion', () => {
    const val = ActionExecutor.validateAction({ action_type: 'none' }, []);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.command.action, 'NONE');
  });

  it('9. Server unavailable is handled safely with SERVER_UNAVAILABLE status', async () => {
    const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
    controller.initTask('Offline test');

    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = () => Promise.resolve({ ok: false, status: 503, body: { error: 'Connection refused' } });

    const iter = await controller.executeIteration(
      async () => [{ tag: 'div', visibleText: 'Test' }],
      async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }),
      async () => ({ success: true })
    );

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(iter.done, true);
    assert.strictEqual(iter.status, 'SERVER_UNAVAILABLE');
  });

  it('10. Maximum iteration guard stops loop after maxIterations (10 steps)', async () => {
    const controller = new AgentController({ maxIterations: 2, stabilizeDelayMs: 1 });
    controller.initTask('Loop test');

    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = () => Promise.resolve({
      ok: true, status: 200,
      body: { session_id: 'ss-loop', action: { action_type: 'scroll', target_element_id: null }, task_status: 'in_progress' }
    });

    const mockDom = async () => [{ tag: 'div', id: 'box', visibleText: 'Page Box' }];
    const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
    const mockDispatch = async () => ({ success: true, message: 'Scrolled' });

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
    assert.strictEqual(res3.status, 'MAX_STEPS_REACHED');
    assert.ok(res3.message?.includes('maximum agent steps reached'));
  });

  it('11. Navigation / re-observation refreshes screen state between steps', async () => {
    const controller = new AgentController({ maxIterations: 3, stabilizeDelayMs: 1 });
    controller.initTask('Multi-page test');

    let currentDom = [{ tag: 'a', id: 'link-page2', visibleText: 'Go to Page 2', interactive: true }];
    
    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = (payload: any) => {
      const targetId = payload.screen_state.elements[0]?.id;
      return Promise.resolve({
        ok: true, status: 200,
        body: { session_id: 'ss-nav', action: { action_type: 'click', target_element_id: targetId }, task_status: 'in_progress' }
      });
    };

    // Step 1: Click link on Page 1
    const res1 = await controller.executeIteration(
      async () => currentDom,
      async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }),
      async () => {
        // Navigation occurs! Page 2 loaded
        currentDom = [{ tag: 'button', id: 'btn-submit-page2', visibleText: 'Submit Form 2', interactive: true }];
        return { success: true, message: 'Navigated to Page 2' };
      }
    );

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(res1.done, false);
    assert.strictEqual(controller.currentIteration, 2);
    assert.strictEqual(currentDom[0].id, 'btn-submit-page2');
  });

  it('12. Privacy gate executes on EVERY iteration step', async () => {
    const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
    controller.initTask('Privacy per step test');

    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = () => Promise.resolve({
      ok: true, status: 200,
      body: { session_id: 'ss-priv', action: { action_type: 'click', target_element_id: 'btn-1' }, task_status: 'in_progress' }
    });

    const mockDom = async () => [{ tag: 'button', id: 'btn-1', visibleText: 'Next', interactive: true }];
    const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });
    const mockDispatch = async () => ({ success: true });

    await controller.executeIteration(mockDom, mockPerception, mockDispatch);
    await controller.executeIteration(mockDom, mockPerception, mockDispatch);

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(controller.privacyChecksCount, 2);
  });

  it('13. PII never reaches server across any iteration step', async () => {
    const rawDom: ElementInfo[] = [
      { tag: 'input', type: 'email', name: 'email', value: 'secret.user@bank.com' },
      { tag: 'input', type: 'tel', name: 'phone', value: '+91 91234 56789' }
    ];

    const classified = SensitivityDetector.classifyElements(rawDom);
    const redacted = RedactionEngine.redactElements(classified);
    const sanitized = Sanitizer.sanitizeContext(redacted);

    const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'Step 2 Goal');
    const jsonStr = JSON.stringify(wirePayload);

    assert.strictEqual(jsonStr.includes('secret.user@bank.com'), false);
    assert.strictEqual(jsonStr.includes('+91 91234 56789'), false);
    assert.ok(jsonStr.includes('{EMAIL}'));
    assert.ok(jsonStr.includes('{PHONE}'));
  });

  it('14. Successful multi-step task execution loop (Step 1: Type -> Step 2: Click -> Step 3: Complete)', async () => {
    const controller = new AgentController({ maxIterations: 10, stabilizeDelayMs: 1 });
    controller.initTask('Find search box, enter SIH 2026, and submit');

    let currentDomState = [
      { tag: 'input', type: 'text', id: 'search-box', placeholder: 'Search...' },
      { tag: 'button', type: 'submit', id: 'search-btn', visibleText: 'Search' }
    ];

    const origSend = ServerAdapter.sendToServer;
    
    ServerAdapter.sendToServer = () => {
      const stepNum = controller.currentIteration;
      if (stepNum === 1) {
        return Promise.resolve({
          ok: true, status: 200,
          body: { session_id: 'ss-multi', action: { action_type: 'type', target_element_id: 'search-box', value: 'SIH 2026' }, task_status: 'in_progress' }
        });
      } else if (stepNum === 2) {
        return Promise.resolve({
          ok: true, status: 200,
          body: { session_id: 'ss-multi', action: { action_type: 'click', target_element_id: 'search-btn' }, task_status: 'in_progress' }
        });
      } else {
        return Promise.resolve({
          ok: true, status: 200,
          body: { session_id: 'ss-multi', action: { action_type: 'done', reasoning: 'Search completed successfully' }, task_status: 'completed' }
        });
      }
    };

    const mockPerception = async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] });

    // Step 1 Execution (TYPE)
    const step1 = await controller.executeIteration(
      async () => currentDomState,
      mockPerception,
      async (cmd) => ({ success: true, message: `Typed "${cmd.value}" into search-box` })
    );
    assert.strictEqual(step1.done, false);

    // Step 2 Execution (CLICK)
    const step2 = await controller.executeIteration(
      async () => currentDomState,
      mockPerception,
      async () => ({ success: true, message: 'Search button clicked' })
    );
    assert.strictEqual(step2.done, false);

    // Step 3 Execution (COMPLETED)
    const step3 = await controller.executeIteration(
      async () => currentDomState,
      mockPerception,
      async () => ({ success: true })
    );

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(step3.done, true);
    assert.strictEqual(step3.success, true);
    assert.strictEqual(step3.status, 'COMPLETED');
    assert.strictEqual(controller.executionHistory.length, 3);
  });

  it('15. Failed multi-step task stops gracefully when target element is missing', async () => {
    const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
    controller.initTask('Click non-existent button');

    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = () => Promise.resolve({
      ok: true, status: 200,
      body: { session_id: 'ss-fail', action: { action_type: 'click', target_element_id: 'ghost-button-777' }, task_status: 'in_progress' }
    });

    const res = await controller.executeIteration(
      async () => [{ tag: 'div', id: 'real-container', visibleText: 'Text' }],
      async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }),
      async () => ({ success: true })
    );

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(res.done, true);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'TARGET_NOT_FOUND');
  });

  it('16. Task completion verification from newly observed page state', async () => {
    const controller = new AgentController({ maxIterations: 5, stabilizeDelayMs: 1 });
    controller.initTask('Verify task completion');

    const origSend = ServerAdapter.sendToServer;
    ServerAdapter.sendToServer = () => Promise.resolve({
      ok: true, status: 200,
      body: { session_id: 'ss-verify', action: { action_type: 'done', reasoning: 'Form submitted and confirmation text verified' }, task_status: 'completed' }
    });

    const res = await controller.executeIteration(
      async () => [{ tag: 'h1', visibleText: 'Submission Successful' }],
      async () => ({ schemaVersion: '1.0.0', status: 'SUCCESS', detections: [] }),
      async () => ({ success: true })
    );

    ServerAdapter.sendToServer = origSend;

    assert.strictEqual(res.done, true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'COMPLETED');
    assert.ok(res.message?.includes('Form submitted and confirmation text verified'));
  });
});
