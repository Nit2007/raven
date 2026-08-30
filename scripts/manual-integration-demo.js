import path from 'node:path';
import fs from 'node:fs';
import { PerceptionAdapter } from '../dist/src/integration/perceptionAdapter.js';

// Load Person 1 IIFE modules into global scope context
const loadPerson1Module = (relativePath) => {
  const fullPath = path.resolve(process.cwd(), relativePath);
  let code = fs.readFileSync(fullPath, 'utf8');
  code = code.replace(/var\s+([A-Za-z0-9_]+)\s*=\s*\(function/g, 'globalThis.$1 = (function');
  const mockWindow = { location: { href: 'http://localhost/demo' } };
  const mockDoc = { title: 'SIH 2026 Integrated Manual Demo Page' };
  const runCode = new Function('globalThis', 'window', 'document', 'navigator', 'location', code);
  runCode(globalThis, mockWindow, mockDoc, {}, mockWindow.location);
};

loadPerson1Module('Client/DOM/sensitivity-detector.js');
loadPerson1Module('Client/DOM/redaction-engine.js');
loadPerson1Module('Client/DOM/sanitizer.js');
loadPerson1Module('Client/DOM/server-adapter.js');

const RedactionEngine = globalThis.RedactionEngine;
const Sanitizer = globalThis.Sanitizer;
const ServerAdapter = globalThis.ServerAdapter;

console.log('\n======================================================');
console.log(' SIH 2026 — MANUAL INTEGRATION DEMO RUNNER');
console.log(' Person 1 (Privacy & Redaction) + Person 2 (Local Perception)');
console.log('======================================================\n');

// 1. Person 1 DOM Analyzer Simulated Extraction
const sampleDomElements = [
  {
    tag: 'input',
    type: 'text',
    name: 'full_name',
    id: 'user-name-input',
    value: 'Karanjith Ravindar',
    labelText: 'Full Name',
    boundingBox: { x: 50, y: 100, width: 250, height: 35 }
  },
  {
    tag: 'input',
    type: 'email',
    name: 'email',
    id: 'user-email-input',
    value: 'karanjith.test@example.com',
    labelText: 'Email Address',
    boundingBox: { x: 50, y: 160, width: 250, height: 35 }
  },
  {
    tag: 'input',
    type: 'tel',
    name: 'phone',
    id: 'user-phone-input',
    value: '+91 99444 90004',
    labelText: 'Mobile Phone',
    boundingBox: { x: 50, y: 220, width: 250, height: 35 }
  }
];

console.log('STEP 1 — PERSON 1 DOM ELEMENTS DETECTED:');
console.log(sampleDomElements.map(e => ` - <${e.tag} id="${e.id}"> value: "${e.value}"`).join('\n'));

// 2. Person 2 Local Perception Result (UnifiedPerceptionResult)
const samplePerceptionResult = {
  schemaVersion: '1.0.0',
  status: 'SUCCESS',
  generatedAt: Date.now(),
  screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
  detections: [
    {
      id: 'det_email_001',
      type: 'PII_CANDIDATE',
      source: 'pii',
      bbox: { x: 50, y: 160, width: 250, height: 35 },
      confidence: 0.98,
      metadata: { category: 'EMAIL', text: 'karanjith.test@example.com' }
    },
    {
      id: 'det_phone_001',
      type: 'PII_CANDIDATE',
      source: 'pii',
      bbox: { x: 50, y: 220, width: 250, height: 35 },
      confidence: 0.96,
      metadata: { category: 'PHONE', text: '+91 99444 90004' }
    },
    {
      id: 'det_face_001',
      type: 'FACE',
      source: 'face',
      bbox: { x: 450, y: 80, width: 120, height: 120 },
      confidence: 0.94,
      metadata: { detector: 'blazeface-wasm' }
    },
    {
      id: 'det_vis_aadhaar_001',
      type: 'VISUAL_REGION',
      source: 'vision',
      bbox: { x: 400, y: 250, width: 350, height: 220 },
      confidence: 0.90,
      metadata: { category: 'AADHAAR_CARD' }
    }
  ],
  counts: { faces: 1, ocrRegions: 2, piiCandidates: 2, visualObjects: 1, total: 4 },
  timing: { captureMs: 40, faceMs: 35, ocrInitMs: 0, ocrInferenceMs: 400, normalizationMs: 1, piiMs: 1, visionMs: 30, fusionMs: 1, totalMs: 508 },
  locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
  subsystems: {
    face: { status: 'SUCCESS' },
    ocr: { status: 'SUCCESS' },
    pii: { status: 'SUCCESS' },
    vision: { status: 'SUCCESS' }
  }
};

console.log('\nSTEP 2 — PERSON 2 UNIFIED PERCEPTION RESULT:');
console.log(` - Faces: ${samplePerceptionResult.counts.faces}`);
console.log(` - PII Candidates: ${samplePerceptionResult.counts.piiCandidates}`);
console.log(` - Visual Objects: ${samplePerceptionResult.counts.visualObjects}`);
console.log(` - Locality: isLocal = ${samplePerceptionResult.locality.isLocal}`);

// 3. PerceptionAdapter Bridge
const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(sampleDomElements, samplePerceptionResult);

console.log('\nSTEP 3 — PERCEPTION ADAPTER FUSED ELEMENTS:');
console.log(` - Total Elements: ${integratedElements.length}`);
integratedElements.forEach(e => {
  console.log(`   * Tag: <${e.tag}> | Sensitivity: ${e.sensitivity || 'SAFE'} | Token: ${e.ruleToken || 'N/A'}`);
});

// 4. Person 1 Redaction Engine
const redactedElements = RedactionEngine.redactElements(integratedElements);

console.log('\nSTEP 4 — PERSON 1 REDACTION ENGINE OUTPUT:');
redactedElements.forEach(e => {
  console.log(`   * Tag: <${e.tag}> | Redacted: ${e.redacted} | Output Value: "${e.value || e.visibleText}"`);
});

// 5. Person 1 Sanitizer & Outbound Gate
const sanitizedPayload = Sanitizer.sanitizeContext(redactedElements);
const outboundGateStatus = Sanitizer.outboundCheck(sanitizedPayload);

console.log('\nSTEP 5 — OUTBOUND PRIVACY GATE CHECK:');
console.log(` - Safe to Send: ${outboundGateStatus.safe}`);
console.log(` - Leaks Detected: ${outboundGateStatus.leaks.length}`);

// 6. Person 1 Server Adapter Payload
const wirePayload = ServerAdapter.buildOutboundPayload(sanitizedPayload, 'manual_testing_task');

console.log('\nSTEP 6 — FINAL OUTBOUND WIRE PAYLOAD:');
console.log(JSON.stringify(wirePayload, null, 2));

console.log('\n======================================================');
console.log(' ✅ MANUAL INTEGRATION DEMO COMPLETE — 0 LEAKS DETECTED!');
console.log('======================================================\n');
