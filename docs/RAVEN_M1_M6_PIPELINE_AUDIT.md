# RAVEN — M1–M6 Perception Pipeline Recovery & M9 Integration Audit Report

**PROJECT:** SIH 2026 — On-Device Visual Perception & Privacy Layer for Lightweight Browser Agents  
**PRODUCT IDENTITY:** RAVEN  
**MILESTONE:** M9.7 — Perception Pipeline Recovery, Integration Audit & Authoritative Telemetry  
**DATE:** August 30, 2026  
**STATUS:** ✅ COMPLETED & INTEGRATED  

---

## 1. Repository Audit Matrix (M1 – M6)

| Milestone | Component / Module | Source File | Original Responsibility | Execution Path & Callers | Audit Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **M1** | DOM Extraction & Sanitizer | [`src/content/content.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/content/content.ts)<br>[`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | Extracts live interactive DOM nodes, classifies sensitive text fields, and builds sanitized payload. | Invoked by `popup.ts` via `EXTRACT_DOM` message and passed to `AgentController`. | ✅ ACTIVE |
| **M2** | Local Face Detector | [`src/perception/face/faceDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/face/faceDetector.ts) | Runs BlazeFace WASM model on screenshot canvas to detect human face bounding regions. | Invoked inside `LocalPerceptionPipeline.runLocalPerception` on every iteration. | ✅ ACTIVE |
| **M3** | Local OCR Engine | [`src/perception/ocr/ocrEngine.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/ocr/ocrEngine.ts) | Runs Tesseract.js WASM engine v5 on screenshot canvas to extract raw text & bounding boxes. | Invoked inside `LocalPerceptionPipeline.runLocalPerception` on every iteration. | ✅ ACTIVE |
| **M4** | Visual Document Detector | [`src/perception/vision/visualObjectDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/vision/visualObjectDetector.ts) | Detects sensitive visual regions (Aadhaar, Passport, Payment Cards) via aspect-ratio + OCR evidence. | Invoked inside `LocalPerceptionPipeline.runLocalPerception` on every iteration. | ✅ ACTIVE |
| **M5** | PII Candidate Detector & Normalizer | [`src/perception/pii/piiDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/pii/piiDetector.ts)<br>[`src/perception/ocr/ocrTokenNormalizer.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/ocr/ocrTokenNormalizer.ts) | Groups spatially adjacent OCR tokens and scans for PII patterns (email, phone, cards, Aadhaar). | Invoked inside `LocalPerceptionPipeline.runLocalPerception` on every iteration. | ✅ ACTIVE |
| **M6** | Perception Fusion & Redaction Engine | [`src/perception/fusion/perceptionFusionEngine.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/fusion/perceptionFusionEngine.ts)<br>[`src/integration/perceptionAdapter.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/perceptionAdapter.ts) | Fuses DOM elements with visual perception results and redacts raw PII into masked tokens. | Invoked inside `AgentController.executeIteration` before server transmission. | ✅ ACTIVE |

---

## 2. Execution Flow Graph in Autonomous Loop

```text
USER GOAL (popup.ts)
  │
  ▼
captureManager.captureVisibleViewport()
  │
  ▼
LocalPerceptionPipeline.runLocalPerception()
  ├── 1. BlazeFace Face Detection
  ├── 2. Tesseract.js WASM OCR Text Recognition
  ├── 3. Multi-Modal Visual Document Detection
  ├── 4. Token Normalization
  ├── 5. Layered PII Candidate Detection
  └── 6. Spatial Perception Fusion Engine
  │
  ▼
Person1Bridge.SensitivityDetector.classifyElements()
  │
  ▼
Person1Bridge.RedactionEngine.redactElements()
  │
  ▼
Person1Bridge.Sanitizer.sanitizeContext()
  │
  ▼
Person1Bridge.Sanitizer.outboundCheck() ──[ SAFE? ]── NO ──> [ TRANSMISSION BLOCKED ]
  │ YES
  ▼
Person1Bridge.ServerAdapter.sendToServer() (POST /agent/act)
  │
  ▼
ActionExecutor.validateAction()
  │
  ▼
ActionExecutor.executeValidatedAction() (real browser dispatch)
```

---

## 3. Findings & Resolution

1. **Pipeline Status:** All Person 1 (DOM + Sensitivity Classifier + Redactor + Sanitizer + Gate) and Person 2 (Capture + Face + OCR + Vision + PII + Fusion) modules are intact, imported, and executing on every iteration.
2. **UI Diagnostics Fix:** Added explicit UI data bindings in `src/popup/popup.ts` to surface timing metrics (`faceMs`, `ocrInitMs`, `ocrInferenceMs`, `visionMs`, `piiMs`, `fusionMs`, `totalMs`) and subsystem statuses (`NOT_RUN`, `RUNNING`, `COMPLETED`, `FAILED`).
3. **Honest Privacy Statuses:** Enforced strict status rendering:
   - `INCOMPLETE` / `NOT_RUN` when perception has not executed.
   - `SAFE` when zero PII was detected.
   - `PROTECTED` when PII was detected and masked.
   - `BLOCKED` when outbound gate blocks transmission.
