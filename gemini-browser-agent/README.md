# Gemini Browser Agent

A Chrome extension (Manifest V3) that runs a task-driven observe → decide → act loop against the current page:

```
content script (reads DOM) → background worker → Gemini API (picks ONE action)
       ↑                                                    │
       └──────────────── executes the action ───────────────┘
```

The loop repeats — one Gemini call per step — until the model returns `"done"`, you click **Stop**, or it hits the safety cap (configurable in Settings, default 25 steps).

## 1. Load it into Chrome (no build step needed)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `gemini-browser-agent` folder

Or simply run from project root:
```bash
npm start
```

## 2. Add your Gemini API key(s)

1. Get a key at https://aistudio.google.com/apikey
2. Click the extension's icon in the toolbar → **⚙️ API keys / Settings** (or right-click the icon → **Options**)
3. Paste one or more keys, one per line → Click **Test Connection** → **Save Settings**

Multiple keys are optional but recommended — the client rotates across them on failures/rate limits and remembers the last one that worked.

**Zero hardcoding:** Keys and model configurations live only in `chrome.storage.local` on your machine.

## 3. Run a task

1. Open any webpage (or `test-playground.html`)
2. Click the extension icon
3. Type a task, e.g. *"Search this page for 'contact' and click the first match"*
4. Click **Start** — the popup shows live status and the action log; click **Stop** anytime

## File Map

| File | Role |
|---|---|
| `manifest.json` | MV3 config — permissions, popup, options page, background worker |
| `gemini-client.js` | Calls the Gemini API, rotates keys/models, validates the returned action |
| `background.js` | Owns the loop; message-relays between the content script and Gemini |
| `content.js` | Injected into the active tab on Start; extracts DOM state, executes actions |
| `vision-redact.js`| MediaPipe on-device Face & PII text region blurring |
| `popup.html/js/css` | Task input, Start/Stop, live step log |
| `options.html/js/css`| Settings page for API keys, models, endpoints, and limits |
| `test-playground.html`| Interactive test sandbox page |
| `vendor/mediapipe/` | Vendored WASM & BlazeFace model for on-device redaction |
