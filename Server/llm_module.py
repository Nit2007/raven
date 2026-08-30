"""
llm_module.py — Core LLM reasoning module for the browser agent server.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person A — Server-side reasoning via LLM structured output.

This module:
  1. Formats screen elements into a compact, numbered "Set-of-Mark" (SoM)
     text representation optimized for minimal token usage.
  2. Builds a system + user prompt constraining the LLM to a fixed action
     schema via function calling (OpenAI-compatible tool use).
  3. Calls the LLM via OpenRouter (OpenAI-compatible API) with structured
     output guaranteed by the `tools` parameter.
  4. On failure or malformed response, retries exactly once with a corrective
     instruction. On second failure, returns a safe fallback action.

The output is a raw_action dict matching the team's agreed data contract:
  { action_type, target_element_id, value, reasoning }

Environment variables (loaded from .env):
  OPENROUTER_API_KEY  — Your OpenRouter API key
  OPENROUTER_MODEL    — Model slug (default: "openrouter/free")
"""

from __future__ import annotations

import json
import os
import logging
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

logger = logging.getLogger(__name__)

# OpenRouter uses the OpenAI-compatible API with a different base URL
_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/free")
_BASE_URL: str = "https://openrouter.ai/api/v1"

# Lazy-init the client so import doesn't crash if key is missing
_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Return the OpenAI client, initializing on first call.

    Raises:
        RuntimeError: If OPENROUTER_API_KEY is not set in the environment.
    """
    global _client
    if _client is None:
        if not _API_KEY:
            raise RuntimeError(
                "OPENROUTER_API_KEY is not set. "
                "Copy .env.example to .env and add your key."
            )
        _client = OpenAI(
            api_key=_API_KEY,
            base_url=_BASE_URL,
            default_headers={
                # OpenRouter recommends these for analytics/ranking
                "HTTP-Referer": "https://sih26171-browser-agent.local",
                "X-Title": "SIH26171 Browser Agent",
            },
        )
    return _client


# ---------------------------------------------------------------------------
# Tool / Function-calling schema
# ---------------------------------------------------------------------------

# This is the structured output schema the LLM MUST conform to.
# Using OpenAI-compatible `tools` ensures the response is machine-parseable.
DECIDE_ACTION_TOOL = {
    "type": "function",
    "function": {
        "name": "decide_action",
        "description": (
            "Decide the single next browser UI action to perform. "
            "Pick an element from the numbered list provided. "
            "If the task goal is already achieved, use action_type 'done'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": ["click", "type", "scroll", "wait", "done"],
                    "description": (
                        "The type of action: click an element, type text "
                        "into an input, scroll the page, wait, or mark "
                        "the task as done."
                    ),
                },
                "target_element_id": {
                    "type": "string",
                    "description": (
                        "The ID of the target UI element from the numbered "
                        "list. Set to null for 'wait', 'scroll', or 'done' "
                        "if no specific element is targeted."
                    ),
                },
                "value": {
                    "type": "string",
                    "description": (
                        "For 'type': the text to enter. "
                        "For 'scroll': direction ('up' or 'down'). "
                        "Null for other action types."
                    ),
                },
                "reasoning": {
                    "type": "string",
                    "description": (
                        "A brief explanation (1-2 sentences) of why this "
                        "action was chosen given the goal and visible elements."
                    ),
                },
            },
            "required": ["action_type", "reasoning"],
        },
    },
}

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a browser automation decision engine. Your task:

1. You receive a numbered list of UI elements currently visible on screen,
   a task goal, and the history of actions already taken.
2. You must decide the SINGLE next action to perform to progress toward the goal.
3. Call the `decide_action` function with your decision.
4. Choose target_element_id from the element IDs in the list.
5. If the goal appears to be already achieved based on the visible elements,
   use action_type "done".
6. Never fabricate element IDs not present in the list.
7. For "type" actions, provide the text to enter in the "value" field.
8. Keep reasoning concise (1-2 sentences max).
9. If a field shows "[REDACTED]", it contains sensitive data handled by the
   client — do not attempt to read or reference its contents.""".strip()


