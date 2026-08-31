import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { PerceptionAdapter } from '../src/integration/perceptionAdapter.js';
// Load Person 1 IIFE modules safely into globalThis in Node.js test environment
const loadPerson1Module = (relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
    const mockWindow = { location: { href: 'http://localhost/test' } };
    const mockDoc = { title: 'Test Privacy Page' };
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
describe('RAVEN M7.1 — End-to-End Privacy Enforcement Test Suite', () => {
    it('1. Normal DOM page with no PII -> outbound allowed', async () => {
        const rawElements = [
            { tag: 'div', visibleText: 'Welcome to our public news website.' },
            { tag: 'button', visibleText: 'Click Here', interactive: true }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        const mockPerception = {
            schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
            screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
            detections: [], counts: { faces: 0, ocrRegions: 0, piiCandidates: 0, visualObjects: 0, total: 0 },
            timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
            locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
            subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
        };
        const merged = PerceptionAdapter.mergePerceptionWithDOM(classified, mockPerception);
        const redacted = RedactionEngine.redactElements(merged);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        assert.strictEqual(gateCheck.leaks.length, 0);
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'normal_task');
        const sendResult = await ServerAdapter.sendToServer(wirePayload, { MOCK_MODE: true });
        assert.strictEqual(sendResult.ok, true);
        assert.strictEqual(sendResult.status, 200);
    });
    it('2. DOM email -> detected -> protected=true -> original email absent', async () => {
        const rawEmail = 'alice.smith@example.org';
        const rawElements = [
            { tag: 'input', type: 'email', name: 'email', id: 'email-id', value: rawEmail }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');
        assert.strictEqual(classified[0].ruleToken, '[EMAIL]');
        const redacted = RedactionEngine.redactElements(classified);
        assert.strictEqual(redacted[0].redacted, true);
        assert.notStrictEqual(redacted[0].value, rawEmail);
        assert.ok(redacted[0].value.includes('EMAIL'));
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const wirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'email_task');
        const payloadStr = JSON.stringify(wirePayload);
        assert.strictEqual(payloadStr.includes(rawEmail), false);
    });
    it('3. DOM phone -> detected -> protected=true -> original phone absent', async () => {
        const rawPhone = '+91 98765 43210';
        const rawElements = [
            { tag: 'input', type: 'tel', name: 'mobile', id: 'phone-id', value: rawPhone }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');
        assert.strictEqual(classified[0].ruleToken, '[PHONE]');
        const redacted = RedactionEngine.redactElements(classified);
        assert.strictEqual(redacted[0].redacted, true);
        assert.notStrictEqual(redacted[0].value, rawPhone);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const payloadStr = JSON.stringify(ServerAdapter.buildOutboundPayload(sanitized));
        assert.strictEqual(payloadStr.includes(rawPhone), false);
    });
    it('4. DOM person name -> detected -> protected=true -> original name absent', async () => {
        const rawName = 'Robert Johnson';
        const rawElements = [
            { tag: 'input', type: 'text', name: 'fullname', id: 'name-id', labelText: 'Full Name', value: rawName }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');
        const redacted = RedactionEngine.redactElements(classified);
        assert.strictEqual(redacted[0].redacted, true);
        assert.notStrictEqual(redacted[0].value, rawName);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const payloadStr = JSON.stringify(ServerAdapter.buildOutboundPayload(sanitized));
        assert.strictEqual(payloadStr.includes(rawName), false);
    });
    it('5. DOM email + phone + name -> all protected -> zero raw PII in payload', async () => {
        const rawName = 'Clara Oswald';
        const rawEmail = 'clara.oswald@tardis.uk';
        const rawPhone = '+44 7911 123456';
        const rawElements = [
            { tag: 'input', type: 'text', name: 'username', labelText: 'Name', value: rawName },
            { tag: 'input', type: 'email', name: 'email', labelText: 'Email', value: rawEmail },
            { tag: 'input', type: 'tel', name: 'phone', labelText: 'Phone', value: rawPhone }
        ];
        const classified = SensitivityDetector.classifyElements(rawElements);
        const redacted = RedactionEngine.redactElements(classified);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        assert.strictEqual(sanitized.elements.every((e) => e.redacted === true), true);
        const payloadStr = JSON.stringify(ServerAdapter.buildOutboundPayload(sanitized));
        assert.strictEqual(payloadStr.includes(rawName), false);
        assert.strictEqual(payloadStr.includes(rawEmail), false);
        assert.strictEqual(payloadStr.includes(rawPhone), false);
    });
    it('6. Visual OCR email -> Person 2 detects -> adapter creates visual PII element -> protected -> raw value absent', async () => {
        const rawOcrEmail = 'visual.user@secret.org';
        const mockPerception = {
            schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
            screenshot: { width: 1920, height: 1080, coordinateSpace: 'SCREENSHOT' },
            detections: [
                {
                    id: 'det_ocr_pii_1', type: 'PII_CANDIDATE', source: 'pii',
                    bbox: { x: 400, y: 500, width: 250, height: 40 },
                    confidence: 0.96, metadata: { category: 'EMAIL', text: rawOcrEmail }
                }
            ],
            counts: { faces: 0, ocrRegions: 1, piiCandidates: 1, visualObjects: 0, total: 1 },
            timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
            locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
            subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
        };
        const merged = PerceptionAdapter.mergePerceptionWithDOM([], mockPerception);
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].tag, 'visual-ocr-pii');
        const redacted = RedactionEngine.redactElements(merged);
        assert.strictEqual(redacted[0].redacted, true);
        assert.notStrictEqual(redacted[0].value, rawOcrEmail);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const payloadStr = JSON.stringify(ServerAdapter.buildOutboundPayload(sanitized));
        assert.strictEqual(payloadStr.includes(rawOcrEmail), false);
    });
    it('7. Visual face -> Person 2 detects -> adapter creates visual-face element -> protected', async () => {
        const mockPerception = {
            schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
            screenshot: { width: 1920, height: 1080, coordinateSpace: 'SCREENSHOT' },
            detections: [
                {
                    id: 'det_face_1', type: 'FACE', source: 'face',
                    bbox: { x: 800, y: 150, width: 120, height: 120 },
                    confidence: 0.94, metadata: { detector: 'blazeface-wasm' }
                }
            ],
            counts: { faces: 1, ocrRegions: 0, piiCandidates: 0, visualObjects: 0, total: 1 },
            timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
            locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
            subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
        };
        const merged = PerceptionAdapter.mergePerceptionWithDOM([], mockPerception);
        assert.strictEqual(merged[0].tag, 'visual-face');
        assert.strictEqual(merged[0].sensitivity, 'HIGH_CONFIDENCE_PII');
        const redacted = RedactionEngine.redactElements(merged);
        assert.strictEqual(redacted[0].redacted, true);
        assert.strictEqual(redacted[0].visibleText, '[FACE_REGION]');
    });
    it('8. Mixed DOM + visual PII -> all sensitive regions protected -> zero raw PII', async () => {
        const rawDomPhone = '+91 99887 76655';
        const rawVisEmail = 'canvas.secret@vault.org';
        const rawDom = [
            { tag: 'input', type: 'tel', name: 'phone', id: 'phone-id', value: rawDomPhone }
        ];
        const classifiedDom = SensitivityDetector.classifyElements(rawDom);
        const mockPerception = {
            schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
            screenshot: { width: 1920, height: 1080, coordinateSpace: 'SCREENSHOT' },
            detections: [
                {
                    id: 'det_vis_email_1', type: 'PII_CANDIDATE', source: 'pii',
                    bbox: { x: 300, y: 600, width: 220, height: 35 },
                    confidence: 0.97, metadata: { category: 'EMAIL', text: rawVisEmail }
                },
                {
                    id: 'det_face_1', type: 'FACE', source: 'face',
                    bbox: { x: 100, y: 100, width: 150, height: 150 },
                    confidence: 0.95, metadata: { detector: 'blazeface-wasm' }
                }
            ],
            counts: { faces: 1, ocrRegions: 1, piiCandidates: 1, visualObjects: 0, total: 2 },
            timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
            locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
            subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
        };
        const merged = PerceptionAdapter.mergePerceptionWithDOM(classifiedDom, mockPerception);
        assert.strictEqual(merged.length, 3); // 1 DOM phone + 1 visual email + 1 visual face
        const redacted = RedactionEngine.redactElements(merged);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const payloadStr = JSON.stringify(ServerAdapter.buildOutboundPayload(sanitized));
        assert.strictEqual(payloadStr.includes(rawDomPhone), false);
        assert.strictEqual(payloadStr.includes(rawVisEmail), false);
    });
    it('9. Deliberate redaction failure -> outbound gate MUST reject it -> ServerAdapter MUST NOT transmit', async () => {
        const leakedEmail = 'unredacted.leak@danger.com';
        const corruptedPayload = {
            version: '1.0.0',
            sessionId: 'test-session',
            timestamp: new Date().toISOString(),
            elements: [
                {
                    tag: 'input', type: 'email',
                    value: leakedEmail, // RAW LEAK DELIBERATELY INSERTED
                    visibleText: leakedEmail,
                    redacted: false
                }
            ]
        };
        const gateCheck = Sanitizer.outboundCheck(corruptedPayload);
        assert.strictEqual(gateCheck.safe, false);
        assert.ok(gateCheck.leaks.length > 0);
        // Verify ServerAdapter rejects sendToServer attempt
        const sendResult = await ServerAdapter.sendToServer(corruptedPayload);
        assert.strictEqual(sendResult.ok, false);
        assert.strictEqual(sendResult.status, 403);
        assert.ok(sendResult.body.error.includes('TRANSMISSION_BLOCKED'));
    });
    it('10. Verify exact final serialized server payload has zero raw sensitive values', async () => {
        const secretName = 'Dr. Elizabeth Shaw';
        const secretEmail = 'elizabeth.shaw@weyland-yutani.corp';
        const secretPhone = '+1 555 019 2831';
        const secretCard = '4111 2222 3333 4444';
        const domInputs = [
            { tag: 'input', type: 'text', name: 'fullname', value: secretName },
            { tag: 'input', type: 'email', name: 'email', value: secretEmail },
            { tag: 'input', type: 'tel', name: 'phone', value: secretPhone },
            { tag: 'input', type: 'text', name: 'cardnumber', value: secretCard }
        ];
        const classified = SensitivityDetector.classifyElements(domInputs);
        const redacted = RedactionEngine.redactElements(classified);
        const sanitized = Sanitizer.sanitizeContext(redacted);
        const gateCheck = Sanitizer.outboundCheck(sanitized);
        assert.strictEqual(gateCheck.safe, true);
        const finalWirePayload = ServerAdapter.buildOutboundPayload(sanitized, 'final_verification_task');
        const serializedJson = JSON.stringify(finalWirePayload);
        // Stringent assertions: No raw PII in stringified payload
        assert.strictEqual(serializedJson.includes(secretName), false);
        assert.strictEqual(serializedJson.includes(secretEmail), false);
        assert.strictEqual(serializedJson.includes(secretPhone), false);
        assert.strictEqual(serializedJson.includes(secretCard), false);
    });
});
