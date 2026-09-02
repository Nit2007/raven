# Gemini Browser Agent

Task-driven autonomous browser automation Chrome extension (Manifest V3) powered by Gemini.

Observes the DOM state and visual layout, sends one structured action request at a time to the Gemini API, executes the action, and loops until the goal is achieved.

```
┌─────────────────────────────────────────────────────────────┐
│                       AGENT LOOP                            │
│                                                             │
│  1. OBSERVE: DOM extraction + PII scan + on-device vision   │
│  2. DECIDE: Gemini API (selects ONE action per step)        │
│  3. ACT: Generic executor (click, type, press, scroll, etc) │
│  4. REPEAT until model returns "done" or safety cap         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start / How to Run

### Method 1: Automatic Launch via CLI / Scripts (Recommended)

Run Chrome with the extension automatically pre-loaded and test playground opened:

```bash
# Using npm
npm start

# Or for Microsoft Edge
npm run start:edge

# Or on Windows via Batch / PowerShell
.\launch-chrome.bat
```

### Method 2: Load Unpacked into Chrome Manually

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `gemini-browser-agent` directory in this workspace:
   `c:\Users\jaijk\Downloads\nimbasket\simple\gemini-browser-agent`
5. The extension is now loaded and ready!

---

## ⚙️ Configuration (Zero Hardcoding)

No API keys, endpoints, or models are hardcoded. Everything is configurable via the extension's Options page:

1. Click the **Gemini Browser Agent** icon in your browser toolbar.
2. Click **⚙️ API keys / Settings** (or right-click the extension icon → **Options**).
3. Configure your preferences:
   - **API Keys**: Paste one or more Gemini API keys (one per line). The extension automatically rotates across keys on rate limits.
   - **Model Fallback Hierarchy**: Specify preferred model names (e.g. `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`).
   - **API Base URL**: Configurable endpoint (default: `https://generativelanguage.googleapis.com/v1beta`).
   - **Safety Limits**: Max iterations (default: 25), step delay (default: 400ms), max step retries (default: 3).
4. Click **Test Connection** to verify your API credentials.
5. Click **Save Settings** (stored in `chrome.storage.local`).

---

## 🧪 Testing & Verification

Run automated test suite to verify code syntax, manifest integrity, and parser logic:

```bash
npm test
```

### Interactive Test Playground
Open `test-playground.html` in your browser (included in the extension folder) to test:
- Search input typing and form submission
- Multi-field contact forms
- Item selection & button clicks
- PII and face redaction verification

---

## 📁 Project Structure

```
.
├── gemini-browser-agent/          # Chrome Extension directory
│   ├── manifest.json              # MV3 configuration & permissions
│   ├── background.js              # Service worker & core execution loop
│   ├── content.js                 # Content script (DOM extraction & action execution)
│   ├── gemini-client.js           # Gemini API client with key rotation & fallback
│   ├── vision-redact.js           # MediaPipe on-device face & PII redaction
│   ├── popup.html/js/css          # Extension popup UI & live action log
│   ├── options.html/js/css        # Settings UI for keys, models & limits
│   ├── test-playground.html       # Interactive test sandbox page
│   └── vendor/mediapipe/          # On-device MediaPipe WASM and BlazeFace model
├── scripts/
│   ├── launch-browser.js          # Auto-launcher for Chrome/Edge
│   ├── test-runner.js             # Test suite
│   └── build-zip.js               # Extension zip packager
├── launch-chrome.bat              # One-click Windows batch launcher
├── launch-chrome.ps1              # One-click PowerShell launcher
├── package.json                   # Project scripts and metadata
└── gemini-browser-agent.zip       # Packaged distributable extension
```
