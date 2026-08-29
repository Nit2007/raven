# SIH26171 — Browser Agent Reasoning & Safety Server

**Smart India Hackathon 2026 · Problem Statement SIH26171**
*On-device Visual Perception for Light-weight Browser Agents* (ISRO, Dept. of Space)

Server-side reasoning and validation backend for the on-device browser agent.
- **Person A**: Receives sanitized screen state, builds Set-of-Mark prompts, calls LLM via [OpenRouter](https://openrouter.ai), and produces raw actions.
- **Person B**: Validates actions against hallucinated element IDs, runs secondary PII sanity scans, detects prompt-injection attempts, enforces safe fallbacks, and tracks live pipeline latency and safety telemetry.

---

## Quick Start

### 1. Set Up Environment & API Key

```bash
# In the project directory:
copy .env.example .env          # Windows
# cp .env.example .env          # Mac/Linux

# Edit .env and paste your OpenRouter key:
# OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
# OPENROUTER_MODEL=openrouter/free
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Standalone Tests (No Server Required)

```bash
# Test Person B: Validation, Hallucination fallback, PII & Injection checks, Metrics
python test_manual_validation.py

# Test Person A: LLM reasoning with OpenRouter mock scenarios
python test_manual.py
```

### 4. Start the FastAPI Server

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **Swagger API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Live Metrics & Safety Telemetry**: http://localhost:8000/metrics

---

## Architecture & Pipeline Flow

```
Browser Extension (Client)
┌───────────────────────────────────────┐
│ 1. ViT / ONNX reads screen            │
│ 2. Local PII Redaction (masks values) │
│ 3. Sends screen_state + goal          │
└──────────────────┬────────────────────┘
                   │ POST /agent/act
                   ▼
FastAPI Server (main.py)
┌────────────────────────────────────────────────────────┐
│ Person A: Reasoning Component                          │
│   • In-memory session management & step cap (10 max)   │
│   • Set-of-Mark (SoM) compact element formatting       │
│   • LLM structured output call via OpenRouter API      │
│   • Generates raw_action {action_type, target, value}  │
├────────────────────────────────────────────────────────┤
│ Person B: Safety, Validation & Metrics                 │
│   • Secondary PII sanity audit (email, phone, Aadhaar) │
│   • Prompt-injection heuristic scanner                 │
│   • Hallucination check: target_element_id in elements │
│   • Safe fallback to 'wait' on any validation failure  │
│   • Stage latency telemetry (LLM ms, Val ms, E2E ms)   │
└──────────────────┬─────────────────────────────────────┘
                   │ Response JSON {action, task_status}
                   ▼
Browser Extension (Executes validated safe action)
```

---

## API Endpoints

### 1. `POST /agent/act` — Process Screen & Return Validated Action

#### Example Request (PowerShell)

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:8000/agent/act `
  -ContentType "application/json" `
  -Body '{
    "session_id": "demo-session-101",
    "goal": "Click the Sign In button",
    "screen_state": {
      "elements": [
        {"id": "1", "type": "input", "bbox": [80,120,350,150], "text": "demo_user", "dom_selector": "#username"},
        {"id": "2", "type": "input", "bbox": [80,170,350,200], "text": "[REDACTED]", "dom_selector": "#password"},
        {"id": "3", "type": "button", "bbox": [140,230,280,260], "text": "Sign In", "dom_selector": "#login-btn"}
      ]
    },
    "action_history": []
  }' | ConvertTo-Json -Depth 5
```

#### Example Request (bash / curl)

```bash
curl -X POST http://localhost:8000/agent/act \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "demo-session-101",
    "goal": "Click the Sign In button",
    "screen_state": {
      "elements": [
        {"id": "1", "type": "input", "bbox": [80,120,350,150], "text": "demo_user", "dom_selector": "#username"},
        {"id": "2", "type": "input", "bbox": [80,170,350,200], "text": "[REDACTED]", "dom_selector": "#password"},
        {"id": "3", "type": "button", "bbox": [140,230,280,260], "text": "Sign In", "dom_selector": "#login-btn"}
      ]
    },
    "action_history": []
  }'
```

#### Response

```json
{
  "session_id": "demo-session-101",
  "action": {
    "action_type": "click",
    "target_element_id": "3",
    "value": null,
    "reasoning": "Element 3 is the Sign In button matching the goal"
  },
  "task_status": "in_progress"
}
```

---

### 2. `GET /metrics` — Safety & Latency Telemetry (Person B)

```bash
curl http://localhost:8000/metrics
```

#### Example Output

```json
{
  "total_requests": 14,
  "validation_passed": 13,
  "validation_failures": 1,
  "validation_pass_rate_pct": 92.9,
  "pii_leaks_detected": 0,
  "injection_flags_count": 0,
  "avg_latencies_ms": {
    "llm_call_ms": 312.45,
    "validation_ms": 0.62,
    "e2e_ms": 314.12
  },
  "recent_requests_count": 10,
  "recent_requests": [...]
}
```

---

### 3. `GET /health` — Service Status

```bash
curl http://localhost:8000/health
```

---

## File Structure

| File | Owner | Purpose |
|---|---|---|
| `validation.py` | Person B | Action schema validation & hallucinated element ID fallback |
| `pii_check.py` | Person B | Secondary regex audit for unredacted emails, Indian phones, Aadhaar, cards |
| `injection_check.py` | Person B | Prompt-injection & adversarial instruction heuristic scanner |
| `metrics.py` | Person B | In-memory latency registry and telemetry aggregator |
| `test_manual_validation.py` | Person B | Standalone test suite for validation, safety, and metrics |
| `llm_module.py` | Person A | SoM prompt formatting, OpenRouter tool-calling, retry logic |
| `test_manual.py` | Person A | Standalone LLM integration test |
| `main.py` | Shared | FastAPI server combining reasoning + validation + metrics |
| `mock_data.py` | Shared | Realistic screen states and action test payloads |
| `requirements.txt` | Shared | Python dependencies (`fastapi`, `uvicorn`, `pydantic`, `python-dotenv`, `openai`) |

---

## Person B Validation Rules

1. **Hallucination Interception**: If the LLM returns `target_element_id` that is not in the `screen_state.elements` list, the action is automatically replaced with:
   ```json
   {
     "action_type": "wait",
     "target_element_id": null,
     "value": null,
     "reasoning": "[VALIDATION_FAILED] Hallucination detected: target_element_id '99' is not in visible screen elements..."
   }
   ```
2. **Action Type Verification**: Must be one of `["click", "type", "scroll", "wait", "done"]`. Any other action type falls back to `wait`.
3. **Defense-in-Depth PII Scanning**: Scans for emails (`user@domain.com`), Indian mobile numbers (`+91 9876543210`), Aadhaar (`xxxx xxxx xxxx`), and credit cards (`xxxx-xxxx-xxxx-xxxx`). Non-blocking audit warnings.
4. **Prompt-Injection Guard**: Flags directive hijacking (`ignore previous instructions`, `system:`, `exfiltrate`).
