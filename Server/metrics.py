"""
metrics.py — High-precision latency, statistical quantiles, and safety telemetry store.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Metrics collection & observability pipeline.

This module aggregates end-to-end performance and safety telemetry:
  - Per-stage high-resolution latency measurement (LLM, validation, PII, E2E)
  - Statistical quantiles: p50 (median), p90, p95, p99, min, max, avg
  - Action distribution tracking (click / type / scroll / wait / done)
  - Safety metrics: Validation pass rate, hallucinations caught, loop preventions,
    PII leaks detected, and prompt-injection flags
  - Dual export: JSON summary for web dashboards and Prometheus text format.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import deque
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Maximum number of individual request telemetry records to retain in memory
MAX_HISTORY_ENTRIES: int = 500
MAX_LATENCY_SAMPLES: int = 1000


class StageTimer:
    """High-precision context manager for timing pipeline stages in milliseconds."""

    def __init__(self, stage_name: str = "stage") -> None:
        self.stage_name = stage_name
        self.elapsed_ms: float = 0.0
        self._start_time: float = 0.0

    def __enter__(self) -> StageTimer:
        self._start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.elapsed_ms = round((time.perf_counter() - self._start_time) * 1000, 3)


def _compute_percentile(sorted_data: list[float], percentile: float) -> float:
    """Calculate percentile from a sorted list of float values."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (percentile / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(sorted_data[int(k)], 2)
    d0 = sorted_data[int(f)] * (c - k)
    d1 = sorted_data[int(c)] * (k - f)
    return round(d0 + d1, 2)


