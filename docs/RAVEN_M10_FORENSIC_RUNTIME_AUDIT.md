# RAVEN M10 — Forensic Runtime Audit & Architectural Investigation Report

**PROJECT:** SIH 2026 — On-Device Visual Perception & Privacy Layer for Lightweight Browser Agents  
**PRODUCT IDENTITY:** RAVEN  
**MILESTONE:** M10 — Forensic Runtime Audit  
**DATE:** August 30, 2026  
**GIT BRANCH:** `person1-person2-server-integration`  

---

## 1. Runtime Stage Call Matrix

| Stage | Module / Source File | Function Name | Called By | Actually Executed? | Output Consumed? |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **M1 DOM** | [`src/content/content.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/content/content.ts) | `extractDOM()` | `popup.ts` via `queryLiveDomFromActiveTab()` | YES | YES |
| **M2 Capture** | [`src/perception/capture/captureManager.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/capture/captureManager.ts) | `captureVisibleViewport()` | `popup.ts` via `runPerceptionStep()` | YES | YES |
| **M3 OCR** | [`src/perception/ocr/ocrEngine.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/ocr/ocrEngine.ts) | `recognizeText()` | `perceptionPipeline.ts` | YES | YES |
| **M4 Face** | [`src/perception/face/faceDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/face/faceDetector.ts) | `detectFaces()` | `perceptionPipeline.ts` | YES | YES |
| **M5 Vision** | [`src/perception/vision/visualObjectDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/vision/visualObjectDetector.ts) | `detectVisualObjects()` | `perceptionPipeline.ts` | YES | YES |
| **M5 PII** | [`src/perception/pii/piiDetector.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/pii/piiDetector.ts) | `detectPiiFromOcr()` | `perceptionPipeline.ts` | YES | YES |
| **M6 Fusion** | [`src/perception/fusion/perceptionFusionEngine.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/perception/fusion/perceptionFusionEngine.ts) | `buildUnifiedResult()` | `perceptionPipeline.ts` | YES | YES |
| **Sensitivity** | [`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | `classifyElements()` | `AgentController.executeIteration()` | YES | YES |
| **Redaction** | [`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | `redactElements()` | `AgentController.executeIteration()` | YES | YES |
| **Sanitizer** | [`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | `sanitizeContext()` | `AgentController.executeIteration()` | YES | YES |
| **Privacy Gate** | [`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | `outboundCheck()` | `AgentController.executeIteration()` | YES | YES |
| **Server** | [`src/integration/person1Bridge.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/integration/person1Bridge.ts) | `sendToServer()` | `AgentController.executeIteration()` | YES | YES |
| **Executor** | [`src/agent/actionExecutor.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/agent/actionExecutor.ts) | `executeValidatedAction()` | `AgentController.executeIteration()` | YES | YES |
| **Dispatch** | [`src/content/content.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/src/content/content.ts) | `executeAction()` | `popup.ts` via `chrome.tabs.sendMessage` | YES | YES |

---

## 2. Root Cause Analysis of Forensic Observations

### Issue A: Deterministic Tasks ("Scroll down") Consuming 10 Iterations
* **Root Cause:** `AgentController.executeIteration()` did not evaluate task completion for direct deterministic goals after successful action verification. It defaulted to `done: false`, causing `popup.ts` loop to run for `MAX_ITERATIONS = 10`.
* **Remediation:** Implemented local task classification (`DIRECT_ACTION`, `SINGLE_ACTION`, `MULTI_STEP`). For `DIRECT_ACTION` goals (`"Scroll down"`, `"Scroll up"`), once action verification passes (`afterScrollY > beforeScrollY`), the agent sets `done: true, success: true` after **Iteration 1**.

### Issue B: Perception Timing UI Rendering
* **Root Cause:** In earlier builds, UI timing element text nodes were not bound to `perceptionRes.timing` properties.
* **Remediation:** Explicit data bindings established for `tFaceEl`, `tOcrInitEl`, `tOcrInferenceEl`, `tVisionEl`, `tNormalizerEl`, `tPiiEl`, `tFusionEl`, `tTotalEl` and status badges.

### Issue C: Independent Perception Execution Order
* **Root Cause:** Face detection, OCR text recognition, and visual object detection were running sequentially.
* **Remediation:** Refactored `LocalPerceptionPipeline.runLocalPerception()` to execute independent perception modules concurrently via `Promise.all()`.
