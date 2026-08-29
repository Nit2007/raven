"""
validation.py — Action validation and safety layer for the browser agent server.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Validation, hallucination check, and fallback engine.

This module sits directly after Person A's LLM reasoning call. It receives the
raw proposed action from the LLM and the list of elements that were sent to it,
performing strict safety checks:

1. Action Schema Verification:
   Ensures `action_type` is strictly one of the 5 allowed values:
   ("click", "type", "scroll", "wait", "done").

2. Hallucination Detection:
   Ensures `target_element_id` actually exists in the provided `element_list`.
   LLMs frequently hallucinate nonexistent element IDs; this check intercepts
   such hallucinations before any real browser execution occurs.

3. Action-Specific Parameter Sanity:
   - For "click" and "type": requires a valid target element from the list.
   - For "type": ensures a valid string `value` is present to type.
   - For "wait" and "done": skips target element requirement.
   - For "scroll": accepts optional target element or page-level scroll.

4. Safe Fallback Generation:
   If any validation check fails, replaces the invalid/hallucinated action with
   a safe "wait" fallback action containing an explicit explanation in its
   reasoning field for logging and debugging.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Allowed action types defined by the browser extension data contract
ALLOWED_ACTION_TYPES: set[str] = {"click", "type", "scroll", "wait", "done"}


def _extract_element_id(el: Any) -> Optional[str]:
    """Helper to extract string ID from either dict or Pydantic model."""
    if isinstance(el, dict):
        val = el.get("id")
        return str(val) if val is not None else None
    if hasattr(el, "id"):
        val = getattr(el, "id")
        return str(val) if val is not None else None
    return None


def validate_and_finalize(
    raw_action: dict[str, Any],
    element_list: list[Any],
) -> dict[str, Any]:
    """Validate the LLM's proposed raw_action against visible screen elements.

    If valid, returns the normalized action dict.
    If invalid or hallucinated, intercepts and returns a safe "wait" fallback
    action with an explanatory reasoning note.

    Args:
        raw_action: The raw action dictionary produced by the LLM reasoning
                    module, containing:
                    - action_type (str)
                    - target_element_id (str | None)
                    - value (str | None)
                    - reasoning (str)
        element_list: List of element dicts or objects visible on screen,
                      each containing an 'id' field.

    Returns:
        A validated safe_action dict adhering to the data contract:
        {
            "action_type": "click" | "type" | "scroll" | "wait" | "done",
            "target_element_id": str | None,
            "value": str | None,
            "reasoning": str
        }
    """
    action_type = raw_action.get("action_type")
    target_element_id = raw_action.get("target_element_id")
    value = raw_action.get("value")
    reasoning = raw_action.get("reasoning", "")

    # Normalize target_element_id to string if provided as int/float
    if target_element_id is not None:
        target_element_id = str(target_element_id).strip()

    # Collect all valid element IDs from the current screen state
    valid_ids: set[str] = set()
    for el in element_list:
        el_id = _extract_element_id(el)
        if el_id:
            valid_ids.add(el_id)

    # -----------------------------------------------------------------------
    # Check 1: Action Type Validity
    # -----------------------------------------------------------------------
    if not isinstance(action_type, str) or action_type not in ALLOWED_ACTION_TYPES:
        failure_reason = (
            f"[VALIDATION_FAILED] Invalid action_type '{action_type}'. "
            f"Must be one of {sorted(ALLOWED_ACTION_TYPES)}. Defaulting to safe wait."
        )
        logger.warning(failure_reason)
        return {
            "action_type": "wait",
            "target_element_id": None,
            "value": None,
            "reasoning": failure_reason,
        }

    # -----------------------------------------------------------------------
    # Check 2: Element ID Hallucination Check for Targeted Actions
    # -----------------------------------------------------------------------
    # Actions that MUST target a concrete element on the page
    if action_type in {"click", "type"}:
        if not target_element_id:
            failure_reason = (
                f"[VALIDATION_FAILED] Action '{action_type}' requires a "
                f"target_element_id, but none was provided. Defaulting to safe wait."
            )
            logger.warning(failure_reason)
            return {
                "action_type": "wait",
                "target_element_id": None,
                "value": None,
                "reasoning": failure_reason,
            }

        if target_element_id not in valid_ids:
            failure_reason = (
                f"[VALIDATION_FAILED] Hallucination detected: target_element_id "
                f"'{target_element_id}' is not in the visible screen elements list "
                f"(valid IDs: {sorted(list(valid_ids)) or 'None'}). Defaulting to safe wait."
            )
            logger.warning(failure_reason)
            return {
                "action_type": "wait",
                "target_element_id": None,
                "value": None,
                "reasoning": failure_reason,
            }

    # -----------------------------------------------------------------------
    # Check 3: Parameter Sanity for Type Action
    # -----------------------------------------------------------------------
    if action_type == "type":
        if value is None:
            # Fallback text if model forgot value
            value = ""
            logger.warning("Action 'type' had null value, coerced to empty string.")

    # -----------------------------------------------------------------------
    # Check 4: Optional target_element_id for Scroll/Wait/Done
    # -----------------------------------------------------------------------
    if action_type in {"wait", "done"}:
        # Wait and Done do not execute on specific UI elements
        target_element_id = None
        value = None
    elif action_type == "scroll":
        # If model provided a target element ID for scroll, verify it or drop it
        if target_element_id and target_element_id not in valid_ids:
            logger.info(
                "Dropping invalid target_element_id '%s' for scroll action; "
                "treating as general page scroll.",
                target_element_id,
            )
            target_element_id = None

    # Action passed all validation gates successfully
    logger.info(
        "Validation passed for action '%s' on target '%s'.",
        action_type,
        target_element_id,
    )
    return {
        "action_type": action_type,
        "target_element_id": target_element_id,
        "value": value,
        "reasoning": reasoning,
    }