class MetricsStore:
    """Thread-safe in-memory metrics registry with statistical quantile computation."""

    def __init__(self, max_history: int = MAX_HISTORY_ENTRIES) -> None:
        self._lock = threading.Lock()
        self._max_history = max_history

        self._total_requests: int = 0
        self._validation_pass_count: int = 0
        self._validation_failure_count: int = 0
        self._hallucinations_caught: int = 0
        self._loops_prevented: int = 0
        self._pii_leaks_detected: int = 0
        self._injection_flags_count: int = 0

        # Action type distribution counters
        self._action_distribution: dict[str, int] = {
            "click": 0,
            "type": 0,
            "scroll": 0,
            "wait": 0,
            "done": 0,
        }

        # Sliding window samples per stage for percentile calculation
        self._stage_samples: dict[str, deque[float]] = {}

        # Accumulators for overall running averages
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
        is_hallucination: bool = False,
        is_loop: bool = False,
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
            is_hallucination: True if a hallucinated element ID was caught.
            is_loop: True if a repetitive action loop was prevented.

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
            "is_hallucination": is_hallucination,
            "is_loop": is_loop,
            "pii_flagged": pii_flagged,
            "injection_flagged": injection_flagged,
        }

        with self._lock:
            self._total_requests += 1
            if validation_passed:
                self._validation_pass_count += 1
            else:
                self._validation_failure_count += 1

            if is_hallucination:
                self._hallucinations_caught += 1

            if is_loop:
                self._loops_prevented += 1

            if pii_flagged:
                self._pii_leaks_detected += 1

            if injection_flagged:
                self._injection_flags_count += 1

            if action_type:
                norm_act = action_type.lower()
                self._action_distribution[norm_act] = (
                    self._action_distribution.get(norm_act, 0) + 1
                )

            # Store latencies in sliding window sample buffer
            for stage, ms in stage_latencies.items():
                if isinstance(ms, (int, float)):
                    fms = float(ms)
                    if stage not in self._stage_samples:
                        self._stage_samples[stage] = deque(maxlen=MAX_LATENCY_SAMPLES)
                    self._stage_samples[stage].append(fms)

                    self._latency_sums_ms[stage] = (
                        self._latency_sums_ms.get(stage, 0.0) + fms
                    )
                    self._latency_counts[stage] = (
                        self._latency_counts.get(stage, 0) + 1
                    )

            self._history.append(record)

        logger.debug("Recorded metrics for session '%s': %s", session_id, stage_latencies)
        return record

    def get_metrics_summary(self) -> dict[str, Any]:
        """Generate an aggregated telemetry summary dictionary with quantiles.

        Returns:
            Dictionary with overall counts, p50/p90/p95/p99 quantiles,
            action distributions, and recent request entries.
        """
        with self._lock:
            avg_latencies: dict[str, float] = {}
            percentiles: dict[str, dict[str, float]] = {}

            for stage, samples_deque in self._stage_samples.items():
                if samples_deque:
                    sorted_samples = sorted(list(samples_deque))
                    avg_val = round(sum(sorted_samples) / len(sorted_samples), 2)
                    avg_latencies[stage] = avg_val
                    percentiles[stage] = {
                        "p50": _compute_percentile(sorted_samples, 50),
                        "p90": _compute_percentile(sorted_samples, 90),
                        "p95": _compute_percentile(sorted_samples, 95),
                        "p99": _compute_percentile(sorted_samples, 99),
                        "min": round(sorted_samples[0], 2),
                        "max": round(sorted_samples[-1], 2),
                        "avg": avg_val,
                    }

            recent_records = list(self._history)[-15:]

            return {
                "total_requests": self._total_requests,
                "validation_passed": self._validation_pass_count,
                "validation_failures": self._validation_failure_count,
                "validation_pass_rate_pct": (
                    round((self._validation_pass_count / self._total_requests) * 100, 1)
                    if self._total_requests > 0
                    else 100.0
                ),
                "hallucinations_caught": self._hallucinations_caught,
                "loops_prevented": self._loops_prevented,
                "pii_leaks_detected": self._pii_leaks_detected,
                "injection_flags_count": self._injection_flags_count,
                "avg_latencies_ms": avg_latencies,
                "percentiles_ms": percentiles,
                "action_distribution": dict(self._action_distribution),
                "recent_requests_count": len(recent_records),
                "recent_requests": recent_records,
            }

    def get_prometheus_metrics(self) -> str:
        """Export metrics in standard Prometheus exposition format."""
        summary = self.get_metrics_summary()
        lines: list[str] = [
            "# HELP browser_agent_total_requests Total requests received",
            "# TYPE browser_agent_total_requests counter",
            f"browser_agent_total_requests {summary['total_requests']}",
            "",
            "# HELP browser_agent_validation_passed Validated actions count",
            "# TYPE browser_agent_validation_passed counter",
            f"browser_agent_validation_passed {summary['validation_passed']}",
            "",
            "# HELP browser_agent_hallucinations_caught Hallucinated element IDs intercepted",
            "# TYPE browser_agent_hallucinations_caught counter",
            f"browser_agent_hallucinations_caught {summary['hallucinations_caught']}",
            "",
            "# HELP browser_agent_pii_leaks_detected Secondary PII leaks detected",
            "# TYPE browser_agent_pii_leaks_detected counter",
            f"browser_agent_pii_leaks_detected {summary['pii_leaks_detected']}",
            "",
            "# HELP browser_agent_latency_ms Stage latency statistics in milliseconds",
            "# TYPE browser_agent_latency_ms gauge",
        ]

        for stage, stats in summary.get("percentiles_ms", {}).items():
            lines.append(f'browser_agent_latency_ms{{stage="{stage}",quantile="0.5"}} {stats["p50"]}')
            lines.append(f'browser_agent_latency_ms{{stage="{stage}",quantile="0.95"}} {stats["p95"]}')
            lines.append(f'browser_agent_latency_ms{{stage="{stage}",quantile="0.99"}} {stats["p99"]}')
            lines.append(f'browser_agent_latency_ms{{stage="{stage}",stat="avg"}} {stats["avg"]}')

        lines.append("")
        return "\n".join(lines)

    def reset(self) -> None:
        """Reset all metrics back to zero (primarily for unit test isolation)."""
        with self._lock:
            self._total_requests = 0
            self._validation_pass_count = 0
            self._validation_failure_count = 0
            self._hallucinations_caught = 0
            self._loops_prevented = 0
            self._pii_leaks_detected = 0
            self._injection_flags_count = 0
            self._action_distribution = {
                "click": 0,
                "type": 0,
                "scroll": 0,
                "wait": 0,
                "done": 0,
            }
            self._stage_samples.clear()
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
    is_hallucination: bool = False,
    is_loop: bool = False,
) -> dict[str, Any]:
    """Module-level helper to record metrics into global store."""
    return _global_metrics_store.record_request_metrics(
        session_id=session_id,
        stage_latencies=stage_latencies,
        validation_passed=validation_passed,
        pii_flagged=pii_flagged,
        injection_flagged=injection_flagged,
        action_type=action_type,
        is_hallucination=is_hallucination,
        is_loop=is_loop,
    )


def get_metrics_summary() -> dict[str, Any]:
    """Module-level helper to retrieve global metrics summary."""
    return _global_metrics_store.get_metrics_summary()


def get_prometheus_metrics() -> str:
    """Module-level helper to export global metrics in Prometheus text format."""
    return _global_metrics_store.get_prometheus_metrics()


def reset_metrics() -> None:
    """Module-level helper to reset global metrics store."""
    _global_metrics_store.reset()
