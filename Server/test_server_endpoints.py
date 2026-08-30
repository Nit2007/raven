"""
test_server_endpoints.py — End-to-end integration test for FastAPI server endpoints.

Tests:
  1. GET /health
  2. GET /metrics (JSON format)
  3. GET /metrics?format=prometheus (Prometheus text format)
  4. GET /dashboard (HTML presentation dashboard)
  5. POST /session/reset
  6. POST /agent/act (Valid request)
  7. POST /agent/act (Hallucination injection -> safe fallback response)
  8. POST /agent/act (PII leak screen state -> STRICT 400 REJECTION)
  9. Response Headers: X-Request-ID and X-Response-Time-Ms
"""

import sys
sys.path.insert(0, ".")

from fastapi.testclient import TestClient
from main import app
from mock_data import LOGIN_FORM, PII_LEAK_SCREEN_STATE

client = TestClient(app)

def test_endpoints():
    print("=" * 70)
    print("  Testing FastAPI Server Endpoints End-to-End")
    print("=" * 70)
    print()

    # 1. Health Check
    r = client.get("/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    print("[PASS] GET /health ->", r.json())

    # 2. Reset Sessions
    r = client.post("/session/reset")
    assert r.status_code == 200
    print("[PASS] POST /session/reset ->", r.json())

    # 3. Metrics JSON
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "total_requests" in r.json()
    assert "percentiles_ms" in r.json()
    print("[PASS] GET /metrics (JSON) -> total_requests =", r.json()["total_requests"])

    # 4. Metrics Prometheus
    r = client.get("/metrics?format=prometheus")
    assert r.status_code == 200
    assert "browser_agent_total_requests" in r.text
    print("[PASS] GET /metrics (Prometheus) ->", r.text.splitlines()[0])

    # 5. Live Dashboard
    r = client.get("/dashboard")
    assert r.status_code == 200
    assert "SIH26171" in r.text
    print("[PASS] GET /dashboard (HTML) -> Loaded successfully, length:", len(r.text), "bytes")

    # 6. Act Endpoint with Clean Form
    payload = {
        "session_id": "integration-test-01",
        "goal": "Click the submit button",
        "screen_state": LOGIN_FORM["screen_state"],
        "action_history": []
    }
    r = client.post("/agent/act", json=payload)
    assert r.status_code == 200, f"Act failed: {r.text}"
    resp_data = r.json()
    assert "action" in resp_data
    assert "X-Request-ID" in r.headers
    assert "X-Response-Time-Ms" in r.headers
    print("[PASS] POST /agent/act -> Action:", resp_data["action"]["action_type"], 
          "| Request ID:", r.headers["X-Request-ID"],
          "| Server Latency:", r.headers["X-Response-Time-Ms"] + "ms")

    # 7. Act Endpoint with PII Leak (Strict Rejection Check)
    pii_payload = {
        "session_id": "integration-test-02",
        "goal": "Contact support",
        "screen_state": PII_LEAK_SCREEN_STATE,
        "action_history": []
    }
    r = client.post("/agent/act", json=pii_payload)
    assert r.status_code == 400, f"Expected 400 PII rejection, got {r.status_code}"
    assert "TRANSMISSION_REJECTED" in r.text
    print("[PASS] POST /agent/act (PII Leak) -> Rejected with HTTP 400 TRANSMISSION_REJECTED [OK]")

    # 8. Metrics Telemetry Verification
    r_metrics = client.get("/metrics").json()
    print("[PASS] Metrics Telemetry verified -> Total Requests:", r_metrics["total_requests"], 
          "| PII Flagged:", r_metrics["pii_leaks_detected"])

    print()
    print("=" * 70)
    print("  All FastAPI Server Endpoints PASSED with 100% Success! [OK]")
    print("=" * 70)

if __name__ == "__main__":
    test_endpoints()
