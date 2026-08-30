# PERFORMANCE.md — Performance Budget & Optimization Strategy

## 1. Performance Budgets

* **Total End-to-End Latency Budget:** < 300 ms per perception cycle.
* **Peak Memory Allocation:** < 100 MB RAM inside Chrome Offscreen Document.
* **Idle CPU Overhead:** 0% (Event-driven execution only).

---

## 2. Optimization Rules

1. **DOM-First Gating:** Check page DOM structure. If text is 100% accessible via standard DOM elements and no images/canvas exist, skip visual OCR pass.
2. **SSIM / Image Hashing:** Compare successive screenshot frames; bypass perception if screen is static or unchanged.
3. **Region of Interest (ROI) Cropping:** Crop target images/canvas elements before running OCR instead of full 4K screen processing.
4. **WASM Multi-Threading:** Utilize WebAssembly multi-threading where available to parallelize BlazeFace & OCR operations.
