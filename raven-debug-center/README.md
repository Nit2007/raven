# RAVEN Debug Center

A dedicated development, observability, and debugging dashboard for the **RAVEN** multi-step autonomous browser-agent project.

## Architecture

RAVEN executes an **Observe → Decide → Act** loop with local perception and strict privacy gating:

```
M1 Viewport Capture
       ↓
M2 DOM Analysis
       ↓
M3 Vision Perception
       ↓
M4 OCR
       ↓
M5 Face + PII Detection
       ↓
M6 Fusion & Sanitization
       ↓
[ 🛡️ PRIVACY GATE ]  <-- ZERO RAW BROWSER DATA LEAKS ACROSS THIS LINE
       ↓
Sanitized Observation
       ↓
Simple-UI Browser Agent
       ↓
Gemini LLM Decision
       ↓
Browser Action
       ↓
New Browser State
       ↓
(Loop back to M1)
```

## Running the Dashboard

```bash
cd raven-debug-center
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Connecting Real Telemetry

The dashboard provides three zero-friction ingestion channels to receive real data without requiring code changes:

### 1. BroadcastChannel (Recommended for Chrome Extensions)
In `content.js` or `background.js`:
```javascript
const channel = new BroadcastChannel('raven-telemetry');

// Send milestone updates
channel.postMessage({
  type: 'M1_RESULT',
  status: 'success',
  executionTimeMs: 142,
  summary: 'Viewport captured at 1920x1080',
  screenshotUrl: 'data:image/png;base64,...'
});

// Record timeline event
channel.postMessage({
  event: 'M2_DOM_COMPLETED',
  component: 'M2_DOM',
  status: 'success',
  latencyMs: 84,
  metadata: { elementsCount: 140 }
});
```

### 2. WebSocket Telemetry Daemon
If running a local Python perception backend (`ws://localhost:8765`), click **Connection** in the top-right header and connect. The receiver parses standard JSON event packets automatically.

### 3. window.postMessage
```javascript
window.postMessage({
  source: 'raven',
  payload: {
    type: 'BROWSER_STATE_CHANGED',
    url: 'https://example.com/checkout',
    title: 'Example Store',
    iteration: 3,
    state: 'running'
  }
}, '*');
```

## Strict Observability Guarantee
- **No fake data:** Initial states are explicitly marked Disconnected / Waiting.
- **No browser control:** The dashboard will not inject clicks, type text, or alter the target page.
- **Trace Export:** Click **Export Trace** anytime to generate a JSON audit snapshot of the entire session.
