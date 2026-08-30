# MODEL_SELECTION.md — Model Selection & Trade-Off Analysis

## 1. Evaluation Criteria

Models considered for the client-side visual perception layer are evaluated on:
1. **Browser Compatibility:** Support for WebGL, WebGPU, or WASM without native bindings.
2. **Local Execution:** 100% offline capability without cloud AI APIs.
3. **Accuracy / F1 Score:** High precision for faces and sensitive text regions.
4. **Latency:** Target frame processing < 200 ms.
5. **Memory Footprint:** Target < 100 MB RAM allocation.
6. **Licensing:** Permissive open-source license (Apache 2.0, MIT, BSD).

---

## 2. Candidate Analysis

### 2.1 Face Detection
* **MediaPipe BlazeFace (Selected for MVP):**
  * Size: ~229 KB
  * Latency: 5 - 15 ms (WASM)
  * Licensing: Apache 2.0
  * Trade-off: Optimized for frontal browser viewports. Ideal for client-side privacy.
* **YOLOv8-Nano Face (Benchmark Option):**
  * Size: ~6 MB
  * Latency: 35 ms
  * Licensing: AGPL-3.0

### 2.2 OCR Engine
* **Tesseract.js WASM (Selected for MVP):**
  * Size: ~2 MB core WASM + ~4 MB traineddata
  * Latency: 150 - 300 ms
  * Licensing: Apache 2.0
  * Trade-off: High word-level bounding box accuracy.
* **PaddleOCR ONNX Web (Stretch Option):**
  * Size: ~8 MB
  * Latency: 100 ms (WebGPU)
  * Licensing: Apache 2.0

### 2.3 PII Candidate Detection
* **Local Regex & Pattern Heuristics (Selected for MVP):**
  * Size: < 50 KB
  * Latency: < 1 ms
  * Licensing: Permissive
  * Trade-off: Deterministic, instantaneous pattern matching over extracted OCR text.
