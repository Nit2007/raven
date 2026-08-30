# ARCHITECTURE.md — Person 2 Local Perception Layer

## 1. System Overview

The Local Visual Perception Layer (Person 2) operates entirely on-device inside a Manifest V3 Chrome Extension. It transforms browser screen captures into structured observation evidence conforming to `DETECTION_SCHEMA.md`.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION (MV3)                          │
│                                                                        │
│  ┌────────────────────┐    Capture     ┌────────────────────────────┐  │
│  │ Content Script     │───────────────>│ Service Worker             │  │
│  │ (DOM & Viewport)   │                │ (background.ts)            │  │
│  └────────────────────┘                └─────────────┬──────────────┘  │
│                                                      │                 │
│                                                      │ Frame Payload   │
│                                                      ▼                 │
│                                        ┌────────────────────────────┐  │
│                                        │ Offscreen Document         │  │
│                                        │ (offscreen.html / ts)      │  │
│                                        │                            │  │
│                                        │  ┌──────────────────────┐  │  │
│                                        │  │ BlazeFace Detector   │  │  │
│                                        │  └──────────┬───────────┘  │  │
│                                        │             │              │  │
│                                        │  ┌──────────▼───────────┐  │  │
│                                        │  │ Tesseract.js WASM    │  │  │
│                                        │  └──────────┬───────────┘  │  │
│                                        │             │              │  │
│                                        │  ┌──────────▼───────────┐  │  │
│                                        │  │ PII Candidate Detector│ │  │
│                                        │  └──────────┬───────────┘  │  │
│                                        │             │              │  │
│                                        │  ┌──────────▼───────────┐  │  │
│                                        │  │ Perception Fusion    │  │  │
│                                        │  └──────────┬───────────┘  │  │
│                                        └─────────────┼──────────────┘  │
│                                                      │                 │
│                                                      ▼                 │
│                                            DETECTION_SCHEMA JSON       │
│                                                      │                 │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                                                       ▼
                                      Person 1 Privacy / Redaction Engine
```

## 2. Component Breakdown

### 2.1 Background Service Worker (`src/background/background.ts`)
* Manages the lifecycle of the extension offscreen document.
* Captures current active tab screenshot via `chrome.tabs.captureVisibleTab`.
* Forwards image payloads and viewport metrics to offscreen worker.

### 2.2 Offscreen Execution Sandbox (`src/offscreen/offscreen.ts`)
* Executes WebGPU / WebAssembly ML models without UI thread blocking.
* Converts base64 screenshots to `<canvas>` image buffers.
* Invokes `LocalPerceptionPipeline`.

### 2.3 Local Perception Pipeline (`src/perception/perceptionPipeline.ts`)
* **Face Detector (`src/perception/face/faceDetector.ts`):** Model-agnostic wrapper for BlazeFace WASM/WebGPU.
* **OCR Engine (`src/perception/ocr/ocrEngine.ts`):** Model-agnostic wrapper for Tesseract.js WASM.
* **PII Candidate Extractor (`src/perception/pii/piiDetector.ts`):** Regex heuristic engine scanning OCR words for Emails, Phone Numbers, Credit Cards, SSNs, Passwords.
* **Perception Fusion Engine (`src/perception/fusion/perceptionFusion.ts`):** IoU overlap calculator & Non-Maximum Suppression deduplication.

---

## 3. Data Contract (Person 2 -> Person 1)

Every perception output is a JSON array conforming to [`docs/DETECTION_SCHEMA.md`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/docs/DETECTION_SCHEMA.md):

```json
[
  {
    "id": "det_pii_1724970000000_1",
    "type": "PII_CANDIDATE",
    "source": "pii",
    "bbox": { "x": 100, "y": 150, "width": 220, "height": 30 },
    "confidence": 0.98,
    "metadata": {
      "text": "alice@example.com",
      "piiType": "EMAIL",
      "detector": "regex-heuristic-v1"
    }
  }
]
```
