# PilotRaven — Generic Browser Agent Refactoring Plan

## Problem
The current agent has massive website-specific dependencies scattered across 5 core files totaling ~4,400 lines of bespoke logic for Gmail, YouTube, Amazon, Flipkart, BookMyShow, Cinema seat layouts, ChatGPT, etc. Every new website requires hand-coded selectors, routing rules, and action logic. This must end.

## Audit: Current Website-Specific Dependencies

### [`page-analyzer.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/page-analyzer.ts) (890 lines)
| Lines | What | Site-Specific? |
|-------|------|----------------|
| 97-129 | Google Knowledge Panel, Wikipedia selectors | ❌ Google/Wikipedia |
| 131-313 | YouTube video/shorts/channel extraction (200+ lines of `ytd-*` selectors) | ❌ YouTube |
| 315-421 | YouTube channel cards, tabs, sort chips | ❌ YouTube |
| 423-516 | Generic interactive element query | ✅ **Keep** (mostly generic) |
| 467-496 | ChatGPT prompt/send button detection | ❌ ChatGPT-specific |
| 518-573 | Product extraction (Amazon ASIN, Flipkart `_30jeq3` classes) | ❌ Amazon/Flipkart |
| 575-703 | Cinema movie/theater/showtime extraction (BookMyShow `__venue-name`) | ❌ BookMyShow |
| 705-816 | Cinema seat matrix extraction | ❌ Cinema-specific |
| 818-858 | Form extraction | ✅ **Keep** |

### [`action-executor.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/action-executor.ts) (801 lines)
| Lines | What | Site-Specific? |
|-------|------|----------------|
| 42-81 | Gmail Send button selectors (`div.aoO`, `div.T-I.J-J5-Ji`) | ❌ Gmail |
| 83-99 | Gmail compose body selectors (`div.Am.Al.editable`) | ❌ Gmail |
| 101-160 | ChatGPT prompt, send button, site search selectors | ❌ ChatGPT |
| 162-168 | Cinema seat selectors | ❌ Cinema |
| 170-280 | YouTube video/shorts ordinal selectors (100+ lines) | ❌ YouTube |

### [`task-router.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/agent/task-router.ts) (1,298 lines)
Almost the **entire file** is website-specific routing: YouTube ordinal video handling, Amazon product filtering, Gmail compose logic, Cinema seat booking, ChatGPT prompting — all as giant `if/else` chains.

### [`builtin-reasoner.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/ai/builtin-reasoner.ts) (937 lines)
Same story — hundreds of `if site == YouTube`, `if site == Gmail`, `if site == ChatGPT` blocks embedded in what should be a generic reasoner.

### [`agent-controller.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/agent/agent-controller.ts) (1,037 lines)
| Lines | What | Site-Specific? |
|-------|------|----------------|
| 109-136 | `cleanMediaSearchQuery` (YouTube-specific) | ❌ YouTube |
| 160-231 | KNOWN_SERVICES dictionary (70+ hardcoded sites) | ⚠️ Useful but oversized |
| 258-313 | Gmail compose URL builder | ❌ Gmail |
| 334-381 | YouTube navigation routing (50+ lines) | ❌ YouTube |
| 383-397 | Amazon search routing | ❌ Amazon |
| 398-409 | Flipkart/Wikipedia specific routing | ❌ Flipkart/Wikipedia |
| 410-505 | BookMyShow/Cinema city routing (100+ lines) | ❌ BookMyShow |
| 844-870 | YouTube/Gmail/ChatGPT termination conditions | ❌ Site-specific |

### [`types/index.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/types/index.ts) (241 lines)
Types like `SeatInfo`, `SeatingLayout`, `ExtractedTheater`, `ExtractedMovie`, `cinemaType`, `mediaType: 'youtube_video'`, `seatRow`, `seatCategory` — all domain-specific.

---

## New Architecture

```
USER → Natural Language Task
  ↓
GOAL PARSER (local lightweight)
  ↓
NAVIGATION (generic URL resolver)
  ↓
┌──────────────────────────────────────────┐
│            AGENT LOOP (max 15 steps)      │
│                                           │
│  1. OBSERVE: Generic DOM + A11y + OCR     │
│  2. PROTECT: Local PII redaction          │
│  3. REASON: Ollama qwen2.5:3b            │
│  4. VALIDATE: ActionGuard risk check      │
│  5. ACT: Generic executor                 │
│  6. VERIFY: State-change detection        │
│  7. If goal met → SUCCESS                 │
│  8. If stuck → RECOVER or FAIL            │
│  9. Loop                                  │
└──────────────────────────────────────────┘
```

---

## Proposed Changes

