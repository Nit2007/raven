import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Person1Bridge } from '../src/integration/person1Bridge.js';
import { PerceptionAdapter, ElementInfo } from '../src/integration/perceptionAdapter.js';
import { UnifiedPerceptionResult } from '../src/schema/detection.js';

describe('RAVEN M7.2 — Person 1 Sanitizer Bridge API Contract Suite', () => {

  it('1. Person1Bridge.Sanitizer exists and is valid', () => {
    assert.ok(Person1Bridge.Sanitizer, 'Person1Bridge.Sanitizer must be defined');
    assert.strictEqual(typeof Person1Bridge.Sanitizer.sanitizeContext, 'function', 'sanitizeContext must be a function');
    assert.strictEqual(typeof Person1Bridge.Sanitizer.outboundCheck, 'function', 'outboundCheck must be a function');
  });

  it('2. Person1Bridge.Sanitizer.sanitizeContext method is callable', () => {
    const mockElements: ElementInfo[] = [
      { tag: 'button', visibleText: 'Submit', sensitivity: 'SAFE', policyAction: 'KEEP', redacted: false }
    ];

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(mockElements);
    assert.ok(sanitized, 'Sanitized payload must be returned');
    assert.strictEqual(sanitized.elementCount, 1);
    assert.strictEqual(sanitized.elements.length, 1);
  });

  it('3. Safe element survives unchanged', () => {
    const rawElements: ElementInfo[] = [
      { tag: 'span', visibleText: 'Public Documentation Header' }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    assert.strictEqual(classified[0].sensitivity, 'SAFE');

    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    assert.strictEqual(redacted[0].redacted, false);
    assert.strictEqual(redacted[0].visibleText, 'Public Documentation Header');

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    assert.strictEqual(sanitized.elements[0].redacted, false);
    assert.strictEqual(sanitized.elements[0].visibleText, 'Public Documentation Header');
  });

  it('4. Sensitive email is redacted', () => {
    const rawEmail = 'user.test@secure-server.net';
    const rawElements: ElementInfo[] = [
      { tag: 'input', type: 'email', name: 'email', value: rawEmail }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');

    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    assert.strictEqual(redacted[0].redacted, true);
    assert.notStrictEqual(redacted[0].value, rawEmail);
    assert.ok(redacted[0].value.includes('EMAIL'));

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    assert.strictEqual(sanitized.elements[0].value.includes('EMAIL'), true);
  });

  it('5. Sensitive phone is redacted', () => {
    const rawPhone = '+91 91234 56789';
    const rawElements: ElementInfo[] = [
      { tag: 'input', type: 'tel', name: 'phone', value: rawPhone }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');

    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    assert.strictEqual(redacted[0].redacted, true);
    assert.notStrictEqual(redacted[0].value, rawPhone);
    assert.ok(redacted[0].value.includes('PHONE'));

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    assert.strictEqual(sanitized.elements[0].value.includes('PHONE'), true);
  });

  it('6. Sensitive name is redacted', () => {
    const rawName = 'Gwen Stacy';
    const rawElements: ElementInfo[] = [
      { tag: 'input', type: 'text', name: 'fullname', value: rawName }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');

    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    assert.strictEqual(redacted[0].redacted, true);
    assert.notStrictEqual(redacted[0].value, rawName);

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    assert.strictEqual(sanitized.elements[0].value.includes('PERSON_NAME'), true);
  });

  it('7. Sensitive card is redacted', () => {
    const rawCard = '4111 2222 3333 4444';
    const rawElements: ElementInfo[] = [
      { tag: 'input', type: 'text', name: 'creditcard', value: rawCard }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    assert.strictEqual(classified[0].sensitivity, 'HIGH_CONFIDENCE_PII');

    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    assert.strictEqual(redacted[0].redacted, true);
    assert.notStrictEqual(redacted[0].value, rawCard);

    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    assert.strictEqual(sanitized.elements[0].value.includes('CARD'), true);
  });

  it('8. Visual PII is redacted', () => {
    const mockPerception: UnifiedPerceptionResult = {
      schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
      screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
      detections: [
        {
          id: 'det_face_1', type: 'FACE', source: 'face',
          bbox: { x: 100, y: 100, width: 150, height: 150 },
          confidence: 0.95, metadata: { detector: 'blazeface-wasm' }
        },
        {
          id: 'det_vis_doc_1', type: 'VISUAL_REGION', source: 'vision',
          bbox: { x: 300, y: 200, width: 300, height: 200 },
          confidence: 0.91, metadata: { category: 'AADHAAR_CARD' }
        }
      ],
      counts: { faces: 1, ocrRegions: 0, piiCandidates: 0, visualObjects: 1, total: 2 },
      timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
      locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
      subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
    };

    const merged = PerceptionAdapter.mergePerceptionWithDOM([], mockPerception);
    const redacted = Person1Bridge.RedactionEngine.redactElements(merged);
    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);

    const faceEl = sanitized.elements.find((e: any) => e.tag === 'visual-face');
    assert.ok(faceEl);
    assert.strictEqual(faceEl.redacted, true);
    assert.strictEqual(faceEl.visibleText, '[FACE_REGION]');

    const docEl = sanitized.elements.find((e: any) => e.tag === 'visual-document');
    assert.ok(docEl);
    assert.strictEqual(docEl.redacted, true);
    assert.strictEqual(docEl.visibleText, '[AADHAAR_CARD]');
  });

  it('9. Final sanitized payload contains zero original PII', () => {
    const rawName = 'Miles Morales';
    const rawEmail = 'miles.morales@spider.verse';
    const rawPhone = '+1 212 555 0199';

    const rawElements: ElementInfo[] = [
      { tag: 'input', type: 'text', name: 'fullname', value: rawName },
      { tag: 'input', type: 'email', name: 'email', value: rawEmail },
      { tag: 'input', type: 'tel', name: 'phone', value: rawPhone }
    ];

    const classified = Person1Bridge.SensitivityDetector.classifyElements(rawElements);
    const redacted = Person1Bridge.RedactionEngine.redactElements(classified);
    const sanitized = Person1Bridge.Sanitizer.sanitizeContext(redacted);
    const payload = Person1Bridge.ServerAdapter.buildOutboundPayload(sanitized, 'sanitizer_suite_task');

    const jsonString = JSON.stringify(payload);
    assert.strictEqual(jsonString.includes(rawName), false);
    assert.strictEqual(jsonString.includes(rawEmail), false);
    assert.strictEqual(jsonString.includes(rawPhone), false);
  });

  it('10. Outbound gate still blocks intentionally leaked PII', async () => {
    const leakEmail = 'unmasked.leak@hacker.io';
    const badPayload = {
      version: '1.0.0',
      elements: [
        { tag: 'input', type: 'email', value: leakEmail, redacted: false }
      ]
    };

    const check = Person1Bridge.Sanitizer.outboundCheck(badPayload);
    assert.strictEqual(check.safe, false);
    assert.ok(check.leaks.length > 0);

    const sendRes = await Person1Bridge.ServerAdapter.sendToServer(badPayload);
    assert.strictEqual(sendRes.ok, false);
    assert.strictEqual(sendRes.status, 403);
  });
});
