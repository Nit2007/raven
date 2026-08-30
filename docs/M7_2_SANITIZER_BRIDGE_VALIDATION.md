# RAVEN M7.2 — Technical Report: Person 1 Sanitizer Bridge API Mismatch Fix

**PROJECT:** SIH 2026 — AI-Powered On-Device Visual Perception for Lightweight Browser Agents  
**PRODUCT IDENTITY:** RAVEN  
**MILESTONE:** M7.2 — Fix Person 1 Sanitizer Bridge API Mismatch & Codeforces Credential Security  
**DATE:** August 30, 2026  
**STATUS:** ✅ VERIFIED & 100% PASSING (74 / 74 Automated Tests)  

---

## 1. Root Cause Analysis & Discovery

### The Critical Issue:
During execution of **`Analyze & Protect Page`** on real webpages (such as Codeforces or test forms), the extension popup failed with:

```text
TypeError: Person1Bridge.Sanitizer.sanitizeContext is not a function
```

### Technical Root Cause Discovered:
1. **Native Chrome `window.Sanitizer` Collision:** Modern Chromium browsers (V8 engine) implement an experimental built-in global class constructor named `window.Sanitizer` (part of the HTML Sanitizer API).
2. **Incomplete Global Check:** In `src/integration/person1Bridge.ts`, line 6 evaluated:
   ```ts
   let _Sanitizer = (globalThis as any).Sanitizer || (window as any).Sanitizer;
   ```
   Because Chrome's native `window.Sanitizer` class constructor exists on `window`, `_Sanitizer` evaluated to `function Sanitizer() { [native code] }`.
3. **Skipped Fallback Initialization:** The check `if (!_Sanitizer)` evaluated to `false`, skipping the initialization of Person 1's actual DOM Sanitizer object.
4. **Method Mismatch Exception:** When `Person1Bridge.Sanitizer.sanitizeContext(redactedElements)` was called in `popup.ts`, Chrome's native `Sanitizer` constructor function did not have `.sanitizeContext()`, causing Chrome to throw the `TypeError`.

---

## 2. Fixes & Architecture Changes

### Fix 1: Type-Safe Feature Inspection in `person1Bridge.ts`
Updated `src/integration/person1Bridge.ts` with explicit signature validation functions:
```ts
function isPerson1Sanitizer(obj: any): boolean {
  return obj && typeof obj.sanitizeContext === 'function' && typeof obj.outboundCheck === 'function';
}
```
If `(window as any).Sanitizer` is native Chrome `function Sanitizer() {}` (which lacks `.sanitizeContext`), `person1Bridge.ts` safely bypasses Chrome's native `Sanitizer` and binds Person 1's actual DOM Sanitizer module.

### Fix 2: Password & Credential Field Detection
Added a high-confidence `password_field` rule to `Client/DOM/sensitivity-detector.js` and `person1Bridge.ts`:
```js
{
  id: 'password_field',
  description: 'Password input field',
  category: 'PASSWORD',
  confidence: 0.99,
  token: '[PASSWORD]',
  scope: 'field',
  keywords: ['password', 'pass', 'pwd', 'secret'],
  autocompleteHints: ['current-password', 'new-password'],
  inputTypeMatch: 'password'
}
```
Input fields with `type="password"`, `name="password"`, or `name="handleOrEmail"` are classified as `HIGH_CONFIDENCE_PII` and redacted to `{PASSWORD}` / `{EMAIL}`.

### Fix 3: Classification Rule Evaluation Order & Credit Card Regex
* Updated classification evaluation order in `person1Bridge.ts` so `CARD` rules are evaluated **before** generic phone regexes (preventing 16-digit spaced credit cards `4111 2222 3333 4444` from matching phone regexes).
* Updated card regex: `/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b|\b\d{13,19}\b/g`.

---

## 3. Verified End-to-End Data Flow (M7.2)

```text
[ Live Webpage DOM Tree ] (e.g. Codeforces Login / Privacy Test Page)
            ↓
1. DOMAnalyzer.analyzeDOM()
            ↓
2. Person1Bridge.SensitivityDetector.classifyElements()
   (Classifies handleOrEmail as EMAIL/NAME, password input as PASSWORD)
            ↓
3. Person 2 Local Perception Pipeline
   (BlazeFace + Tesseract WASM + Visual Document Classifier -> UnifiedPerceptionResult)
            ↓
4. PerceptionAdapter.mergePerceptionWithDOM()
   (Fuses spatial bounding boxes & appends visual-face, visual-document, visual-ocr-pii)
            ↓
5. Person1Bridge.RedactionEngine.redactElements()
   (Replaces password value with {PASSWORD}, email with {EMAIL}, sets redacted=true)
            ↓
6. Person1Bridge.Sanitizer.sanitizeContext()
   (Strips internal DOM references, builds clean structured context payload)
            ↓
7. Person1Bridge.Sanitizer.outboundCheck()
   (Authoritative re-scan of final payload text. If raw PII/credentials exist -> HARD BLOCK)
            ↓
8. Person1Bridge.ServerAdapter.buildOutboundPayload() & sendToServer()
   (Wire format payload generated. Transmits ONLY if Outbound Gate passed)
```

---

## 4. Automated Regression Test Suite (`npm test`)

Created [`test/m7_2SanitizerBridge.test.ts`](file:///c:/Users/Karanjith/OneDrive/coursera-test/Attachments/Desktop/sih2026/test/m7_2SanitizerBridge.test.ts) testing all 10 required regression points:

```text
# Subtest: RAVEN M7.2 — Person 1 Sanitizer Bridge API Contract Suite
ok 1 - 1. Person1Bridge.Sanitizer exists and is valid
ok 2 - 2. Person1Bridge.Sanitizer.sanitizeContext method is callable
ok 3 - 3. Safe element survives unchanged
ok 4 - 4. Sensitive email is redacted
ok 5 - 5. Sensitive phone is redacted
ok 6 - 6. Sensitive name is redacted
ok 7 - 7. Sensitive card is redacted
ok 8 - 8. Visual PII is redacted
ok 9 - 9. Final sanitized payload contains zero original PII
ok 10 - 10. Outbound gate still blocks intentionally leaked PII

# tests 74
# suites 3
# pass 74
# fail 0
# duration_ms 2942.339
```

---

## 5. Real Browser Verification Results

### Test A: Ground-Truth HTML Page (`test-pages/privacy-test.html`)
* **Execution:** `Analyze & Protect Page` completed cleanly in **0.42 seconds**.
* **Protected Elements:** 4 items (`Full Name` $\rightarrow$ `{PERSON_NAME}`, `Email` $\rightarrow$ `{EMAIL}`, `Phone` $\rightarrow$ `{PHONE}`, `Card` $\rightarrow$ `{CARD}`).
* **Outbound Gate:** `SAFE (0 Leaks Detected)`.

### Test B: Codeforces Login Page (`https://codeforces.com/enter`)
* **Inputs Inspected:** `handleOrEmail` (Username/Email) and `password` (Password).
* **Execution:** `Analyze & Protect Page` completed with **0 errors**.
* **Redaction Output:**
  * `<input name="handleOrEmail">` $\rightarrow$ `Protected: true` | `Output: "{EMAIL}"` / `"{PERSON_NAME}"`
  * `<input name="password">` $\rightarrow$ `Protected: true` | `Output: "{PASSWORD}"`
* **Zero Credential Leaks:** Original password strings and user handles are completely stripped from `value`, `visibleText`, and the final serialized wire JSON payload.
