# Gemini Browser Agent

A Chrome extension (Manifest V3) that runs a task-driven observe → decide →
act loop against the current page:

```
content script (reads DOM) → background worker → Gemini API (picks ONE action)
       ↑                                                    │
       └──────────────── executes the action ───────────────┘
```

The loop repeats — one Gemini call per step — until the model returns
`"done"`, you click **Stop**, or it hits the 25-step safety cap
(`MAX_ITERATIONS` in `background.js`).

## 1. Unzip

```bash
unzip gemini-browser-agent.zip -d gemini-browser-agent
cd gemini-browser-agent
```

## 2. Load it into Chrome (no build step needed)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the unzipped `gemini-browser-agent` folder

## 3. Add your Gemini API key(s)

1. Get a key at https://aistudio.google.com/apikey
2. Click the extension's icon in the toolbar → **API keys / options**
   (or right-click the icon → **Options**)
3. Paste one or more keys, one per line → **Save**

Multiple keys are optional but recommended — the client rotates across them
on failures/rate limits and remembers the last one that worked, so usage
rolls forward on subsequent runs instead of hammering key #1 every time.

**Do not put real keys in the source files or commit them to git.** They only
ever live in `chrome.storage.local` on your machine, set through the options
page above.

## 4. Run a task

1. Open any webpage
2. Click the extension icon
3. Type a task, e.g. *"Search this page for 'contact' and click the first match"*
4. Click **Start** — the popup shows live status and the action log; click
   **Stop** anytime

## File map

| File | Role |
|---|---|
| `manifest.json` | MV3 config — permissions, popup, options page, background worker |
| `gemini-client.js` | Calls the Gemini API, rotates keys/models, validates the returned action |
| `background.js` | Owns the loop; message-relays between the content script and Gemini |
| `content.js` | Injected into the active tab on Start; extracts DOM state, executes actions |
| `popup.html/js/css` | Task input, Start/Stop, live step log |
| `options.html/js/css` | Where API keys are entered and stored |

## Known limits of this scaffold

- **DOM extraction in `content.js` is bare-bones** (a plain element/text
  snapshot) and does **not** redact anything before it goes to Gemini. If
  you're wiring this into a project that already has a DOM analyzer /
  sensitivity-detector / redaction-engine / sanitizer pipeline, that
  pipeline should sit between `extractElements()`/`extractVisibleText()`
  and the message sent back to `background.js` — swap in that output
  instead of the raw snapshot so PII on the page never reaches a
  third-party API unredacted.
- Model names in `gemini-client.js`'s `DEFAULT_MODELS` will go stale —
  Google retires Gemini model IDs on a schedule. If calls start failing
  with 404s, check https://ai.google.dev/gemini-api/docs/models for
  current active model names.
- One tab's task at a time in this build (state is keyed by tab ID, but
  there's no queueing/concurrency handling beyond that).
- No retry/backoff *within* a single failed step beyond the key/model
  rotation — a step that fails on every key/model ends the run with an
  error shown in the popup, it doesn't silently keep looping.
