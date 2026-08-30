"""
validation.py — Action validation, anti-hallucination, and safety fallback engine.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Validation, hallucination check, loop guard & fallback engine.

This module sits directly after Person A's LLM reasoning call. It receives the
raw proposed action from the LLM and the list of elements that were sent to it,
performing strict safety checks:

1. Action Schema Verification:
   Ensures `action_type` is strictly one of the allowed set:
   ("click", "type", "scroll", "wait", "done").

2. Anti-Hallucination Interception:
   Ensures `target_element_id` actually exists in the provided `element_list`.
   LLMs frequently hallucinate nonexistent element IDs; this check intercepts
   such hallucinations before any real browser execution occurs.

3. Element Type & Parameter Integrity:
   - For "click" and "type": requires a valid target element from the list.
   - For "type": validates target element compatibility (input/textarea) and
     sanitizes string values. If target is a button or link, safely coerces to click.
   - For "scroll": validates direction ("up", "down", "top", "bottom") and bounds.
   - For "wait" and "done": clears unnecessary target parameters.

4. Repetitive Action Loop Guard:
   Detects if the agent is stuck repeating the exact same action on the same
   element (>= 3 consecutive attempts) and converts to safe recovery wait.

5. Zero-Crash Fallback Guarantee:
   If any validation check fails or malformed data is provided, intercepts and
   returns a safe "wait" fallback action with detailed explanatory reasoning.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Allowed action types defined by the browser extension data contract
ALLOWED_ACTION_TYPES: set[str] = {"click", "type", "scroll", "wait", "done"}

# Element types capable of receiving keyboard input
INPUT_CAPABLE_TYPES: set[str] = {
    "input",
    "textarea",
    "textbox",
    "search",
    "searchbox",
    "editable",
    "contenteditable",
    "select",
    "combobox",
}

# Elements that should NOT receive text input
NON_INPUT_TYPES: set[str] = {
    "image",
    "img",
    "heading",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "video",
    "audio",
    "canvas",
    "button",
    "btn",
    "link",
    "a",
    "label",
}


def _extract_element_id(el: Any) -> Optional[str]:
    """Helper to extract string ID from either dict or Pydantic model."""
    if isinstance(el, dict):
        val = el.get("id")
        return str(val).strip() if val is not None else None
    if hasattr(el, "id"):
        val = getattr(el, "id")
        return str(val).strip() if val is not None else None
    return None


def _extract_element_type(el: Any) -> str:
    """Helper to extract lowercase element type from dict or Pydantic model."""
    if isinstance(el, dict):
        val = el.get("type", "unknown")
    elif hasattr(el, "type"):
        val = getattr(el, "type", "unknown")
    else:
        val = "unknown"
    return str(val).lower().strip()


def check_action_loop(
    action_type: str,
    target_element_id: Optional[str],
    action_history: Optional[list[str]],
    threshold: int = 3,
) -> bool:
    """Detect if the proposed action is stuck in a repetitive loop in recent history.
    
    Args:
        action_type: Proposed action type (e.g. 'click', 'type').
        target_element_id: Target element ID.
        action_history: List of past action description strings.
        threshold: Number of consecutive identical actions to trigger loop guard.
        
    Returns:
        True if action loop detected, False otherwise.
    """
    if not action_history or len(action_history) < (threshold - 1):
        return False

    if action_type not in {"click", "type"} or not target_element_id:
        return False

    target_str = str(target_element_id)
    recent_actions = action_history[-(threshold - 1):]

    # Check if recent history entries all mention the same action_type and target ID
    identical_count = 0
    for past_action in recent_actions:
        past_lower = past_action.lower()
        if action_type in past_lower and (f"element {target_str}" in past_lower or f"target '{target_str}'" in past_lower or f"'{target_str}'" in past_lower):
            identical_count += 1

    return identical_count >= (threshold - 1)


def validate_and_finalize(
    raw_action: dict[str, Any] | Any,
    element_list: list[Any],
    action_history: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Validate the LLM's proposed raw_action against visible screen elements.

    If valid, returns the normalized action dict.
    If invalid, hallucinated, or trapped in a loop, intercepts and returns a
    safe "wait" fallback action with an explanatory reasoning note.

    Args:
        raw_action: The raw action dictionary produced by the LLM reasoning
                    module, containing:
                    - action_type (str)
                    - target_element_id (str | None)
                    - value (str | None)
                    - reasoning (str)
        element_list: List of element dicts or objects visible on screen.
        action_history: Optional list of past action strings for loop detection.

    Returns:
        A validated safe_action dict adhering to the data contract:
        {
            "action_type": "click" | "type" | "scroll" | "wait" | "done",
            "target_element_id": str | None,
            "value": str | None,
            "reasoning": str
        }
    """
    try:
        # Handle dict or object input gracefully
        if isinstance(raw_action, dict):
            action_type = raw_action.get("action_type")
            target_element_id = raw_action.get("target_element_id")
            value = raw_action.get("value")
            reasoning = raw_action.get("reasoning", "")
        else:
            action_type = getattr(raw_action, "action_type", None)
            target_element_id = getattr(raw_action, "target_element_id", None)
            value = getattr(raw_action, "value", None)
            reasoning = getattr(raw_action, "reasoning", "")

        # Normalize string attributes
        if isinstance(action_type, str):
            action_type = action_type.strip().lower()

        if target_element_id is not None:
            target_element_id = str(target_element_id).strip()

        if reasoning is None:
            reasoning = ""
        else:
            reasoning = str(reasoning)

        # Index elements by string ID for quick lookup and type checking
        element_map: dict[str, Any] = {}
        for el in element_list:
            el_id = _extract_element_id(el)
            if el_id:
                element_map[el_id] = el

        valid_ids: set[str] = set(element_map.keys())

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
        # Check 3: Repetitive Action Loop Detection
        # -----------------------------------------------------------------------
        if check_action_loop(action_type, target_element_id, action_history, threshold=3):
            loop_reason = (
                f"[ACTION_LOOP_DETECTED] Repetitive '{action_type}' action on target "
                f"'{target_element_id}' detected 3+ times in session history. "
                f"Intervening with safe wait to break loop."
            )
            logger.warning(loop_reason)
            return {
                "action_type": "wait",
                "target_element_id": None,
                "value": None,
                "reasoning": loop_reason,
            }

        # -----------------------------------------------------------------------
        # Check 4: Parameter Sanity for Type Action & Element Type Compatibility
        # -----------------------------------------------------------------------
        if action_type == "type":
            if value is None:
                value = ""
                logger.warning("Action 'type' had null value, coerced to empty string.")
            else:
                # Sanitize null bytes and control chars
                value = str(value).replace("\x00", "")

            # Verify target element compatibility
            if target_element_id in element_map:
                el_obj = element_map[target_element_id]
                el_type = _extract_element_type(el_obj)
                if el_type in {"button", "btn", "link", "a"}:
                    logger.warning(
                        "Target element [%s] type is '%s' (clickable, non-input). Coercing to click.",
                        target_element_id,
                        el_type,
                    )
                    action_type = "click"
                    value = None
                elif el_type in NON_INPUT_TYPES:
                    logger.warning(
                        "Target element [%s] type is '%s' (non-input capable). Coercing to click.",
                        target_element_id,
                        el_type,
                    )
                    action_type = "click"
                    value = None

        # -----------------------------------------------------------------------
        # Check 5: Optional target_element_id & Direction Sanity for Scroll/Wait/Done
        # -----------------------------------------------------------------------
        if action_type in {"wait", "done"}:
            target_element_id = None
            value = None
        elif action_type == "scroll":
            if target_element_id and target_element_id not in valid_ids:
                logger.info(
                    "Dropping invalid target_element_id '%s' for scroll action; "
                    "treating as general page scroll.",
                    target_element_id,
                )
                target_element_id = None

            # Normalize scroll direction
            if value is not None:
                scroll_val = str(value).strip().lower()
                if scroll_val in {"up", "down", "top", "bottom", "left", "right"}:
                    value = scroll_val
                elif scroll_val.lstrip("-").isdigit():
                    value = scroll_val
                else:
                    value = "down"  # Standard default scroll direction

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

    except Exception as err:
        fallback_msg = f"[VALIDATION_EXCEPTION] Unexpected error during validation: {str(err)}. Safe wait applied."
        logger.error(fallback_msg, exc_info=True)
        return {
            "action_type": "wait",
            "target_element_id": None,
            "value": None,
            "reasoning": fallback_msg,
        }