### Component 1: Clean Type System
#### [MODIFY] [`src/types/index.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/types/index.ts)

Remove all domain-specific types (`SeatInfo`, `SeatingLayout`, `ExtractedTheater`, `ExtractedMovie`, `cinemaType`, `mediaType: 'youtube_*'`, `seatRow`, `seatCategory`, `isChatPrompt`, `isChatSend`).

New clean types:

```ts
export type UniversalActionType = 
  | 'click' | 'type' | 'scroll' | 'navigate' 
  | 'select' | 'check' | 'wait' | 'back' | 'forward' | 'done';

export type AgentStatus = 
  | 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' 
  | 'RECOVERING' | 'WAITING_FOR_USER' | 'BLOCKED' | 'AI_UNAVAILABLE';

export interface PageElement {
  id: string;                    // el_1, el_2, ...
  tag: string;                   // button, input, a, select
  role: string;                  // button, textbox, link, combobox, heading, dialog
  text: string;                  // visible text content
  aria_label?: string;           // aria-label
  placeholder?: string;
  name?: string;                 // form field name
  type?: string;                 // input type (text, email, search, submit)
  value?: string;                // current value (redacted if PII)
  href?: string;                 // link destination
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  bbox?: [number, number, number, number]; // [x, y, width, height]
  parent_text?: string;          // nearby/parent text for context
  ordinal?: number;              // position in lists (1st, 2nd, 3rd)
}

export interface CompactPageState {
  url: string;
  title: string;
  elements: PageElement[];
  headings: string[];
  text_snippet: string;
  has_modal: boolean;
  modal_text?: string;
}

export interface AgentAction {
  action: UniversalActionType;
  target_element_id?: string;
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  amount?: number;
  profile_key?: string;
  reason: string;
  confidence: number;
}

export interface ActionHistoryEntry {
  step: number;
  action: string;
  target?: string;
  result: 'success' | 'failed' | 'no_change';
  url_before: string;
  url_after: string;
}

export interface AgentSession {
  goal: string;
  status: AgentStatus;
  step: number;
  action_history: ActionHistoryEntry[];
  max_steps: number;
}
```

Keep existing: `UserProfile`, `AgentSettings`, `PrivacyTelemetry`, `PIIEntity`, `AgentStep`, `RiskLevel`.

---

### Component 2: Generic Page Perception
#### [MODIFY] [`src/content/page-analyzer.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/page-analyzer.ts)

**Delete ~600 lines** of YouTube, Cinema, Amazon, Google Knowledge Panel, ChatGPT-specific extraction.

**Replace** with a single generic perception engine (~250 lines):

1. **Headings**: `h1, h2, h3` (existing, keep).
2. **Interactive elements**: Query all `button, a, input, textarea, select, [role], [contenteditable], [tabindex]`. For each:
   - Generate dynamic ID: `el_1`, `el_2`, ... via `data-pilot-id` attribute.
   - Extract: `tag`, `role` (from `getAttribute('role')` or computed role), `text` (innerText), `aria-label`, `placeholder`, `name`, `type`, `value`, `href`, `visible`, `enabled`, `editable`, bounding box.
   - Compute `parent_text`: grab nearest heading or label text above/beside the element.
3. **Ordinal detection**: For repeated similar siblings (e.g. list items, cards, articles), assign `ordinal: 1, 2, 3...` based on visual top-to-bottom, left-to-right ordering.
4. **Modal detection**: Check for `[role="dialog"]`, `[role="alertdialog"]`, `[aria-modal="true"]`, or high z-index overlays blocking the page.
5. **Forms**: Detect form fields semantically via `label`, `placeholder`, `name`, `type`, `autocomplete`, `aria-label`.
6. **Price detection**: Keep the generic `parsePrice()` utility for any page.
7. **Limit**: Return top 50 most relevant elements (visible + interactive first, then headings, then text).

---

### Component 3: Generic Action Executor
#### [MODIFY] [`src/content/action-executor.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/action-executor.ts)

**Delete ~500 lines** of Gmail, YouTube, ChatGPT, Cinema selectors from `findElement()`.

**Replace** with a clean generic executor (~300 lines):

- `findElement(elementId)`: Find by `[data-pilot-id="el_X"]`. If missing, re-scan DOM for best semantic match by role + text + aria-label.
- `executeClick(elementId)`: Highlight target, dispatch pointer/mouse events, handle SPA React inputs.
- `executeType(elementId, text, submit?)`: Use native property descriptor setters for React compatibility. If `submit`, dispatch Enter or find nearest submit button.
- `executeScroll(direction, amount)`: Smooth scroll viewport.
- `executeSelect(elementId, value)`: Update select element.
- `executeCheck(elementId, checked)`: Toggle checkbox/radio.
- `executeWait(durationMs)`: Wait for dynamic content.
- `executeBack()` / `executeForward()`: History navigation.
- `verifyStateChange(prevUrl, prevTitle)`: Compare URL, title, DOM element count to detect meaningful page changes.

