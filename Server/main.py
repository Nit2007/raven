"""
main.py — FastAPI server for the browser agent reasoning and validation engine.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Components:
  - Person A: Server-side LLM reasoning endpoint & session state.
  - Person B: Validation, anti-hallucination, loop guard, PII audit, injection scan,
              latency instrumentation, and live judging dashboard.

Endpoints:
  POST /agent/act     — Receive screen state, reason with LLM, validate & return safe action
  GET  /health        — Server health status
  GET  /metrics       — Live telemetry, quantiles & safety audit metrics (JSON or Prometheus)
  GET  /dashboard     — Visual real-time dashboard for hackathon judging
  POST /session/reset — Clear active sessions and metrics (testing utility)
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel, Field

from llm_module import get_next_action
from validation import validate_and_finalize
from pii_check import scan_for_pii_leakage
from injection_check import check_for_injection_signs
from metrics import (
    StageTimer,
    record_request_metrics,
    get_metrics_summary,
    get_prometheus_metrics,
    reset_metrics,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models — data contract (DO NOT rename/restructure these fields)
# ---------------------------------------------------------------------------


class ScreenElement(BaseModel):
    """A single UI element detected on the browser screen.

    Fields are defined by the browser extension team and must not be changed.
    """

    id: str
    type: str
    bbox: list[int] = Field(..., min_length=4, max_length=4)
    text: str
    dom_selector: str


class ScreenState(BaseModel):
    """Container for all visible UI elements on the current screen."""

    elements: list[ScreenElement]


class AgentRequest(BaseModel):
    """Incoming request from the browser extension.

    This is the POST body contract agreed with the client-side team.
    """

    session_id: str
    goal: str
    screen_state: ScreenState
    action_history: list[str] = Field(default_factory=list)
    # Optional: base64-encoded redacted screenshot from the extension.
    screenshot_b64: Optional[str] = None


class RawAction(BaseModel):
    """The action schema returned by reasoning and finalized by validation.

    Contract: action_type must be one of: click, type, scroll, wait, done.
    """

    action_type: str = Field(
        ...,
        description="One of: click, type, scroll, wait, done",
    )
    target_element_id: Optional[str] = None
    value: Optional[str] = None
    reasoning: str


class AgentResponse(BaseModel):
    """Response returned to the browser extension."""

    session_id: str
    action: RawAction
    task_status: str = Field(
        ...,
        description="Either 'in_progress' or 'done'",
    )


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

# Key: session_id → { goal: str, step_count: int, history: list[str] }
sessions: dict[str, dict[str, Any]] = {}

# Maximum steps per session before forcing a "done" action
MAX_STEPS_PER_SESSION: int = 10

# ---------------------------------------------------------------------------
# FastAPI app setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SIH26171 Browser Agent Reasoning & Validation Server",
    description=(
        "Receives sanitized screen state from the browser extension, "
        "reasons over it using an LLM (Person A), validates safety and "
        "guards against hallucinations (Person B), and returns the next UI action."
    ),
    version="1.0.0",
)

# Enable CORS for Chrome Extensions and Localhost Dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_correlation_and_timing_headers(request: Request, call_next: Any) -> Response:
    """Inject correlation ID and latency headers into all HTTP responses."""
    req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
    return response


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    """Health check endpoint.

    Returns 200 with service status.
    """
    return {
        "status": "ok",
        "service": "sih26171-reasoning-server",
        "active_sessions_count": len(sessions),
    }


@app.get("/metrics")
async def metrics_endpoint(format: str = Query(default="json", description="json or prometheus")):
    """Live metrics and safety telemetry endpoint (Person B).

    Exposes aggregate counts of total requests, validation pass/fail rates,
    hallucination catches, loop preventions, PII leaks, and p50/p95 stage latencies.
    """
    if format.lower() == "prometheus":
        return PlainTextResponse(get_prometheus_metrics())
    return get_metrics_summary()


@app.post("/session/reset")
async def reset_session_and_metrics():
    """Reset all active sessions and telemetry metrics (testing utility)."""
    sessions.clear()
    reset_metrics()
    logger.info("Sessions and metrics reset successfully.")
    return {"status": "reset_complete", "sessions_count": 0}


@app.get("/dashboard", response_class=HTMLResponse)
async def live_dashboard():
    """Live visual telemetry dashboard for hackathon judging presentation."""
    dashboard_path = os.path.join(os.path.dirname(__file__), "static", "dashboard.html")
    if os.path.exists(dashboard_path):
        with open(dashboard_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    
    return HTMLResponse(
        content="""
        <!DOCTYPE html>
        <html>
        <head><title>SIH26171 Dashboard</title><meta http-equiv="refresh" content="2"></head>
        <body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;">
            <h1>SIH26171 Agent Telemetry Dashboard</h1>
            <p>Loading dashboard component...</p>
        </body>
        </html>
        """
    )


@app.post("/agent/act", response_model=AgentResponse)
async def agent_act(request: AgentRequest):
    """Process a screen state and return the next validated browser action.

    Pipeline Flow:
      1. Session management & step cap enforcement (Person A).
      2. Secondary PII sanity audit on screen_state text fields (Person B).
      3. Prompt-injection heuristic scan on reasoning/elements (Person B).
      4. LLM reasoning via function calling to produce raw_action (Person A).
      5. Hallucination, element compatibility & loop validation (Person B).
      6. Telemetry & latency recording into in-memory metrics store (Person B).
      7. Session history update & final client response return.
    """
    t_req_start = time.perf_counter()
    sid = request.session_id
    logger.info("Received request for session '%s' (goal: '%s')", sid, request.goal)

    # ---- Step 1: Session lookup / creation ----
    if sid not in sessions:
        sessions[sid] = {
            "goal": request.goal,
            "step_count": 0,
            "history": [],
        }
        logger.info("Created new session '%s'", sid)

    session = sessions[sid]

    # ---- Step 2: Step cap check ----
    if session["step_count"] >= MAX_STEPS_PER_SESSION:
        logger.warning(
            "Session '%s' hit step limit (%d). Forcing 'done'.",
            sid,
            MAX_STEPS_PER_SESSION,
        )
        forced_action = RawAction(
            action_type="done",
            target_element_id=None,
            value=None,
            reasoning=(
                f"Step limit of {MAX_STEPS_PER_SESSION} reached for this "
                f"session. Ending task to prevent runaway loop."
            ),
        )
        e2e_ms = round((time.perf_counter() - t_req_start) * 1000, 2)
        record_request_metrics(
            session_id=sid,
            stage_latencies={"llm_call_ms": 0.0, "validation_ms": 0.0, "e2e_ms": e2e_ms},
            validation_passed=True,
            action_type="done",
        )
        return AgentResponse(
            session_id=sid,
            action=forced_action,
            task_status="done",
        )

    # ---- Step 3: Person B Pre-inference Safety Audits ----
    with StageTimer("pii_scan_ms") as t_pii:
        pii_report = scan_for_pii_leakage(request.screen_state)

    # STRICT SERVER DEFENSE IN DEPTH: If unredacted PII is detected, REJECT request
    if not pii_report["clean"]:
        e2e_ms = round((time.perf_counter() - t_req_start) * 1000, 2)
        record_request_metrics(
            session_id=sid,
            stage_latencies={"pii_scan_ms": t_pii.elapsed_ms, "llm_call_ms": 0.0, "validation_ms": 0.0, "e2e_ms": e2e_ms},
            validation_passed=False,
            pii_flagged=True,
            action_type="rejected",
        )
        logger.warning("Session '%s' REJECTED: Server-side PII audit detected unredacted PII", sid)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "TRANSMISSION_REJECTED: Server-side PII audit detected unredacted sensitive data",
                "leaks": pii_report["flagged_elements"],
            },
        )

    # Pre-inference Prompt-injection Check on goal
    goal_inj_check = check_for_injection_signs({"reasoning": request.goal}, request.screen_state)
    if goal_inj_check["suspicious"]:
        e2e_ms = round((time.perf_counter() - t_req_start) * 1000, 2)
        record_request_metrics(
            session_id=sid,
            stage_latencies={"pii_scan_ms": t_pii.elapsed_ms, "llm_call_ms": 0.0, "validation_ms": 0.0, "e2e_ms": e2e_ms},
            validation_passed=False,
            injection_flagged=True,
            action_type="rejected",
        )
        logger.warning("Session '%s' REJECTED: Prompt injection detected in goal", sid)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INJECTION_BLOCKED: Prompt injection or adversarial instruction detected in goal",
                "matched_patterns": goal_inj_check["matched_patterns"],
            },
        )

    # ---- Step 4: Call LLM reasoning module (Person A) with Zero-Crash Fallback ----
    raw_action_dict: dict[str, Any]
    with StageTimer("llm_call_ms") as t_llm:
        try:
            raw_action_dict = get_next_action(
                screen_state=request.screen_state.model_dump(),
                goal=request.goal,
                history=request.action_history,
                screenshot_b64=request.screenshot_b64,
            )
        except Exception as e:
            logger.error("LLM reasoning call encountered an exception: %s", e)
            raw_action_dict = {
                "action_type": "wait",
                "target_element_id": None,
                "value": None,
                "reasoning": f"[LLM_FALLBACK] LLM inference unavailable ({str(e)}). Applying safe wait fallback.",
            }

    # ---- Step 5: Post-inference Prompt-Injection Heuristic Check ----
    with StageTimer("inj_scan_ms") as t_inj:
        inj_report = check_for_injection_signs(raw_action_dict, request.screen_state)

    if inj_report["suspicious"]:
        logger.warning("Post-inference prompt injection detected: %s. Replacing with safe wait.", inj_report["matched_patterns"])
        raw_action_dict = {
            "action_type": "wait",
            "target_element_id": None,
            "value": None,
            "reasoning": f"[INJECTION_BLOCKED] Adversarial instruction pattern detected ({inj_report['matched_patterns']}). Action overridden.",
        }

    # ---- Step 6: PERSON B VALIDATION, ANTI-HALLUCINATION & LOOP GUARD ----
    with StageTimer("validation_ms") as t_val:
        safe_action_dict = validate_and_finalize(
            raw_action=raw_action_dict,
            element_list=request.screen_state.elements,
            action_history=session["history"],
        )

    e2e_ms = round((time.perf_counter() - t_req_start) * 1000, 2)

    # Determine validation failure triggers
    is_hallucination = "Hallucination detected" in safe_action_dict.get("reasoning", "")
    is_loop = "[ACTION_LOOP_DETECTED]" in safe_action_dict.get("reasoning", "")
    validation_passed = (
        safe_action_dict.get("action_type") == raw_action_dict.get("action_type")
        and safe_action_dict.get("target_element_id") == raw_action_dict.get("target_element_id")
        and not (is_hallucination or is_loop)
    )

    # ---- Step 7: Record Telemetry into Metrics Store ----
    record_request_metrics(
        session_id=sid,
        stage_latencies={
            "pii_scan_ms": t_pii.elapsed_ms,
            "llm_call_ms": t_llm.elapsed_ms,
            "validation_ms": t_val.elapsed_ms,
            "e2e_ms": e2e_ms,
        },
        validation_passed=validation_passed,
        is_hallucination=is_hallucination,
        is_loop=is_loop,
        pii_flagged=not pii_report["clean"],
        injection_flagged=inj_report["suspicious"],
        action_type=safe_action_dict.get("action_type"),
    )

    final_action = RawAction(**safe_action_dict)

    # ---- Step 8: Update session state ----
    action_desc = f"{final_action.action_type}"
    if final_action.target_element_id:
        action_desc += f" element {final_action.target_element_id}"
    if final_action.value:
        action_desc += f" (value: '{final_action.value}')"

    session["step_count"] += 1
    session["history"].append(action_desc)
    logger.info(
        "Session '%s' step %d: %s (LLM: %sms, Val: %sms, E2E: %sms)",
        sid,
        session["step_count"],
        action_desc,
        t_llm.elapsed_ms,
        t_val.elapsed_ms,
        e2e_ms,
    )

    # ---- Step 9: Determine task status and return ----
    task_status = "done" if final_action.action_type == "done" else "in_progress"

    return AgentResponse(
        session_id=sid,
        action=final_action,
        task_status=task_status,
    )
