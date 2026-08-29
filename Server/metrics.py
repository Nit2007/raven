"""
metrics.py — In-memory latency, validation, and safety telemetry store.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Metrics collection & observability pipeline.

This module aggregates end-to-end performance and safety telemetry:
  - Per-stage latency measurement (LLM call time, validation time, total request time)
  - Validation pass vs. fallback/failure counts
  - Secondary PII leak detection counts
  - Prompt-injection security alert counts

Data is stored in-memory (thread-safe, capped ring buffer) and exposed via
the `get_metrics_summary()` function for consumption by FastAPI's `GET /metrics`.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Maximum number of individual request telemetry records to retain in memory
MAX_HISTORY_ENTRIES: int = 500


class MetricsStore:
    """Thread-safe in-memory metrics registry for latency and security audits."""

    def __init__(self, max_history: int = MAX_HISTORY_ENTRIES) -> None:
        self._lock = threading.Lock()
        self._max_history = max_history

        self._total_requests: int = 0
        self._validation_pass_count: int = 0
        self._validation_failure_count: int = 0
        self._pii_leaks_detected: int = 0
        self._injection_flags_count: int = 0

        # Accumulators for calculating rolling averages
        self._latency_sums_ms: dict[str, float] = {}
        self._latency_counts: dict[str, int] = {}

        # Circular buffer for recent request records
        self._history: deque[dict[str, Any]] = deque(maxlen=max_history)

    def record_request_metrics(
        self,
        session_id: str,
        stage_latencies: dict[str, float],
        validation_passed: bool,
        pii_flagged: bool = False,
        injection_flagged: bool = False,
        action_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """Record telemetry for a completed request.

        Args:
            session_id: Client session identifier.
            stage_latencies: Dictionary of stage names to duration in milliseconds
                             (e.g., {"llm_call_ms": 350.2, "validation_ms": 1.4, "e2e_ms": 360.5}).
            validation_passed: True if the LLM action was valid; False if it was intercepted.
            pii_flagged: True if unredacted PII patterns were detected.
            injection_flagged: True if prompt-injection signatures were detected.
            action_type: Final action type executed (or fallback).

        Returns:
            The recorded event dictionary.
        """
        now_ts = time.time()

        record = {
            "session_id": session_id,
            "timestamp": now_ts,
            "action_type": action_type,
            "stage_latencies_ms": stage_latencies,
            "validation_passed": validation_passed,
            "pii_flagged": pii_flagged,
            "injection_flagged": injection_flagged,
        }

        with self._lock:
            self._total_requests += 1
            if validation_passed:
                self._validation_pass_count += 1
            else:
                self._validation_failure_count += 1

            if pii_flagged:
                self._pii_leaks_detected += 1

            if injection_flagged:
                self._injection_flags_count += 1

            # Accumulate latencies for averaging
            for stage, ms in stage_latencies.items():
                if isinstance(ms, (int, float)):
                    self._latency_sums_ms[stage] = self._latency_sums_ms.get(stage, 0.0) + float(ms)
                    self._latency_counts[stage] = self._latency_counts.get(stage, 0) + 1

            self._history.append(record)

        logger.debug("Recorded metrics for session '%s': %s", session_id, stage_latencies)
        return record

    def get_metrics_summary(self) -> dict[str, Any]:
        """Generate an aggregated telemetry summary dictionary.

        Returns:
            Dictionary with overall counts, average latencies per stage,
            and the most recent request entries.
        """
        with self._lock:
            avg_latencies: dict[str, float] = {}
            for stage, total_sum in self._latency_sums_ms.items():
                count = self._latency_counts.get(stage, 0)
                if count > 0:
                    avg_latencies[stage] = round(total_sum / count, 2)

            recent_records = list(self._history)[-10:]

            return {
                "total_requests": self._total_requests,
                "validation_passed": self._validation_pass_count,
                "validation_failures": self._validation_failure_count,
                "validation_pass_rate_pct": (
                    round((self._validation_pass_count / self._total_requests) * 100, 1)
                    if self._total_requests > 0
                    else 100.0
                ),
                "pii_leaks_detected": self._pii_leaks_detected,
                "injection_flags_count": self._injection_flags_count,
                "avg_latencies_ms": avg_latencies,
                "recent_requests_count": len(recent_records),
                "recent_requests": recent_records,
            }

    def reset(self) -> None:
        """Reset all metrics back to zero (primarily for unit test isolation)."""
        with self._lock:
            self._total_requests = 0
            self._validation_pass_count = 0
            self._validation_failure_count = 0
            self._pii_leaks_detected = 0
            self._injection_flags_count = 0
            self._latency_sums_ms.clear()
            self._latency_counts.clear()
            self._history.clear()


# Global singleton instance for application-wide metrics tracking
_global_metrics_store = MetricsStore()


def record_request_metrics(
    session_id: str,
    stage_latencies: dict[str, float],
    validation_passed: bool,
    pii_flagged: bool = False,
    injection_flagged: bool = False,
    action_type: Optional[str] = None,
) -> dict[str, Any]:
    """Module-level helper to record metrics into global store."""
    return _global_metrics_store.record_request_metrics(
        session_id=session_id,
        stage_latencies=stage_latencies,
        validation_passed=validation_passed,
        pii_flagged=pii_flagged,
        injection_flagged=injection_flagged,
        action_type=action_type,
    )


def get_metrics_summary() -> dict[str, Any]:
    """Module-level helper to retrieve global metrics summary."""
    return _global_metrics_store.get_metrics_summary()


def reset_metrics() -> None:
    """Module-level helper to reset global metrics store."""
    _global_metrics_store.reset()
