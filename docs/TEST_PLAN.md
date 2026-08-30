# TEST_PLAN.md — Evaluation & Testing Strategy

## 1. Test Environments

### 1.1 Synthetic Test Pages
* Located at [`test-pages/index.html`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/test-pages/index.html).
* Contains synthetic PII fields (Email, Phone, Fake SSN, Credit Cards), rendered canvas visual text, and face sample avatars.

### 1.2 Automated Unit Test Suite
* Built with Node.js test runner (`node --test`).
* Test files located in [`test/`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/test/).
* Executes IoU bounding box fusion tests and PII pattern extractor tests.

---

## 2. Evaluation Metrics

1. **Precision & Recall:**
   $$\text{Precision} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Positives}}$$
   $$\text{Recall} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Negatives}}$$

2. **Intersection over Union (IoU):**
   $$\text{IoU} = \frac{\text{Area of Overlap}}{\text{Area of Union}}$$

3. **Inference Latency (ms):** Measured per frame pass from screenshot input to `DetectionResult[]` output.