# ---------------------------------------------------------------------------
# Element formatting
# ---------------------------------------------------------------------------


def format_elements_som(elements: list[dict]) -> str:
    """Convert screen elements to compact Set-of-Mark text representation.

    Each element becomes one line like:
        [1] button "Submit" at (120,340)-(180,370)
        [2] input type=password "[REDACTED]" at (50,100)-(300,130)

    This format is designed for minimal token usage while preserving all
    information the LLM needs to make a decision.

    Args:
        elements: List of element dicts from screen_state.elements, each
                  containing {id, type, bbox, text, dom_selector}.

    Returns:
        A newline-separated string of formatted element descriptions.
    """
    lines = []
    for el in elements:
        el_id = el.get("id", "?")
        el_type = el.get("type", "unknown")
        bbox = el.get("bbox", [0, 0, 0, 0])
        text = el.get("text", "")

        # Truncate long text to save tokens (keep first 60 chars)
        display_text = text if len(text) <= 60 else text[:57] + "..."

        # Format: [id] type "text" at (x1,y1)-(x2,y2)
        if display_text:
            line = (
                f'[{el_id}] {el_type} "{display_text}" '
                f"at ({bbox[0]},{bbox[1]})-({bbox[2]},{bbox[3]})"
            )
        else:
            line = (
                f"[{el_id}] {el_type} (empty) "
                f"at ({bbox[0]},{bbox[1]})-({bbox[2]},{bbox[3]})"
            )
        lines.append(line)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