**No website names** appear anywhere in this file.

---

### Component 4: Direct Ollama Integration
#### [NEW] [`src/services/ai/ollama-service.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/ai/ollama-service.ts)

Direct HTTP integration with `http://localhost:11434/api/chat` using `qwen2.5:3b`.

System prompt enforces the universal action schema:

```
You are PilotRaven, a generic browser agent. You receive:
1. The user's goal
2. A compact page state with interactive elements
3. Action history of what you already did

You must respond with EXACTLY ONE JSON action:
{
  "action": "click" | "type" | "scroll" | "navigate" | "select" | "check" | "wait" | "back" | "forward" | "done",
  "target_element_id": "el_X",
  "text": "only for type actions",
  "url": "only for navigate actions",
  "direction": "up" or "down (only for scroll)",
  "amount": 500,
  "profile_key": "email (only for form fields needing user profile data)",
  "reason": "brief explanation",
  "confidence": 0.95
}

Rules:
- Choose ONE action based on the CURRENT page state.
- Do NOT plan multiple steps ahead.
- Use element IDs from the page state (el_1, el_2, etc.).
- If the goal is already completed, use "done".
- If you need to scroll to find more content, use "scroll".
- For form fields requiring private data, specify profile_key instead of actual values.
- Never generate JavaScript.
```

Includes:
- Health check: `GET http://localhost:11434/`
- Timeout: 15 seconds
- JSON parsing with fallback extraction
- Compact context builder (top 35 elements only)

#### [MODIFY] [`src/services/ai/ai-factory.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/ai/ai-factory.ts)
- Wire `OllamaService` as the primary local provider.

#### [MODIFY] [`src/services/storage/profile-store.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/storage/profile-store.ts)
- Default settings: `provider: 'ollama'`, `modelName: 'qwen2.5:3b'`.

---

### Component 5: Lightweight Task Router
#### [MODIFY] [`src/agent/task-router.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/agent/task-router.ts)

**Replace entire file** (~1,300 lines → ~150 lines).

New router does only 3 things:
1. **Simple local tasks** (no LLM needed): `"scroll down"`, `"go back"`, `"click Login"` → immediate structured action.
2. **Everything else** → send compact page state to Ollama, get one structured action back.
3. **Fallback**: If Ollama is unavailable, use a minimal local reasoner.

**No website-specific routing.** No `if (isYouTube)`, no `if (isGmail)`, no `if (isAmazon)`.

---

### Component 6: Minimal Local Reasoner (Offline Fallback)
#### [MODIFY] [`src/services/ai/builtin-reasoner.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/ai/builtin-reasoner.ts)

**Replace entire file** (~940 lines → ~120 lines).

