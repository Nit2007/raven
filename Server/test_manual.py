"""
test_manual.py — Standalone LLM integration test (no pytest, no FastAPI).

Run this script directly to validate that the LLM module works in isolation
before starting the server. It calls get_next_action() with each mock scenario
and prints the raw_action result.

Usage:
  1. Copy .env.example to .env and set your OPENROUTER_API_KEY
  2. pip install -r requirements.txt
  3. python test_manual.py

Expected output: one raw_action dict per scenario, printed to stdout.
If the API key is missing or the LLM call fails, you'll see the fallback
action with reasoning "LLM call failed after retry".
"""

from __future__ import annotations

import json
import sys

# Ensure the project root is importable
sys.path.insert(0, ".")

from mock_data import ALL_SCENARIOS
from llm_module import get_next_action


def main() -> None:
    """Run each mock scenario through the LLM module and print results."""
    print("=" * 65)
    print("  SIH26171 — Manual LLM Integration Test")
    print("=" * 65)
    print()

    for scenario_name, payload in ALL_SCENARIOS:
        print(f"--- Scenario: {scenario_name} ---")
        print(f"  Goal: {payload['goal']}")
        print(f"  Elements: {len(payload['screen_state']['elements'])}")
        print(f"  History: {payload['action_history']}")
        print()

        try:
            raw_action = get_next_action(
                screen_state=payload["screen_state"],
                goal=payload["goal"],
                history=payload["action_history"],
                # No screenshot in mock tests — text-only mode
                screenshot_b64=None,
            )
        except Exception as e:
            print(f"  ERROR: {e}")
            print()
            continue

        print("  Result (raw_action):")
        print(f"  {json.dumps(raw_action, indent=4)}")
        print()

    print("=" * 65)
    print("  All scenarios complete.")
    print("=" * 65)


if __name__ == "__main__":
    main()