def build_messages(
    som_text: str,
    goal: str,
    history: list[str],
    screenshot_b64: Optional[str] = None,
    correction: Optional[str] = None,
) -> list[dict]:
    """Build the messages array for the LLM chat completion call.

    Constructs a system prompt defining the agent's role and a user prompt
    containing the current screen state, goal, and action history. Optionally
    includes a base64-encoded redacted screenshot for vision-capable models.

    Args:
        som_text: The Set-of-Mark formatted element list string.
        goal: The task goal from the browser extension.
        history: List of string descriptions of previously taken actions.
        screenshot_b64: Optional base64-encoded redacted screenshot (JPEG/PNG).
                        If provided, sent as an image_url content block for
                        vision models. The extension handles all redaction.
        correction: Optional corrective instruction appended on retry, e.g.
                    "Your previous response was malformed. Please call the
                    decide_action function correctly."

    Returns:
        A list of message dicts ready for the OpenAI chat completion API.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Build user message content
    history_text = (
        "\n".join(f"  - {h}" for h in history[-5:]) if history else "  (none)"
    )

    user_text = (
        f"TASK GOAL: {goal}\n\n"
        f"RECENT ACTIONS:\n{history_text}\n\n"
        f"VISIBLE ELEMENTS:\n{som_text}\n\n"
        "What is the single next action?"
    )

    if correction:
        user_text += f"\n\nCORRECTION: {correction}"

    # If a screenshot is provided, use multimodal content blocks
    if screenshot_b64:
        user_content = [
            {"type": "text", "text": user_text},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{screenshot_b64}",
                    "detail": "low",  # "low" = fewer tokens, faster
                },
            },
        ]
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": user_text})

    return messages


# ---------------------------------------------------------------------------
# LLM call & retry logic
# ---------------------------------------------------------------------------

# Safe fallback returned when the LLM call fails after retry
_FALLBACK_ACTION: dict = {
    "action_type": "wait",
    "target_element_id": None,
    "value": None,
    "reasoning": "LLM call failed after retry — returning safe fallback action.",
}


def _call_llm(messages: list[dict]) -> dict:
    """Make a single LLM API call with function calling and parse the result.

    Args:
        messages: The messages array for the chat completion call.

    Returns:
        A raw_action dict parsed from the LLM's tool call response.

    Raises:
        ValueError: If the response has no tool calls or the arguments
                    cannot be parsed as valid JSON.
        Exception: Any API or network error from the OpenAI client.
    """
    client = _get_client()

    response = client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        tools=[DECIDE_ACTION_TOOL],
        tool_choice={"type": "function", "function": {"name": "decide_action"}},
        temperature=0.1,  # Low temp for deterministic action selection
        max_tokens=300,   # Actions are short; cap to save latency
    )

    choice = response.choices[0]

    # Extract the function call arguments
    if not choice.message.tool_calls:
        raise ValueError(
            "LLM response contained no tool calls. "
            f"Content: {choice.message.content}"
        )

    tool_call = choice.message.tool_calls[0]
    if tool_call.function.name != "decide_action":
        raise ValueError(
            f"Unexpected function name: {tool_call.function.name}"
        )

    args = json.loads(tool_call.function.arguments)

    # Normalize the output to match the exact data contract
    raw_action = {
        "action_type": args.get("action_type", "wait"),
        "target_element_id": args.get("target_element_id"),
        "value": args.get("value"),
        "reasoning": args.get("reasoning", "No reasoning provided."),
    }

    # Validate action_type is one of the allowed values
    allowed = {"click", "type", "scroll", "wait", "done"}
    if raw_action["action_type"] not in allowed:
        raise ValueError(
            f"Invalid action_type '{raw_action['action_type']}'. "
            f"Must be one of {allowed}."
        )

    return raw_action


def get_next_action(
    screen_state: dict,
    goal: str,
    history: list[str],
    screenshot_b64: Optional[str] = None,
) -> dict:
    """Determine the next browser action by reasoning over the screen state.

    This is the main entry point for the LLM reasoning module. It:
      1. Formats the element list into a compact Set-of-Mark representation.
      2. Builds system + user prompts for the LLM.
      3. Calls the LLM via OpenRouter with function calling.
      4. On failure, retries exactly once with a corrective instruction.
      5. On second failure, returns a safe fallback action (wait).

    Args:
        screen_state: Dict with "elements" key containing the list of
                      screen elements from the browser extension.
        goal: The task goal string (e.g., "Click the download button").
        history: List of string descriptions of previously taken actions.
        screenshot_b64: Optional base64-encoded redacted screenshot for
                        vision-capable models. Defaults to None (text-only).

    Returns:
        A raw_action dict matching the data contract:
        {
            "action_type": "click" | "type" | "scroll" | "wait" | "done",
            "target_element_id": str | None,
            "value": str | None,
            "reasoning": str
        }
    """
    elements = screen_state.get("elements", [])

    if not elements:
        return {
            "action_type": "wait",
            "target_element_id": None,
            "value": None,
            "reasoning": "No elements visible on screen — waiting.",
        }

    som_text = format_elements_som(elements)

    # --- Attempt 1 ---
    messages = build_messages(som_text, goal, history, screenshot_b64)

    try:
        raw_action = _call_llm(messages)
        logger.info("LLM call succeeded on first attempt.")
        return raw_action
    except Exception as e:
        logger.warning("LLM call failed on first attempt: %s", e)

    # --- Attempt 2 (retry with corrective instruction) ---
    correction = (
        "Your previous response was malformed or the API call failed. "
        "Please call the decide_action function correctly this time. "
        "You MUST use one of: click, type, scroll, wait, done."
    )
    messages_retry = build_messages(
        som_text, goal, history, screenshot_b64, correction=correction
    )

    try:
        raw_action = _call_llm(messages_retry)
        logger.info("LLM call succeeded on retry attempt.")
        return raw_action
    except Exception as e:
        logger.error("LLM call failed on retry attempt: %s", e)

    # --- Both attempts failed — return safe fallback ---
    logger.error("Returning fallback action after two failed LLM calls.")
    return _FALLBACK_ACTION.copy()
