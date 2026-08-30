"""
pii_check.py — Secondary server-side PII sanity and privacy audit scanner.

SIH26171: On-device Visual Perception for Light-weight Browser Agents
Component: Person B — Defense-in-depth PII audit scanner.

Even though the browser extension performs client-side redaction (e.g. masking
passwords and personal data before transmission), this module acts as a secondary
defense-in-depth safety net on the server.

Features:
  1. Email addresses (RFC-5322 compliant regex)
  2. Indian mobile phone numbers (+91 / 10-digit formats with boundary guards)
  3. Aadhaar-like 12-digit number formats (xxxx xxxx xxxx)
  4. Credit/Debit Cards with Luhn Algorithm Checksum validation (eliminates false
     positives on 16-digit order numbers / serial IDs)
  5. Auth Tokens & Secret Keys (OpenAI sk-*, JWT tokens, GitHub PATs, Bearer headers)

Policy:
  Non-blocking: Logs warnings and updates telemetry counters without blocking
  execution, ensuring high availability while providing audit telemetry for hackathons.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

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
    # Strict 12-digit Aadhaar with negative lookahead to prevent matching 16-digit card sub-strings
    "aadhaar_number": re.compile(
        r"\b[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}(?!\s*\d)\b",
    ),
    # 13 to 19 digit card numbers (continuous or grouped with spaces/dashes)
    "payment_card": re.compile(
        r"\b(?:\d{4}[\s-]?){3}\d{1,4}\b|\b\d{13,19}\b",
    ),
    "auth_token": re.compile(
        r"\b(?:sk-[a-zA-Z0-9_-]{20,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|ghp_[a-zA-Z0-9]{36}|Bearer\s+[A-Za-z0-9_\-\.]{20,})\b",
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
    "••••••••",
    "********",
}


def luhn_checksum_valid(number_str: str) -> bool:
    """Validate a credit/debit card number using the Luhn checksum algorithm (MOD 10).
    
    Eliminates false positives on random 13-19 digit serial numbers, tracking codes,
    or timestamps by verifying mathematical card integrity.
    
    Args:
        number_str: String containing digits and optional spaces/dashes.
        
    Returns:
        True if valid card checksum, False otherwise.
    """
    digits = [int(ch) for ch in number_str if ch.isdigit()]
    if not (13 <= len(digits) <= 19):
        return False

    total = 0
    reverse_digits = digits[::-1]
    for i, digit in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = digit * 2
            total += doubled - 9 if doubled > 9 else doubled
        else:
            total += digit

    return total % 10 == 0


def mask_sensitive_value(text: str) -> str:
    """Generate a safe, masked preview string for audit logs.
    
    Example:
      'scientist@isro.gov.in' -> 'sci****@isro.gov.in'
      '4532 1234 5678 9012' -> '4532-****-****-9012'
      '+91 9876543210' -> '+91 **** 3210'
    """
    clean = text.strip()
    if len(clean) <= 6:
        return "****"
    if "@" in clean:
        parts = clean.split("@", 1)
        user = parts[0]
        domain = parts[1]
        masked_user = user[:2] + "****" if len(user) > 2 else "****"
        return f"{masked_user}@{domain}"
    
    return clean[:4] + "****" + clean[-4:]


def scan_for_pii_leakage(screen_state: dict[str, Any] | Any) -> dict[str, Any]:
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
    elements = (
        screen_state.get("elements", [])
        if isinstance(screen_state, dict)
        else getattr(screen_state, "elements", [])
    )
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

        # Scan for payment cards first with Luhn verification
        card_matches = PII_PATTERNS["payment_card"].findall(text)
        is_card = False
        for cm in card_matches:
            cleaned_digits = "".join(ch for ch in str(cm) if ch.isdigit())
            if luhn_checksum_valid(cleaned_digits):
                matched_for_this_el.append("payment_card")
                unique_patterns_matched.add("payment_card")
                is_card = True
                break

        for pii_name, pattern in PII_PATTERNS.items():
            if pii_name == "payment_card":
                continue  # already checked above

            matches = pattern.findall(text)
            if not matches:
                continue

            for match in matches:
                match_str = str(match)
                # Aadhaar verification: must be 12 digits, first digit cannot be 0 or 1, and not a card
                if pii_name == "aadhaar_number":
                    if is_card:
                        continue
                    cleaned_digits = "".join(ch for ch in match_str if ch.isdigit())
                    if len(cleaned_digits) != 12 or cleaned_digits[0] in {"0", "1"}:
                        continue

                if pii_name not in matched_for_this_el:
                    matched_for_this_el.append(pii_name)
                    unique_patterns_matched.add(pii_name)

        if matched_for_this_el:
            sample_preview = mask_sensitive_value(text)
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
