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
    const mockDoc = { title: 'Test Integration Page' };
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
describe('Person 1 & Person 2 End-to-End Integration Suite', () => {
    it('1. Connects Person 2 UnifiedPerceptionResult to Person 1 DOM Elements via PerceptionAdapter', () => {
        assert.ok(RedactionEngine && typeof RedactionEngine.redactElements === 'function', 'RedactionEngine must be loaded');
        assert.ok(Sanitizer && typeof Sanitizer.sanitizeContext === 'function', 'Sanitizer must be loaded');
        assert.ok(ServerAdapter && typeof ServerAdapter.buildOutboundPayload === 'function', 'ServerAdapter must be loaded');
        const mockDomElements = [
            {
                tag: 'input',
                type: 'text',
                name: 'username',
                id: 'user-id',
                value: 'John Doe',
                boundingBox: { x: 100, y: 100, width: 200, height: 30 }
            },
            {
                tag: 'input',
                type: 'email',
                name: 'email',
                id: 'email-id',
                value: 'john.doe@example.com',
                boundingBox: { x: 100, y: 150, width: 200, height: 30 }
            },
            {
                tag: 'input',
                type: 'tel',
                name: 'phone',
                id: 'phone-id',
                value: '+91 98765 43210',
                boundingBox: { x: 100, y: 200, width: 200, height: 30 }
            }
        ];
        const classifiedDom = SensitivityDetector.classifyElements(mockDomElements);
        const mockPerceptionResult = {
            schemaVersion: '1.0.0',
            status: 'SUCCESS',
            generatedAt: Date.now(),
            screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
            detections: [
                {
                    id: 'face_1',
                    type: 'FACE',
                    source: 'face',
                    bbox: { x: 500, y: 100, width: 120, height: 120 },
                    confidence: 0.96,
                    metadata: { detector: 'blazeface-wasm' }
                },
                {
                    id: 'ocr_pii_1',
                    type: 'PII_CANDIDATE',
                    source: 'pii',
                    bbox: { x: 100, y: 200, width: 180, height: 25 },
                    confidence: 0.92,
                    metadata: { text: '+91 98765 43210', category: 'PHONE' }
                }
            ],
            counts: {
                faces: 1,
                ocrRegions: 1,
                piiCandidates: 1,
                visualObjects: 0,
                total: 2
            },
            timing: {
                captureMs: 15,
                faceMs: 25,
                ocrInitMs: 10,
                ocrInferenceMs: 120,
                normalizationMs: 2,
                piiMs: 3,
                fusionMs: 5,
                totalMs: 180
            },
            locality: {
                isLocal: true,
                externalAiUsed: false,
                networkUploadPerformed: false
            },
            subsystems: {
                face: { status: 'SUCCESS' },
                ocr: { status: 'SUCCESS' },
                pii: { status: 'SUCCESS' }
            }
        };
        // Step A: Merge Person 2 perception detections with Person 1 DOM elements
        const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(classifiedDom, mockPerceptionResult);
        assert.ok(Array.isArray(integratedElements));
        assert.strictEqual(integratedElements.length, 4); // 3 DOM elements + 1 visual-face (OCR PII merged onto DOM phone)
        // Verify sensitivity classifications
        const emailEl = integratedElements.find(e => e.id === 'email-id');
        assert.ok(emailEl);
        assert.strictEqual(emailEl.sensitivity, 'HIGH_CONFIDENCE_PII');
        assert.strictEqual(emailEl.ruleToken, '[EMAIL]');
        const phoneEl = integratedElements.find(e => e.id === 'phone-id');
        assert.ok(phoneEl);
        assert.strictEqual(phoneEl.sensitivity, 'HIGH_CONFIDENCE_PII');
        assert.strictEqual(phoneEl.ruleToken, '[PHONE]');
        // Step B: Person 1 Redaction Engine
        const redactedElements = RedactionEngine.redactElements(integratedElements);
        assert.strictEqual(redactedElements.length, 4);
        // Verify redaction was applied
        const redactedEmail = redactedElements.find((e) => e.id === 'email-id');
        assert.ok(redactedEmail.redacted);
        assert.notStrictEqual(redactedEmail.value, 'john.doe@example.com');
        assert.ok(redactedEmail.value.includes('EMAIL'));
        const redactedPhone = redactedElements.find((e) => e.id === 'phone-id');
        assert.ok(redactedPhone.redacted);
        assert.notStrictEqual(redactedPhone.value, '+91 98765 43210');
        assert.ok(redactedPhone.value.includes('PHONE'));
        // Step C: Person 1 Sanitizer & Outbound Gate
        const sanitizedPayload = Sanitizer.sanitizeContext(redactedElements);
        const outboundStatus = Sanitizer.outboundCheck(sanitizedPayload);
        assert.strictEqual(outboundStatus.safe, true);
        assert.strictEqual(outboundStatus.leaks.length, 0);
        // Step D: Person 1 Server Adapter Payload Generation
        const outboundWirePayload = ServerAdapter.buildOutboundPayload(sanitizedPayload, 'test_checkout_task');
        assert.strictEqual(outboundWirePayload.goal, 'test_checkout_task');
        // Verify NO raw email or phone leaks exist anywhere in final JSON string
        const jsonString = JSON.stringify(outboundWirePayload);
        assert.strictEqual(jsonString.includes('john.doe@example.com'), false);
        assert.strictEqual(jsonString.includes('+91 98765 43210'), false);
    });
    it('2. Preserves Person 2 Coordinate Space and Locality', () => {
        const mockPerceptionResult = {
            schemaVersion: '1.0.0',
            status: 'SUCCESS',
            generatedAt: Date.now(),
            screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
            detections: [],
            counts: { faces: 0, ocrRegions: 0, piiCandidates: 0, visualObjects: 0, total: 0 },
            timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
            locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
            subsystems: {
                face: { status: 'SUCCESS' },
                ocr: { status: 'SUCCESS' },
                pii: { status: 'SUCCESS' }
            }
        };
        const merged = PerceptionAdapter.mergePerceptionWithDOM([], mockPerceptionResult);
        assert.strictEqual(merged.length, 0);
        assert.strictEqual(mockPerceptionResult.locality.isLocal, true);
        assert.strictEqual(mockPerceptionResult.locality.externalAiUsed, false);
    });
});
