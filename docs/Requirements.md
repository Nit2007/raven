# REQUIREMENTS.md

# PS 26171 — Local Visual Perception Agent

## 1. Project Objective

Build a lightweight, privacy-preserving **local visual perception system** for a browser agent.

The system must analyze browser visual content locally and produce structured perception results that can be consumed by the local privacy/security layer.

The local perception system must NOT require raw visual data to be sent to a remote AI service.

---

# 2. Person 2 Responsibility

Person 2 owns:

- Local screenshot processing
- OCR
- Face detection
- Visual detection
- OCR-based PII candidate detection
- Bounding-box generation
- Confidence scoring
- Perception fusion
- Local ML model runtime
- Model optimization
- ML evaluation
- Perception API

Person 2 does NOT own:

- Final privacy decisions
- Final redaction policy
- Remote AI/VLM
- Server-side agent
- Browser action execution
- Server communication
- Final outbound privacy authorization

---

# 3. Target Platform

## Primary platform

- Google Chrome
- Chrome Extension
- Manifest V3
- TypeScript

## Future platform

The architecture should remain extensible to Firefox and other Chromium-based browsers, but cross-browser support is NOT an MVP requirement.

---

# 4. Local-Only Requirement

All perception inference must execute on the user's device.

The following must NOT be uploaded to an external AI service during the perception stage:

- Raw screenshots
- Camera/image data
- OCR source images
- Raw visual regions
- Sensitive visual information
- Raw OCR text unless explicitly required by a local processing stage

No external AI API should be required for the local perception MVP.

Do not hard-code or expose API keys in the browser extension.

---

# 5. Technology Requirements

The implementation should investigate and use suitable browser-compatible technologies.

Preferred candidates:

- ONNX Runtime Web
- WebGPU
- WebAssembly
- MediaPipe
- Lightweight browser-compatible computer vision libraries

Model selection must consider:

- Accuracy
- Model size
- Inference latency
- Memory consumption
- CPU usage
- GPU usage
- Browser compatibility
- Licensing
- Offline execution
- Ease of deployment

Do not choose a model solely because it is the largest or most accurate model.

---

# 6. Screenshot Requirements

The system must be capable of receiving/capturing a visual representation of the browser state.

The screenshot pipeline should provide:

- Image width
- Image height
- Pixel data or compatible image representation
- Coordinate-space information

The perception system must maintain a consistent coordinate system.

Recommended MVP coordinate system:

    SCREENSHOT

Origin:

    (0, 0) = top-left corner of the screenshot

---

# 7. OCR Requirements

Implement local OCR for visual text that may not be available through the DOM.

OCR should support, where technically feasible:

- Images
- Canvas content
- Scanned documents
- PDF/document visual content
- Text embedded in screenshots

OCR output should contain:

- Recognized text
- Bounding box
- Confidence

Example:

```json
{
  "text": "john@example.com",
  "bbox": {
    "x": 300,
    "y": 210,
    "width": 220,
    "height": 30
  },
  "confidence": 0.97
}