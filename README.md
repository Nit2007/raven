# Raven — On-Device Visual Perception Browser Agent

**Smart India Hackathon 2026 · Problem Statement SIH26171**
*On-device Visual Perception for Light-weight Browser Agents*
Sponsored by: **ISRO, Department of Space**

---

## System Overview

Raven is a lightweight browser automation agent designed for privacy-preserving, on-device perception:

1. **`Client/`**: Browser extension running local vision models (ViT / ONNX Runtime Web) to read screen DOM elements and redact sensitive PII (passwords, auth tokens, personal data) directly on the user's device before sending sanitized screen state to the server.
2. **`Server/`**: FastAPI reasoning and validation backend:
   - **Reasoning Engine (Person A)**: Formats Set-of-Mark prompts and calls LLMs via OpenRouter with structured function calling to decide the next UI action.
   - **Safety & Validation Layer (Person B)**: Validates actions against hallucinated element IDs, runs secondary PII scans, detects prompt-injection attacks, and tracks live pipeline latency and safety metrics (`GET /metrics`).

---

## Directory Structure

```
raven/
├── Client/                  # Browser extension (on-device vision & local redaction)
└── Server/                  # Server-side reasoning & safety engine (FastAPI + LLM)
    ├── main.py              # FastAPI server (POST /agent/act, GET /metrics, GET /health)
    ├── llm_module.py        # LLM reasoning module via OpenRouter
    ├── validation.py        # Action validation & hallucination fallback
    ├── pii_check.py         # Secondary defense-in-depth PII scanner
    ├── injection_check.py   # Prompt-injection heuristic scanner
    ├── metrics.py           # In-memory latency & safety telemetry store
    ├── mock_data.py         # Test screen state payloads & action cases
    ├── test_manual.py       # Standalone LLM integration test (Person A)
    ├── test_manual_validation.py # Standalone safety & validation test (Person B)
    ├── requirements.txt     # Python dependencies
    ├── .env.example         # Environment template
    └── README.md            # Detailed server documentation
```

---

## Getting Started (Server)

```bash
cd Server
copy .env.example .env
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

See [Server/README.md](Server/README.md) for full server configuration, data contracts, and API documentation.
