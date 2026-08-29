"""
main.py — FastAPI server for the browser agent reasoning and validation engine.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Components:
  - Person A: Server-side LLM reasoning endpoint & session state.
  - Person B: Validation, hallucination check, PII audit, injection scan, and metrics.

Endpoints:
  POST /agent/act   — Receive sanitized screen state, reason with LLM, validate & return action
  GET  /health      — Server health status
  GET  /metrics     — Live telemetry & safety audit metrics (Person B)
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from llm_module import get_next_action
from validation import validate_and_finalize
from pii_check import scan_for_pii_leakage
from injection_check import check_for_injection_signs
from metrics import record_request_metrics, get_metrics_summary

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
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SIH26171 Browser Agent Reasoning & Validation Server",
    description=(
        "Receives sanitized screen state from the browser extension, "
        "reasons over it using an LLM (Person A), validates safety and "
        "guards against hallucinations (Person B), and returns the next UI action."
    ),
    version="0.2.0",
)


@app.get("/health")
async def health_check():
    """Health check endpoint.

    Returns 200 with service status.
    """
    return {"status": "ok", "service": "sih26171-reasoning-server"}


@app.get("/metrics")
async def metrics_endpoint():
    """Live metrics and safety telemetry endpoint (Person B).

    Exposes aggregate counts of total requests, validation pass/fail rates,
    secondary PII leak detections, prompt injection flags, and average stage
    latencies (LLM call ms, validation ms, e2e ms).
    """
    return get_metrics_summary()


@app.post("/agent/act", response_model=AgentResponse)
async def agent_act(request: AgentRequest):
    """Process a screen state and return the next validated browser action.

    Pipeline Flow:
      1. Session management & step cap enforcement (Person A).
      2. LLM reasoning via function calling to produce raw_action (Person A).
      3. Secondary PII sanity audit on screen_state text fields (Person B).
      4. Prompt-injection heuristic scan on reasoning/elements (Person B).
      5. Hallucination & schema validation with safe fallback (Person B).
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
        # Record step-cap telemetry
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

    # ---- Step 3: Call LLM reasoning module (Person A) ----
    t_llm_start = time.perf_counter()
    try:
        raw_action_dict = get_next_action(
            screen_state=request.screen_state.model_dump(),
            goal=request.goal,
            history=request.action_history,
            screenshot_b64=request.screenshot_b64,
        )
    except Exception as e:
        logger.error("Unexpected error in get_next_action: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"LLM reasoning failed: {str(e)}",
        )
    t_llm_end = time.perf_counter()
    llm_call_ms = round((t_llm_end - t_llm_start) * 1000, 2)

    # ---- Step 4: PERSON B VALIDATION, SAFETY & METRICS HOOK ----
    t_val_start = time.perf_counter()

    # 4A: Secondary PII Sanity Scan (Defense-in-depth, non-blocking)
    pii_report = scan_for_pii_leakage(request.screen_state)

    # 4B: Prompt-Injection Heuristic Check
    inj_report = check_for_injection_signs(raw_action_dict, request.screen_state)

    # 4C: Hallucination & Schema Validation (intercepts bad/hallucinated actions)
    safe_action_dict = validate_and_finalize(
        raw_action=raw_action_dict,
        element_list=request.screen_state.elements,
    )
    t_val_end = time.perf_counter()
    validation_ms = round((t_val_end - t_val_start) * 1000, 2)
    e2e_ms = round((time.perf_counter() - t_req_start) * 1000, 2)

    # Check whether the action passed without needing fallback modification
    validation_passed = (
        safe_action_dict.get("action_type") == raw_action_dict.get("action_type")
        and safe_action_dict.get("target_element_id") == raw_action_dict.get("target_element_id")
    )

    # 4D: Record Telemetry in Metrics Registry
    record_request_metrics(
        session_id=sid,
        stage_latencies={
            "llm_call_ms": llm_call_ms,
            "validation_ms": validation_ms,
            "e2e_ms": e2e_ms,
        },
        validation_passed=validation_passed,
        pii_flagged=not pii_report["clean"],
        injection_flagged=inj_report["suspicious"],
        action_type=safe_action_dict.get("action_type"),
    )

    final_action = RawAction(**safe_action_dict)

    # ---- Step 5: Update session state ----
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
        llm_call_ms,
        validation_ms,
        e2e_ms,
    )

    # ---- Step 6: Determine task status and return ----
    task_status = "done" if final_action.action_type == "done" else "in_progress"

    return AgentResponse(
        session_id=sid,
        action=final_action,
        task_status=task_status,
    )
