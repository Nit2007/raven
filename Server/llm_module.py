"""
llm_module.py — Core LLM reasoning module for the browser agent server.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person A — Server-side reasoning via LLM structured output.
"""

from __future__ import annotations

import json
import os
import logging
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
logger = logging.getLogger(__name__)

_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/free")
_BASE_URL: str = "https://openrouter.ai/api/v1"

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not _API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not set.")
        _client = OpenAI(
            api_key=_API_KEY,
            base_url=_BASE_URL,
            default_headers={
                "HTTP-Referer": "https://sih26171-browser-agent.local",
                "X-Title": "SIH26171 Browser Agent",
            },
        )
    return _client


DECIDE_ACTION_TOOL = {
    "type": "function",
    "function": {
        "name": "decide_action",
        "description": "Decide the single next browser UI action to perform.",
        "parameters": {
            "type": "object",
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": ["click", "type", "scroll", "wait", "done"],
                },
                "target_element_id": {
                    "type": ["string", "null"],
                },
                "value": {
                    "type": ["string", "null"],
                },
                "reasoning": {
                    "type": "string",
                },
            },
            "required": ["action_type", "target_element_id", "value", "reasoning"],
        },
    },
}


SYSTEM_PROMPT = """You are an autonomous browser agent. Your goal is to accomplish a user's task on a web page by taking one precise action at a time.

RULES:
  - You MUST call the `decide_action` function with valid arguments.
  - Pick a target_element_id from the exact IDs listed in VISIBLE ELEMENTS.
  - Use action_type 'click' for buttons/links.
  - Use action_type 'type' for text inputs.
  - Use action_type 'scroll' for scrolling down.
  - Use action_type 'done' when task is finished.
"""

_FALLBACK_ACTION = {
    "action_type": "wait",
    "target_element_id": None,
    "value": None,
    "reasoning": "[FALLBACK] Defaulting to safe wait action.",
}


def format_elements_som(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        el_id = el.get("id", "?")
        el_type = el.get("type", "element")
        bbox = el.get("bbox", [0, 0, 0, 0])
        text = el.get("text", "")
        display_text = text if len(text) <= 60 else text[:57] + "..."

        lines.append(f'[{el_id}] {el_type} "{display_text}" at ({bbox[0]},{bbox[1]})-({bbox[2]},{bbox[3]})')
    return "\n".join(lines)


def build_messages(
    som_text: str,
    goal: str,
    history: list[str],
    screenshot_b64: Optional[str] = None,
    correction: Optional[str] = None,
) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    history_text = "\n".join(f"  - {h}" for h in history[-5:]) if history else "  (none)"

    user_text = (
        f"TASK GOAL: {goal}\n\n"
        f"RECENT ACTIONS:\n{history_text}\n\n"
        f"VISIBLE ELEMENTS:\n{som_text}\n\n"
        "What is the single next action?"
    )

    if correction:
        user_text += f"\n\nCORRECTION: {correction}"

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

    parsed = json.loads(raw_args) if isinstance(raw_args, str) else raw_args

    raw_action = {
        "action_type": str(parsed.get("action_type", "wait")).lower(),
        "target_element_id": parsed.get("target_element_id"),
        "value": parsed.get("value"),
        "reasoning": str(parsed.get("reasoning", "")),
    }

    if raw_action["target_element_id"] is not None:
        raw_action["target_element_id"] = str(raw_action["target_element_id"])

    return raw_action


def heuristic_action_fallback(elements: list[dict], goal: str, history: list[str] = []) -> dict:
    """Heuristic fallback matcher when LLM call is unavailable or fails."""
    goal_lower = goal.lower()
    
    # 1. Completion check: if an action was already taken for a single-step goal, return 'done'
    if history and len(history) >= 1:
        last = str(history[-1]).lower()
        if "scroll" in goal_lower and "scroll" in last:
            return {
                "action_type": "done",
                "target_element_id": None,
                "value": None,
                "reasoning": "Scroll task completed after scroll execution.",
            }
        if "click" in goal_lower and "click" in last:
            return {
                "action_type": "done",
                "target_element_id": None,
                "value": None,
                "reasoning": "Click task completed after click execution.",
            }

    # 2. Scroll goal match
    if "scroll" in goal_lower:
        return {
            "action_type": "scroll",
            "target_element_id": None,
            "value": "DOWN",
            "reasoning": f"Executing scroll down for goal '{goal}'",
        }

    # 3. Type / Input goal match
    if "type" in goal_lower or "enter" in goal_lower or "search" in goal_lower:
        for el in elements:
            el_id = str(el.get("id", ""))
            el_type = str(el.get("type", "")).lower()
            if "input" in el_type or "text" in el_type or "search" in el_id.lower():
                return {
                    "action_type": "type",
                    "target_element_id": el_id,
                    "value": "SIH 2026",
                    "reasoning": f"Typing into input field '{el_id}'",
                }

    # 4. Click goal match
    keywords = ["login", "enter", "submit", "sign in", "search", "btn", "button", "login-test"]
    for el in elements:
        el_id = str(el.get("id", ""))
        text = str(el.get("text", "")).lower()
        selector = str(el.get("dom_selector", "")).lower()
        el_type = str(el.get("type", "")).lower()

        for kw in keywords:
            if kw in goal_lower and (kw in text or kw in selector or kw in el_id or kw in el_type):
                return {
                    "action_type": "click",
                    "target_element_id": el_id,
                    "value": None,
                    "reasoning": f"Heuristic matched click element '{el_id}' ({text[:30]})",
                }

    for el in elements:
        el_id = str(el.get("id", ""))
        el_type = str(el.get("type", "")).lower()
        if "button" in el_type or "a" in el_type or "submit" in el_type or "input" in el_type:
            return {
                "action_type": "click",
                "target_element_id": el_id,
                "value": None,
                "reasoning": f"Heuristic fallback clickable element '{el_id}'",
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
    return heuristic_action_fallback(elements, goal, history)
