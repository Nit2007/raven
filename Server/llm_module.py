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
                        "the task as completed."
                    ),
                },
                "target_element_id": {
                    "type": ["string", "null"],
                    "description": (
                        "The exact string ID of the target element from "
                        "the VISIBLE ELEMENTS list (e.g., '1', 'el_3'). "
                        "Required for click and type. Set to null for scroll/wait/done."
                    ),
                },
                "value": {
                    "type": ["string", "null"],
                    "description": (
                        "The text string to type into the target input element. "
                        "Only used when action_type is 'type'. Set to null otherwise."
                    ),
                },
                "reasoning": {
                    "type": "string",
                    "description": (
                        "Brief step-by-step reasoning explaining why this "
                        "action was chosen to advance toward the task goal."
                    ),
                },
            },
            "required": ["action_type", "target_element_id", "value", "reasoning"],
        },
    },
}


SYSTEM_PROMPT = """You are an autonomous browser agent. Your goal is to accomplish a user's task on a web page by taking one precise action at a time.

You are provided with:
  1. TASK GOAL: What the user wants to accomplish.
  2. RECENT ACTIONS: What you have done so far in this session.
  3. VISIBLE ELEMENTS: A numbered list of UI elements currently on screen, formatted as:
     [id] type "text" at (x1,y1)-(x2,y2)

RULES:
  - You MUST call the `decide_action` function with valid arguments.
  - Pick a target_element_id from the exact IDs listed in VISIBLE ELEMENTS.
  - If you need to click a button, link, or input, use action_type 'click'.
  - If you need to enter text into an input field, use action_type 'type' and supply the text in `value`.
  - If the page is still loading or no relevant element is visible yet, use action_type 'wait'.
  - If the user's goal has been fully accomplished, use action_type 'done'.
  - Never invent or hallucinate an element ID that is not in the VISIBLE ELEMENTS list.
  - Keep your `reasoning` concise (1-2 sentences).
"""

_FALLBACK_ACTION = {
    "action_type": "wait",
    "target_element_id": None,
    "value": None,
    "reasoning": (
        "[FALLBACK] Defaulting to safe wait action after unrecoverable "
        "LLM inference error."
    ),
}


def format_elements_som(elements: list[dict]) -> str:
    """Format screen elements into a compact Set-of-Mark (SoM) text list."""
    lines = []
    for el in elements:
        el_id = el.get("id", "?")
        el_type = el.get("type", "element")
        bbox = el.get("bbox", [0, 0, 0, 0])
        text = el.get("text", "")

        display_text = text if len(text) <= 60 else text[:57] + "..."

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


def build_messages(
    som_text: str,
    goal: str,
    history: list[str],
    screenshot_b64: Optional[str] = None,
    correction: Optional[str] = None,
) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

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

    if screenshot_b64:
        user_content = [
            {"type": "text", "text": user_text},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{screenshot_b64}",
                    "detail": "low",
                },
            },
        ]
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": user_text})

    return messages


def _call_llm(messages: list[dict]) -> dict:
    client = _get_client()

    response = client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        tools=[DECIDE_ACTION_TOOL],
        tool_choice={"type": "function", "function": {"name": "decide_action"}},
        temperature=0.1,
        max_tokens=256,
    )

    message = response.choices[0].message

    if not message.tool_calls:
        raise ValueError("LLM response did not contain a tool_call.")

    tool_call = message.tool_calls[0]
    raw_args = tool_call.function.arguments

    if isinstance(raw_args, str):
        parsed = json.loads(raw_args)
    elif isinstance(raw_args, dict):
        parsed = raw_args
    else:
        raise ValueError(f"Unexpected tool call arguments type: {type(raw_args)}")

    raw_action = {
        "action_type": str(parsed.get("action_type", "wait")).lower(),
        "target_element_id": parsed.get("target_element_id"),
        "value": parsed.get("value"),
        "reasoning": str(parsed.get("reasoning", "")),
    }

    if raw_action["target_element_id"] is not None:
        raw_action["target_element_id"] = str(raw_action["target_element_id"])

    return raw_action


def heuristic_action_fallback(elements: list[dict], goal: str) -> dict:
    """Heuristic fallback matcher when LLM call is unavailable or fails."""
    goal_lower = goal.lower()
    
    for el in elements:
        el_id = str(el.get("id", ""))
        text = str(el.get("text", "")).lower()
        selector = str(el.get("dom_selector", "")).lower()
        el_type = str(el.get("type", "")).lower()

        keywords = ["login", "enter", "submit", "sign in", "search", "btn", "button", "login-test"]
        for kw in keywords:
            if kw in goal_lower and (kw in text or kw in selector or kw in el_id or kw in el_type):
                logger.info("Heuristic fallback matched goal keyword '%s' to element '%s'", kw, el_id)
                return {
                    "action_type": "click",
                    "target_element_id": el_id,
                    "value": None,
                    "reasoning": f"Heuristic matched element '{el_id}' ({text[:30]}) for goal '{goal}'",
                }

    for el in elements:
        el_id = str(el.get("id", ""))
        el_type = str(el.get("type", "")).lower()
        if "button" in el_type or "a" in el_type or "submit" in el_type or "input" in el_type:
            return {
                "action_type": "click",
                "target_element_id": el_id,
                "value": None,
                "reasoning": f"Heuristic default clickable element '{el_id}' for goal '{goal}'",
            }

    return _FALLBACK_ACTION.copy()


def get_next_action(
    screen_state: dict,
    goal: str,
    history: list[str],
    screenshot_b64: Optional[str] = None,
) -> dict:
    elements = screen_state.get("elements", [])

    if not elements:
        return {
            "action_type": "wait",
            "target_element_id": None,
            "value": None,
            "reasoning": "No elements visible on screen — waiting.",
        }

    som_text = format_elements_som(elements)

    messages = build_messages(som_text, goal, history, screenshot_b64)

    try:
        raw_action = _call_llm(messages)
        logger.info("LLM call succeeded on first attempt.")
        return raw_action
    except Exception as e:
        logger.warning("LLM call failed on first attempt: %s", e)

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

    logger.info("Using smart heuristic action fallback after LLM call failure.")
    return heuristic_action_fallback(elements, goal)
