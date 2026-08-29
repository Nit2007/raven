"""
pii_check.py — Secondary server-side PII sanity scanner.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Defense-in-depth PII audit scanner.

Even though the browser extension performs client-side redaction (e.g. masking
passwords and personal data before transmission), this module acts as a secondary
defense-in-depth safety net on the server.

It scans all visible element `text` fields for potential unredacted sensitive
data:
  1. Email addresses (e.g. user@domain.com)
  2. Indian mobile phone numbers (+91 / 10-digit formats starting with 6-9)
  3. Aadhaar-like 12-digit number formats (xxxx xxxx xxxx)
  4. Credit/Debit card-like 13-19 digit number sequences

Policy:
  In accordance with system design, this module logs warnings and flags
  telemetry metrics without blocking execution, ensuring high availability while
  providing comprehensive audit logs for hackathon evaluation.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Precompiled Regex Patterns
# ---------------------------------------------------------------------------

PII_PATTERNS: dict[str, re.Pattern] = {
    "email": re.compile(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b",
        re.IGNORECASE,
    ),
    "indian_phone": re.compile(
        r"(?:(?:\+|0{0,2})91[\s-]?)?[6-9]\d{9}\b",
    ),
    "aadhaar_number": re.compile(
        r"\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b",
    ),
    "payment_card": re.compile(
        r"\b(?:\d{4}[\s-]?){3}\d{1,4}\b",
    ),
}

# Explicitly allowed placeholder strings that represent properly redacted data
REDACTION_MASKS: set[str] = {
    "[redacted]",
    "redacted",
    "[pii_masked]",
    "[masked]",
    "***",
    "******",
}


def scan_for_pii_leakage(screen_state: dict[str, Any]) -> dict[str, Any]:
    """Scan all element text fields in screen_state for unredacted PII patterns.

    Args:
        screen_state: Dict or object containing 'elements' list with 'text' and 'id'.

    Returns:
        Audit report dict:
        {
            "clean": bool,
            "flagged_elements": [
                {
                    "element_id": str,
                    "element_type": str,
                    "matched_patterns": list[str],
                    "sample": str (partially obscured)
                }, ...
            ],
            "patterns_matched": list[str]
        }
    """
    elements = screen_state.get("elements", []) if isinstance(screen_state, dict) else getattr(screen_state, "elements", [])
    flagged_elements: list[dict[str, Any]] = []
    unique_patterns_matched: set[str] = set()

    for el in elements:
        if isinstance(el, dict):
            el_id = str(el.get("id", "?"))
            el_type = str(el.get("type", "unknown"))
            text = str(el.get("text", ""))
        else:
            el_id = str(getattr(el, "id", "?"))
            el_type = str(getattr(el, "type", "unknown"))
            text = str(getattr(el, "text", ""))

        # Skip empty strings or known redaction placeholders
        normalized_text = text.strip().lower()
        if not normalized_text or normalized_text in REDACTION_MASKS:
            continue

        matched_for_this_el: list[str] = []

        for pii_name, pattern in PII_PATTERNS.items():
            matches = pattern.findall(text)
            if matches:
                # Basic false positive filter for payment_card pattern on short non-card numbers
                if pii_name == "payment_card":
                    # Only flag if raw digits length is >= 13 and <= 19
                    cleaned_digits = "".join(ch for ch in str(matches[0]) if ch.isdigit())
                    if not (13 <= len(cleaned_digits) <= 19):
                        continue

                matched_for_this_el.append(pii_name)
                unique_patterns_matched.add(pii_name)

        if matched_for_this_el:
            # Partially obscure sample text for safe logging
            sample_preview = text[:3] + "****" + text[-3:] if len(text) > 6 else "****"
            flagged_elements.append({
                "element_id": el_id,
                "element_type": el_type,
                "matched_patterns": matched_for_this_el,
                "sample": sample_preview,
            })
            logger.warning(
                "PII Sanity Alert: Potential unredacted %s detected in element [%s] (%s): '%s'",
                matched_for_this_el,
                el_id,
                el_type,
                sample_preview,
            )

    is_clean = len(flagged_elements) == 0

    if not is_clean:
        logger.warning(
            "PII Audit: Screen state flagged with %d potential leak(s). Types: %s",
            len(flagged_elements),
            sorted(list(unique_patterns_matched)),
        )
    else:
        logger.debug("PII Audit: Screen state passed clean.")

    return {
        "clean": is_clean,
        "flagged_elements": flagged_elements,
        "patterns_matched": sorted(list(unique_patterns_matched)),
    }