Generic offline fallback that:
1. If page has a search box and task mentions "search" → type query + submit.
2. If task mentions "click" + element text → find matching element, click it.
3. If task mentions "scroll" → scroll.
4. If task mentions ordinal ("second", "third") → find nth similar element, click it.
5. Otherwise → `done` (can't reason offline about complex tasks).

**Zero website names** in this file.

---

### Component 7: Generic Agent Controller Loop
#### [MODIFY] [`src/agent/agent-controller.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/agent/agent-controller.ts)

Major refactoring:

**`handleSmartNavigation()`** (~400 lines → ~80 lines):
- Keep `KNOWN_SERVICES` dictionary (it's useful for mapping "open gmail" → URL, but it's just a convenience lookup, not site-specific behavior).
- Keep generic URL detection (`domain.com` → `https://domain.com/`).
- **Remove**: Gmail compose URL builder, YouTube search routing, Amazon/Flipkart query routing, BookMyShow city routing, Cinema demo routing.
- Navigation is simple: resolve URL → `chrome.tabs.update()` → wait for load → done.

**`runTask()`** (main loop) — rewrite to proper continuous agent loop:
```
MAX_STEPS = 15 (configurable)
action_history = []

while step < MAX_STEPS:
  1. OBSERVE: Extract compact page state (fresh element IDs every time)
  2. PROTECT: PII redaction (keep existing)
  3. REASON: Send goal + page state + action history → Ollama → get ONE action
  4. VALIDATE: ActionGuard risk check (keep existing)
  5. If high risk → WAITING_FOR_USER, pause
  6. ACT: Execute the single action via generic executor
  7. Wait for state change (intelligent: compare URL, DOM hash)
  8. VERIFY: Did the page actually change? Is the goal met?
  9. Loop protection: detect repeated same actions, trigger recovery
  10. If action == "done" → SUCCESS
  11. Update action_history
  12. Continue
```

**Remove**: All site-specific termination conditions ("if video clicked, break", "if email sent, break", "if chat prompt typed, break").

The LLM decides when to emit `"done"`. The agent trusts that.

---

### Component 8: UI Rebranding & Generic Quick Prompts
#### [MODIFY] [`src/sidepanel/components/Header.tsx`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/sidepanel/components/Header.tsx)
- Rebrand: **PilotRaven** — Lightweight Browser Agent (SIH26171)

#### [MODIFY] [`src/sidepanel/components/TaskInput.tsx`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/sidepanel/components/TaskInput.tsx)
- Replace quick prompts with generic test scenarios:
  - 🔍 "Open Wikipedia and search for artificial intelligence"
  - 🐙 "Go to GitHub and find the first Python repository"
  - 💻 "Find the cheapest laptop below 50000"
  - 📝 "Fill this form using my profile"
  - ⬇️ "Scroll down to find more content"
  - 🔗 "Find the contact page on this website"

#### [MODIFY] [`manifest.json`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/manifest.json)
- Name: `"PilotRaven — Lightweight Browser Agent"`

#### [MODIFY] [`src/content/content-script.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/content-script.ts)
- Update log message branding.

---

### Component 9: Preserved Components (No Changes)
These files are already generic and remain as-is:
- [`src/agent/action-guard.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/agent/action-guard.ts) — Generic risk evaluation ✅
- [`src/content/privacy-filter.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/content/privacy-filter.ts) — Generic PII redaction ✅
- [`src/services/privacy/pii-detector.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/privacy/pii-detector.ts) — PII regex detection ✅
- [`src/services/ai/screen-perception.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/services/ai/screen-perception.ts) — Visual OCR ✅
- [`src/background/service-worker.ts`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/background/service-worker.ts) — Chrome background ✅
- [`src/sidepanel/App.tsx`](file:///c:/Users/Good%20Day/Browser%20agent%20%28SIH%29/src/sidepanel/App.tsx) — React shell ✅
- All sidepanel components except Header and TaskInput ✅

---

## Open Questions

> [!IMPORTANT]
> **KNOWN_SERVICES dictionary**: The 70+ entry lookup table mapping "gmail" → `mail.google.com`, "youtube" → `youtube.com` etc. is technically site-specific, but it's just a convenience for URL resolution (like a bookmark bar). It does NOT contain site-specific *behavior*. I propose keeping it for navigation convenience. Do you agree, or should we also remove it and rely purely on generic URL parsing?

> [!IMPORTANT]
> **Demo pages**: The project has demo HTML pages (`demo/form.html`, `demo/cinema.html`, `demo/youtube.html`, `demo/shop.html`). These are useful for SIH presentation. I propose keeping them but removing all routing that forces navigation to them. The agent should work on ANY website, and demos are just test pages.

---

## Line Count Reduction Estimate

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `types/index.ts` | 241 | ~120 | -50% |
| `page-analyzer.ts` | 890 | ~280 | **-70%** |
| `action-executor.ts` | 801 | ~320 | **-60%** |
| `task-router.ts` | 1,298 | ~150 | **-88%** |
| `builtin-reasoner.ts` | 937 | ~120 | **-87%** |
| `agent-controller.ts` | 1,037 | ~400 | **-61%** |
| `ollama-service.ts` (NEW) | 0 | ~150 | New |
| **Total** | **5,204** | **~1,540** | **-70%** |

~3,600 lines of website-specific code removed.

---

## Verification Plan

### Build Verification
```powershell
cmd /c "npm run build"
```
Must compile with 0 errors.

### Generic Capability Tests (no site-specific code added)
1. **Wikipedia**: "Open Wikipedia and search for artificial intelligence"
2. **GitHub**: "Go to GitHub and find the first Python repository"
3. **Any shopping site**: "Find the cheapest laptop below 50000"
4. **Generic form**: "Fill this form using my profile"
5. **Scrolling**: "Scroll down to find more content"
6. **Current page**: "Click the Login button"

### Critical Success Criterion
At least 3 of these tests must work on websites for which NO website-specific code exists in the codebase.

---

## Ollama Model
- **Model**: `qwen2.5:3b` (already installed, verified at `http://localhost:11434`)
- **Size**: 1.9 GB
- **Context**: 32K tokens
- **Capabilities**: completion, tools
- **Endpoint**: `http://localhost:11434/api/chat` (direct, no FastAPI middleman)
