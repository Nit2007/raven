# ANTIGRAVITY_RULES.md

# AI DEVELOPMENT RULES — PERSON 2

## Project

PS 26171 — AI-Powered On-device Visual Perception for Lightweight Browser Agents

This document contains the permanent development rules for AI coding agents working on the Person 2 local perception component.

These rules MUST be followed unless the project owner explicitly changes them.

---

# 1. PRIMARY OBJECTIVE

Build a lightweight, privacy-preserving, browser-local visual perception engine.

The system must transform:

    Browser visual state
            ↓
    Local perception
            ↓
    Structured detections
            ↓
    Person 1 Privacy Engine

The primary objective is NOT to build a general-purpose AI agent.

The primary objective is:

> Understand visual browser content locally and produce reliable, structured, confidence-scored observations without exposing raw visual data externally.

---

# 2. PERSON 2 SCOPE

Person 2 owns:

- Screenshot processing
- Local OCR
- Local face detection
- Local visual detection
- OCR-based PII candidate detection
- Bounding-box generation
- Confidence scoring
- Perception fusion
- Local ML runtime
- Model management
- Model optimization
- ML evaluation
- Detection API

Person 2 does NOT own:

- Remote AI/VLM
- Server backend
- Remote agent planner
- Final privacy decisions
- Final redaction policy
- Browser action execution
- Payment/action authorization
- Server-side orchestration

Do not implement functionality belonging to these areas unless explicitly requested.

---

# 3. SOURCE OF TRUTH

Before making architectural or implementation changes, read:

    docs/ps.md
    docs/person2.md
    docs/Requirements.md
    docs/DETECTION_SCHEMA.md
    docs/ARCHITECTURE.md
    docs/MODEL_SELECTION.md
    docs/TEST_PLAN.md
    docs/PERFORMANCE.md

These documents define the current project requirements.

Do not silently contradict them.

If two requirements appear inconsistent:

1. Identify the conflict.
2. Explain the conflict.
3. Ask for clarification if necessary.
4. Do not silently invent a new architecture.

---

# 4. LOCAL-FIRST REQUIREMENT

All perception inference must execute locally.

Do NOT introduce:

- OpenAI Vision API
- Gemini Vision API
- Claude Vision API
- Cloud OCR
- Cloud face recognition
- Remote image-analysis APIs
- External inference servers

unless explicitly requested by the project owner.

The local perception MVP must function without external AI API keys.

---

# 5. RAW DATA PROTECTION

Raw visual information is sensitive.

Do not send the following to external services:

- Raw screenshots
- Camera images
- OCR source images
- Sensitive image crops
- Raw visual embeddings
- Raw OCR text unnecessarily

Raw data should remain inside the local processing pipeline.

The final privacy decision is handled by Person 1.

---

# 6. DO NOT EXPOSE API KEYS

Never:

- hard-code API keys
- place API keys inside JavaScript bundles
- place secrets inside the Chrome extension
- commit secrets to Git
- put secrets inside frontend environment variables that are shipped to the browser

The browser is considered an untrusted/public execution environment.

---

# 7. BROWSER TARGET

Primary MVP:

    Google Chrome
    Chrome Extension
    Manifest V3
    TypeScript

Do not implement Firefox support initially unless explicitly requested.

Do not add unnecessary cross-browser abstraction before the Chrome MVP works.

---

# 8. MODEL SELECTION RULE

Do NOT automatically select the largest or newest AI model.

Select models based on:

- Browser compatibility
- Local execution
- Accuracy
- Latency
- Model size
- Memory usage
- CPU/GPU requirements
- Licensing
- Ease of deployment
- Reliability

Prefer:

    Small + Fast + Accurate enough + Local

over:

    Large + Slow + Over-engineered

Every important model choice should be documented in:

    docs/MODEL_SELECTION.md

---

# 9. MODEL-AGNOSTIC ARCHITECTURE

The application must not become tightly coupled to one model.

Use adapters/interfaces where appropriate.

For example:

    FaceDetector
         ↓
    Model Adapter
         ↓
    Detection

The face model should be replaceable without changing:

- Detection schema
- Fusion logic
- Person 1 integration

The same principle applies to OCR and visual detectors.

---

# 10. DETECTION SCHEMA IS A CONTRACT

The detection schema defined in:

    docs/DETECTION_SCHEMA.md

is the contract between Person 2 and Person 1.

Do not casually change it.

Every detection should provide, where applicable:

- id
- type
- source
- bbox
- confidence

Example:

```json
{
  "id": "det_001",
  "type": "FACE",
  "source": "face",
  "bbox": {
    "x": 120,
    "y": 80,
    "width": 180,
    "height": 180
  },
  "confidence": 0.97
}