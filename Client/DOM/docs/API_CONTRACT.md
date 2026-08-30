# SafeScreen API Contract — v1.0.0

This document defines the JSON schema for communication between the SafeScreen browser extension (client) and any backend server. Both request and response shapes are strict — malformed data is rejected.

---

## Request: Extension → Server

**Endpoint:** `POST /api/agent/context` (configurable)  
**Content-Type:** `application/json`

```json
{
  "version": "1.0.0",
  "sessionId": "ss-lz4k9f2-a8bx3n",
  "timestamp": "2026-08-29T16:30:00.000Z",
  "url_hash": "example.com",
  "task": "fill_checkout_form",
  "elements": [
    {
      "tag": "input",
      "role": "",
      "type": "email",
      "name": "email",
      "id": "login-email",
      "placeholder": "you@example.com",
      "labelText": "Email Address",
      "visibleText": "",
      "value": "████████",
      "boundingBox": { "x": 100, "y": 200, "width": 300, "height": 40 },
      "interactive": true,
      "sensitivity": "SENSITIVE_FIELD",
      "policyAction": "REDACT",
      "redacted": true,
      "ruleId": "contact-email-type",
      "ruleCategory": "Contact Information"
    }
  ],
  "redactionSummary": {
    "count": 5,
    "categories": {
      "Contact Information": 2,
      "Financial": 2,
      "Credentials": 1
    }
  }
}
```

### Field Descriptions

| Field | Type | Description |
|---|---|---|
| `version` | string | Schema version. Currently `"1.0.0"`. |
| `sessionId` | string | Unique session identifier, generated per extension lifecycle. |
| `timestamp` | string | ISO-8601 timestamp of when the snapshot was taken. |
| `url_hash` | string | Domain-only hostname (default) or FNV-1a hash of the full URL. **Never the raw URL** — prevents query-string PII leakage. Controlled by `URL_MODE` config (`"domain"` or `"hash"`). |
| `task` | string | Optional task context string (e.g. `"fill_checkout_form"`). Empty string if not set. |
| `elements` | array | Array of element objects (see below). |
| `redactionSummary` | object | `count`: total redacted elements. `categories`: object mapping category labels to counts. |

### Element Object

| Field | Type | Description |
|---|---|---|
| `tag` | string | HTML tag name, lowercase (e.g. `"input"`, `"button"`). |
| `role` | string | ARIA role, if present. Empty string otherwise. |
| `type` | string | Input type attribute (e.g. `"email"`, `"password"`). Empty string if not applicable. |
| `name` | string | Element's `name` attribute. |
| `id` | string | Element's `id` attribute. |
| `placeholder` | string | Placeholder text. |
| `labelText` | string | Associated label text (via `<label>`, `aria-label`, or `aria-labelledby`). |
| `visibleText` | string | Direct text content (non-child-element text). **Redacted if sensitive.** |
| `value` | string | Element's current value. **Masked (`████████`) if REDACT policy applied, or PII tokens substituted if ABSTRACT policy applied.** |
| `boundingBox` | object | `{ x, y, width, height }` — screen-relative coordinates. May be all zeros for hidden elements. |
| `interactive` | boolean | Whether the element is interactive (clickable, typeable, etc). |
| `sensitivity` | string | One of: `"SAFE"`, `"SENSITIVE_FIELD"`, `"SENSITIVE_TEXT"`. |
| `policyAction` | string | One of: `"KEEP"`, `"REDACT"`, `"ABSTRACT"`. |
| `redacted` | boolean | `true` if any redaction/abstraction was applied. |
| `ruleId` | string | ID of the PII rule that triggered detection (e.g. `"contact-email-type"`). Empty if SAFE. |
| `ruleCategory` | string | Human-readable category label (e.g. `"Contact Information"`). Empty if SAFE. |

---

## Response: Server → Extension

The server's response tells the extension what action (if any) the AI agent wants to perform.

```json
{
  "action": "CLICK",
  "targetSelector": "#submit-button",
  "confidence": 0.92,
  "metadata": {
    "reasoning": "Submit button identified as primary CTA"
  }
}
```

### Field Descriptions

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | **Yes** | One of: `CLICK`, `TYPE`, `SCROLL`, `SELECT`, `NONE`. |
| `targetSelector` | string | Yes (unless `action` is `NONE`) | CSS selector identifying the target element. |
| `confidence` | number | No | Confidence score between 0.0 and 1.0. Defaults to 0 if omitted. |
| `metadata` | object | No | Arbitrary metadata (reasoning, intermediate state, etc). |

### Action Types

| Action | Description | Required Fields |
|---|---|---|
| `CLICK` | Click the target element. | `targetSelector` |
| `TYPE` | Type text into the target element. | `targetSelector`, `metadata.text` (text to type) |
| `SCROLL` | Scroll to the target element. | `targetSelector` |
| `SELECT` | Select an option in a dropdown. | `targetSelector`, `metadata.value` (option value) |
| `NONE` | No action needed. | None |

### Validation Rules

The extension validates every response before processing:
- `action` must be one of the five valid action types. Unknown actions are **rejected**.
- If `action` is not `NONE`, `targetSelector` must be a non-empty string.
- `confidence` must be a number between 0 and 1 (if present).
- Malformed responses are **logged and discarded** — they never reach the execution layer.
- Valid commands emit a `agentCommandReceived` CustomEvent on `document` for other modules to consume. **The server adapter never executes actions itself.**

---

## Configuration

| Config Key | Default | Description |
|---|---|---|
| `MOCK_MODE` | `true` | When `true`, `sendToServer()` logs the payload and returns a canned response without making any network request. Flip to `false` when a real server endpoint is available. |
| `ENDPOINT_URL` | `http://localhost:8080/api/agent/context` | The server URL to POST context payloads to. |
| `TIMEOUT_MS` | `10000` | Request timeout in milliseconds. |
| `URL_MODE` | `"domain"` | `"domain"` sends only the hostname. `"hash"` sends a non-reversible hash of the full URL. |

---

## Error Handling

- **Network failures:** The adapter retries once automatically. If the retry also fails, it returns `{ status: 0, ok: false, body: { error: "...", action: "NONE" } }`.
- **Timeouts:** Treated as network failures (retry once).
- **Malformed server responses:** Logged with specific validation errors. The `receiveServerCommand()` function returns `{ valid: false, errors: [...], command: null }`.
