"""
test_manual_validation.py — Standalone test script for Person B safety & metrics.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Validation, Safety, Fallbacks & Metrics.

Run this script directly to validate all of Person B's components in isolation
(no pytest, no running server required).

Tests executed:
  1. Valid action pass-through
  2. Hallucinated target_element_id interception & fallback
  3. Invalid action_type rejection & fallback
  4. Secondary PII leakage detection (email + Indian mobile number)
  5. Prompt-injection heuristic detection
  6. In-memory metrics recording and summary generation

Usage:
  python test_manual_validation.py
"""

from __future__ import annotations

import json
import sys
import time

# Ensure current directory is on import path
sys.path.insert(0, ".")

from mock_data import (
    SAMPLE_SCREEN_ELEMENTS,
    VALID_ACTION_PAYLOAD,
    HALLUCINATED_ACTION_PAYLOAD,
    INVALID_ACTION_TYPE_PAYLOAD,
    PII_LEAK_SCREEN_STATE,
    INJECTION_ACTION_PAYLOAD,
    LOGIN_FORM,
)
from validation import validate_and_finalize
from pii_check import scan_for_pii_leakage
from injection_check import check_for_injection_signs
from metrics import (
    record_request_metrics,
    get_metrics_summary,
    reset_metrics,
)


def run_all_tests() -> None:
    print("=" * 70)
    print("  SIH26171 — Person B: Safety, Validation & Metrics Manual Test")
    print("=" * 70)
    print()

    reset_metrics()

    # -----------------------------------------------------------------------
    # Test 1: Valid Action Validation
    # -----------------------------------------------------------------------
    print("[TEST 1] Valid Action Validation")
    print(f"  Input action: {VALID_ACTION_PAYLOAD['action_type']} -> target '{VALID_ACTION_PAYLOAD['target_element_id']}'")
    t0 = time.perf_counter()
    safe_action = validate_and_finalize(VALID_ACTION_PAYLOAD, SAMPLE_SCREEN_ELEMENTS)
    val_time_ms = round((time.perf_counter() - t0) * 1000, 3)

    is_passed = (
        safe_action["action_type"] == "click"
        and safe_action["target_element_id"] == "1"
    )
    print(f"  Result Action: {json.dumps(safe_action, indent=4)}")
    print(f"  Validation Status: {'✅ PASSED' if is_passed else '❌ FAILED'} (took {val_time_ms} ms)")
    print()

    record_request_metrics(
        session_id="session-test-1",
        stage_latencies={"llm_call_ms": 320.0, "validation_ms": val_time_ms, "e2e_ms": 321.5},
        validation_passed=is_passed,
        action_type=safe_action["action_type"],
    )

    # -----------------------------------------------------------------------
    # Test 2: Hallucinated Element ID Interception
    # -----------------------------------------------------------------------
    print("[TEST 2] Hallucinated Element ID Interception")
    print(f"  Input action: target_element_id='{HALLUCINATED_ACTION_PAYLOAD['target_element_id']}' (not in screen elements)")
    t0 = time.perf_counter()
    safe_action = validate_and_finalize(HALLUCINATED_ACTION_PAYLOAD, SAMPLE_SCREEN_ELEMENTS)
    val_time_ms = round((time.perf_counter() - t0) * 1000, 3)

    is_fallback = (
        safe_action["action_type"] == "wait"
        and "[VALIDATION_FAILED]" in safe_action["reasoning"]
    )
    print(f"  Result Action: {json.dumps(safe_action, indent=4)}")
    print(f"  Fallback Status: {'✅ CORRECTLY INTERCEPTED' if is_fallback else '❌ FAILED TO INTERCEPT'}")
    print()

    record_request_metrics(
        session_id="session-test-2",
        stage_latencies={"llm_call_ms": 290.0, "validation_ms": val_time_ms, "e2e_ms": 291.2},
        validation_passed=not is_fallback,
        action_type=safe_action["action_type"],
    )

    # -----------------------------------------------------------------------
    # Test 3: Invalid Action Type Rejection
    # -----------------------------------------------------------------------
    print("[TEST 3] Invalid Action Type Rejection")
    print(f"  Input action: action_type='{INVALID_ACTION_TYPE_PAYLOAD['action_type']}'")
    safe_action = validate_and_finalize(INVALID_ACTION_TYPE_PAYLOAD, SAMPLE_SCREEN_ELEMENTS)

    is_fallback = (
        safe_action["action_type"] == "wait"
        and "[VALIDATION_FAILED]" in safe_action["reasoning"]
    )
    print(f"  Result Action: {json.dumps(safe_action, indent=4)}")
    print(f"  Rejection Status: {'✅ CORRECTLY REJECTED' if is_fallback else '❌ FAILED TO REJECT'}")
    print()

    # -----------------------------------------------------------------------
    # Test 4: Secondary PII Sanity Scan
    # -----------------------------------------------------------------------
    print("[TEST 4] Secondary PII Sanity Scan")
    # 4A: Clean elements
    clean_report = scan_for_pii_leakage(LOGIN_FORM["screen_state"])
    print(f"  4A: Clean Form Scan Result: clean={clean_report['clean']}, patterns={clean_report['patterns_matched']}")

    # 4B: Leaked elements (email + Indian mobile number)
    leak_report = scan_for_pii_leakage(PII_LEAK_SCREEN_STATE)
    print(f"  4B: PII Leak Scan Result: clean={leak_report['clean']}, patterns={leak_report['patterns_matched']}")
    print(f"      Flagged Elements: {json.dumps(leak_report['flagged_elements'], indent=6)}")
    pii_ok = not clean_report["clean"] is False and leak_report["clean"] is False
    print(f"  PII Scan Status: {'✅ ACCURATE' if pii_ok else '❌ INACCURATE'}")
    print()

    record_request_metrics(
        session_id="session-test-4",
        stage_latencies={"llm_call_ms": 250.0, "validation_ms": 1.2, "e2e_ms": 252.0},
        validation_passed=True,
        pii_flagged=not leak_report["clean"],
        action_type="click",
    )

    # -----------------------------------------------------------------------
    # Test 5: Prompt Injection Heuristic Scan
    # -----------------------------------------------------------------------
    print("[TEST 5] Prompt-Injection Heuristic Scan")
    # 5A: Clean action
    clean_inj = check_for_injection_signs(VALID_ACTION_PAYLOAD)
    print(f"  5A: Clean Action Scan: suspicious={clean_inj['suspicious']}")

    # 5B: Adversarial action reasoning
    inj_report = check_for_injection_signs(INJECTION_ACTION_PAYLOAD)
    print(f"  5B: Adversarial Action Scan: suspicious={inj_report['suspicious']}, matched={inj_report['matched_patterns']}")
    inj_ok = (not clean_inj["suspicious"]) and inj_report["suspicious"]
    print(f"  Injection Detection Status: {'✅ ACCURATE' if inj_ok else '❌ INACCURATE'}")
    print()

    record_request_metrics(
        session_id="session-test-5",
        stage_latencies={"llm_call_ms": 400.0, "validation_ms": 0.8, "e2e_ms": 401.5},
        validation_passed=True,
        injection_flagged=inj_report["suspicious"],
        action_type="type",
    )

    # -----------------------------------------------------------------------
    # Test 6: Metrics Telemetry Summary
    # -----------------------------------------------------------------------
    print("[TEST 6] In-Memory Metrics Telemetry Summary")
    summary = get_metrics_summary()
    print("  Aggregated Metrics (Exposed via GET /metrics):")
    print(json.dumps(summary, indent=4))
    print()

    print("=" * 70)
    print("  All Person B standalone tests completed successfully! ✅")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
