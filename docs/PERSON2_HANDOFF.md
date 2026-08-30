# PERSON 2 LOCAL PERCEPTION HANDOFF CONTRACT

**Project:** PS 26171 — AI-Powered On-device Visual Perception for Lightweight Browser Agents  
**Producer:** Person 2 (Local ML & Visual Perception Layer)  
**Consumer:** Person 1 (Privacy, Redaction, Sanitization & Agent Controller Layer)

---

## 1. Division of Responsibilities

### Person 2 Responsibilities (COMPLETED)
* **Viewport Screenshot Capture (M1):** Captures pixel-accurate viewport frame screenshots and maps coordinate spaces.
* **Local Face Detection (M2):** Detects human faces on-device using BlazeFace / MediaPipe WASM.
* **Local Text Recognition (M3):** Recognizes visual page text on-device using Tesseract.js WASM.
* **OCR Token Grouping & Normalization (M3/M4):** Groups fragmented word tokens into line-level spatial text regions.
* **Local PII Candidate Detection (M4):** Scans recognized text for sensitive information candidates (`EMAIL`, `PHONE`, `PAYMENT_CARD`, `GOVERNMENT_ID`, `PERSON_NAME`, `ADDRESS`, `PASSWORD`).
* **Perception Fusion & Failure Isolation (M5):** Deduplicates detections, validates bounding box boundaries, isolates subsystem failures, and packages output into `UnifiedPerceptionResult`.

### Person 1 Responsibilities
* **Privacy & Redaction Policy:** Evaluates `UnifiedPerceptionResult` to make final `KEEP`, `REDACT`, or `ABSTRACT` decisions.
* **Sanitization & Masking:** Blurs, pixelates, or redacts sensitive visual bounding boxes prior to sending frames to remote agent LLMs.
* **Browser Automation & Command Execution:** Executes browser actions and agent workflows.

---

## 2. Person 2 Output Interface: `UnifiedPerceptionResult`

Person 1 invokes `pipeline.runLocalPerception(perceptionInput, canvasSource)` to receive the standard contract:

```typescript
export interface UnifiedPerceptionResult {
  schemaVersion: '1.0.0';
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE';
  generatedAt: number;
  screenshot: {
    width: number;
    height: number;
    coordinateSpace: 'SCREENSHOT';
  };
  detections: DetectionResult[];
  counts: {
    faces: number;
    ocrRegions: number;
    piiCandidates: number;
    total: number;
  };
  timing: StageTiming;
  locality: LocalityReport;
  subsystems: {
    face: SubsystemStatus;
    ocr: SubsystemStatus;
    pii: SubsystemStatus;
  };
}
```

---

## 3. Detection Record Format (`DetectionResult`)

Every item inside `detections` adheres strictly to `DETECTION_SCHEMA.md`:

```json
{
  "id": "det_pii_1788029900000_1",
  "type": "PII_CANDIDATE",
  "source": "pii",
  "bbox": {
    "x": 120,
    "y": 250,
    "width": 180,
    "height": 22
  },
  "confidence": 0.98,
  "metadata": {
    "category": "EMAIL",
    "piiType": "EMAIL",
    "text": "test@example.com",
    "evidence": [
      "EMAIL_PATTERN",
      "EMAIL_LABEL_CONTEXT"
    ],
    "detector": "pii-detector-v2-layered",
    "coordinateSpace": "SCREENSHOT"
  }
}
```

---

## 4. Key Integration Invariants
1. **Coordinate Space:** All bounding boxes use `SCREENSHOT` pixel space with `(0,0)` at the top-left origin of the screenshot image (`x >= 0`, `y >= 0`, `x + width <= screenshot.width`, `y + height <= screenshot.height`).
2. **Zero Redaction Performed by Person 2:** Person 2 produces `PII_CANDIDATE` items with explainable evidence. No pixel blurring or text masking is performed by Person 2.
3. **100% On-Device Locality:** Zero network requests or external cloud AI calls are made. `locality.isLocal` is guaranteed `true`.
4. **Subsystem Error Isolation:** If one detector (e.g. Face) encounters an error, working detectors (e.g. OCR & PII) continue to return valid detections, and `status` is set to `'PARTIAL_SUCCESS'`.
