# PERSON 2 — LOCAL ML / VISUAL PERCEPTION SCOPE

## Project

PS 26171 — AI-Based On-device Visual Perception for Lightweight Browser Agents

## Role

Person 2 is responsible for designing and implementing the **local visual perception layer** of the browser agent.

The responsibility of this component is to understand what is visually present on the user's browser/device **without sending raw visual data to an external AI service**.

The output of this component is a structured set of local perception/detection results that will be consumed by Person 1's privacy and security layer.

---

# 1. CORE RESPONSIBILITY

The local perception layer must transform:

    Browser visual state
            ↓
    Local ML / CV processing
            ↓
    Structured detections
            ↓
    Person 1 — Privacy / Redaction Layer

Person 2 determines:

> "What is present in the visual content?"

Person 1 determines:

> "What should be done with that information?"

Person 2 must NOT own the final privacy decision.

---

# 2. PRIVACY REQUIREMENT

All visual inference belonging to Person 2 must execute locally.

The following must NOT be sent to an external AI/API during local perception:

- Raw screenshots
- Camera/image data
- OCR source images
- Raw visual regions
- Raw visual embeddings
- Unprocessed sensitive visual information

External/server-side AI is OUT OF SCOPE for this component.

The local perception layer must be designed so that it can operate without an external AI API key.

---

# 3. BROWSER TARGET

Initial MVP target:

- Google Chrome
- Chrome Extension
- Manifest V3
- TypeScript / JavaScript

Firefox support is NOT required for the first MVP unless explicitly added later.

The architecture should remain extensible to other browsers.

---

# 4. PERCEPTION SOURCES

The perception layer should support multiple sources of information.

## 4.1 Screenshot / Visual Input

Capture or receive the relevant visual state of the browser.

The pipeline must support visual content that may not be accessible through normal DOM inspection, including:

- Images
- Canvas
- Scanned documents
- PDF/document viewers where technically possible
- Visually rendered text
- Other non-DOM visual content

---

## 4.2 OCR

Implement local OCR to extract:

- Text
- Bounding boxes
- Confidence scores

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