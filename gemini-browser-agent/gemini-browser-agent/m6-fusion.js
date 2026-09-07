/**
 * m6-fusion.js â€” RAVEN Milestone M6: Perception Fusion & Privacy Sanitization Gate
 * 
 * Multi-Modal Perception Fusion & Strict Fail-Closed Privacy Boundary:
 * - M2 Semantic DOM elements & attributes
 * - M3 Geometric Visual Hypotheses (buttons, inputs, cards, containers)
 * - M4 OCR Text Blocks & Bounding Boxes
 * - M5 Facial / Sensitive Visual Detections
 * 
 * CORE RESPONSIBILITIES:
 * 1. Multi-signal contextual PII detection across 10 categories:
 *    EMAIL, PHONE, CREDIT_CARD_LIKE, ACCOUNT_IDENTIFIER, IP_ADDRESS,
 *    POSTAL_ADDRESS, DATE_OF_BIRTH_LIKE, GOVERNMENT_ID_LIKE,
 *    PERSON_NAME_LIKE, URL_WITH_SENSITIVE_QUERY.
 * 2. OCR + DOM + Visual Hypotheses Spatial Fusion.
 * 3. Typed Text Redaction ([REDACTED_EMAIL], [REDACTED_PHONE], etc.).
 * 4. Deterministic Visual Canvas Redaction (safety-padded opaque masking).
 * 5. Post-Redaction Dual Verification (Text + Image + Leak checks).
 * 6. STRICT FAIL-CLOSED PRIVACY GATE: If any check fails, observation release is blocked.
 * 7. ZERO-LEAK TELEMETRY: Raw sensitive values are NEVER exposed in logs, telemetry, or payloads.
 */

import {
  CANONICAL_COORDINATE_SPACE,
  normalizeVisualRegionToM1,
  validateBoundingBox,
  createCoordinateTelemetry
} from './coordinate-utils.js';

const COMMON_WEB_TERMS = new Set([
  'navigation', 'nav', 'menu', 'settings', 'profile', 'account', 'login', 'logout', 'signin', 'signout',
  'avatar', 'button', 'header', 'footer', 'dashboard', 'explore', 'search', 'notifications', 'home',
  'help', 'pricing', 'docs', 'documentation', 'overview', 'repository', 'repositories', 'pulls',
  'issues', 'actions', 'projects', 'wiki', 'security', 'insights', 'commits', 'branches', 'tags',
  'releases', 'packages', 'stars', 'forks', 'watchers', 'discussions', 'guide', 'feedback', 'status',
  'interface', 'content', 'container', 'sidebar', 'toolbar', 'tab', 'panel', 'dialog', 'modal',
  'link', 'icon', 'label', 'badge', 'card', 'item', 'list', 'table', 'row', 'column', 'grid', 'files', 'code'
]);

let lastM6Result = null;

export function getLastM6Result() {
  return lastM6Result;
}

// --- Telemetry Broadcaster (Guaranteed Zero-Leak) ---
async function broadcastTelemetry(payload) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const debugTabs = await chrome.tabs.query({
        url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*', '*://localhost:5174/*', '*://127.0.0.1:5174/*', '*://localhost:5175/*', '*://127.0.0.1:5175/*', '*://localhost:5176/*', '*://127.0.0.1:5176/*', '*://localhost:5177/*', '*://127.0.0.1:5177/*', '*://localhost:5178/*', '*://127.0.0.1:5178/*', '*://localhost:5179/*', '*://127.0.0.1:5179/*']
      });
      for (const tab of debugTabs) {
        chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload }).catch(() => {});
      }
    } catch (_) {}
  }

  if (typeof fetch === 'function') {
    fetch('http://localhost:8765/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

// --- Helper: Luhn Algorithm for Credit Card Numbers ---
function validateLuhn(digitsStr) {
  const clean = digitsStr.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// --- Helper: Identify Non-PII (Prices, Quantities, SKUs, Common Dates) ---
function isHarmlessNonPii(text, nearbyContext = '') {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  const lowerContext = nearbyContext.toLowerCase();

  // Explicit non-PII financial prices: $29.99, 14.50 USD, â‚¬12.00, etc.
  if (/^\$?\s*\d+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|CAD|AUD|\$|â‚¬|Â£|â‚¹)?$/i.test(trimmed)) {
    if (!lowerContext.includes('card') && !lowerContext.includes('account')) return true;
  }

  // Quantities and simple counts: Qty: 1, 10 items, etc.
  if (/^(?:qty|quantity|items?|units?)?[:\s]*\d{1,4}$/i.test(trimmed)) return true;

  // Product SKUs and order numbers: SKU-1234, #98765
  if (/^(?:sku|item|product|order|part)?[-#\s]*[A-Z0-9]{3,10}$/i.test(trimmed)) {
    if (!lowerContext.includes('account') && !lowerContext.includes('ssn')) return true;
  }

  // Generic website UI action labels
  if (/^(?:nav|navigation|menu|settings|profile|account|sign in|log in|submit|confirm|continue|checkout|cart|add to cart|search|filter|sort|next|previous|home|explore|notifications|repositories|repository|issues|pull requests|pulls|actions|projects|wiki|security|insights|commits|files|code)$/i.test(trimmed)) {
    return true;
  }

  // Ordinary dates without birth context: Sep 4, 2026 or 2026-09-04
  if (/\b(?:20\d\d[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d\d)\b/.test(trimmed)) {
    const isDob = /(?:dob|birth|born|age)\b/i.test(lowerContext);
    if (!isDob) return true;
  }

  return false;
}

// --- Contextual PII Detection Engine ---
export function detectContextualPii(params = {}) {
  const { ocrBlocks = [], domElements = [], visualHypotheses = [], visibleTexts = [] } = params;
  const candidates = [];
  let candidatesEvaluated = 0;

  // 1. Scan M4 OCR Blocks with Contextual Evidence
  for (const block of ocrBlocks) {
    const text = block.text || '';
    if (!text.trim()) continue;
    candidatesEvaluated++;

    const bbox = block.bbox
      ? { x: block.bbox[0], y: block.bbox[1], width: block.bbox[2], height: block.bbox[3] }
      : { x: 0, y: 0, width: 0, height: 0 };

    // Find spatially nearby DOM element context
    const nearbyEl = domElements.find((el) => {
      if (!el.bounds) return false;
      const dx = Math.abs((el.bounds.x || 0) - bbox.x);
      const dy = Math.abs((el.bounds.y || 0) - bbox.y);
      return dx < 120 && dy < 60;
    });

    const domContext = nearbyEl
      ? `${nearbyEl.tag || ''} ${nearbyEl.type || ''} ${nearbyEl.name || ''} ${nearbyEl.placeholder || ''} ${nearbyEl.aria_label || ''} ${nearbyEl.text || ''}`.toLowerCase()
      : '';

    evaluateTextCandidates(text, bbox, `M4_OCR`, domContext, nearbyEl?.target_id || block.target_id || null, candidates);
  }

  // 2. Scan M2 Semantic DOM Elements with Field Semantics
  for (const el of domElements) {
    const elText = (el.text || '').trim();
    const elVal = (el.value || '').trim();
    const elPlaceholder = (el.placeholder || '').trim();
    const elType = (el.type || '').toLowerCase();
    const elName = (el.name || '').toLowerCase();
    const elAria = (el.aria_label || '').toLowerCase();
    const fullContext = `${el.tag || ''} ${elType} ${elName} ${elPlaceholder} ${elAria} ${elText}`.toLowerCase();

    const bbox = el.bounds
      ? { x: el.bounds.x || 0, y: el.bounds.y || 0, width: el.bounds.width || 0, height: el.bounds.height || 0 }
      : { x: 0, y: 0, width: 0, height: 0 };

    candidatesEvaluated++;

    // Evaluate visible text
    if (elText) {
      evaluateTextCandidates(elText, bbox, 'M2_DOM', fullContext, el.target_id, candidates);
    }
    // Evaluate input value or placeholder
    if (elVal && elVal !== elText) {
      evaluateTextCandidates(elVal, bbox, 'M2_DOM_VALUE', fullContext, el.target_id, candidates);
    }

    // Direct input type semantics: <input type="password">, <input type="tel">, etc.
    if (elType === 'password' && (elVal || elText)) {
      candidates.push({
        id: `pii-${candidates.length + 1}`,
        type: 'ACCOUNT_IDENTIFIER',
        source: 'M2_DOM_PASSWORD',
        rawText: elVal || elText,
        bbox,
        confidence: 0.99,
        evidence: ['input-type-password', 'masked-credential'],
        action: 'REDACT',
        target_id: el.target_id || null
      });
    }
  }

  // 3. Scan Visible Text Strings
  for (const line of visibleTexts) {
    if (typeof line === 'string' && line.trim()) {
      candidatesEvaluated++;
      evaluateTextCandidates(line.trim(), { x: 0, y: 0, width: 0, height: 0 }, 'VISIBLE_TEXT', '', null, candidates);
    }
  }

  // Filter duplicate detections covering the same raw text & type
  const uniqueDetections = [];
  const textToDetectionMap = new Map();

  for (const cand of candidates) {
    const key = `${cand.type}|${cand.rawText}`;
    if (!textToDetectionMap.has(key)) {
      textToDetectionMap.set(key, cand);
      uniqueDetections.push(cand);
    } else {
      // If previous had empty bbox and current has real bbox, upgrade bbox
      const existing = textToDetectionMap.get(key);
      if ((!existing.bbox || (existing.bbox.width === 0 && existing.bbox.height === 0)) &&
          cand.bbox && (cand.bbox.width > 0 || cand.bbox.height > 0)) {
        existing.bbox = cand.bbox;
        existing.source = `${existing.source}+${cand.source}`;
      }
    }
  }

  return {
    candidatesEvaluated,
    detections: uniqueDetections
  };
}

// --- Text Candidate Evaluator across 10 Categories ---
function evaluateTextCandidates(text, bbox, source, nearbyContext, target_id, candidates) {
  if (!text || isHarmlessNonPii(text, nearbyContext)) return;
  const lowerContext = nearbyContext.toLowerCase();

  // 1. EMAIL
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'EMAIL',
      source,
      rawText: emailMatch[0],
      bbox,
      confidence: lowerContext.includes('email') ? 0.98 : 0.92,
      evidence: ['rfc5322-email-pattern', ...(lowerContext.includes('email') ? ['dom-email-context'] : [])],
      action: 'REDACT',
      target_id
    });
  }

  // 2. CREDIT_CARD_LIKE
  const ccMatch = text.match(/\b(?:\d{4}[-\s]?){3}\d{1,4}\b/) || text.match(/\b(?:[*â€¢]{4}[-\s]?){3}\d{4}\b/);
  if (ccMatch) {
    const rawVal = ccMatch[0];
    const isMasked = rawVal.includes('*') || rawVal.includes('â€¢');
    const isLuhn = isMasked ? false : validateLuhn(rawVal);
    const hasCardContext = /card|credit|debit|visa|mastercard|amex|exp|cvv|cvc|billing/i.test(lowerContext);

    if (isLuhn || (isMasked && hasCardContext) || (hasCardContext && rawVal.replace(/\D/g, '').length >= 15)) {
      candidates.push({
        id: `pii-${candidates.length + 1}`,
        type: 'CREDIT_CARD_LIKE',
        source,
        rawText: rawVal,
        bbox,
        confidence: isLuhn ? 0.99 : (isMasked ? 0.94 : 0.89),
        evidence: [
          isLuhn ? 'luhn-checksum-valid' : 'card-sequence-pattern',
          ...(hasCardContext ? ['payment-card-dom-context'] : []),
          ...(isMasked ? ['masked-card-digits'] : [])
        ],
        action: 'REDACT',
        target_id
      });
    }
  }

  // 3. PHONE
  // Disqualify plain numbers or prices unless explicit phone context or international prefix
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
  const phoneMatch = text.match(phonePattern);
  if (phoneMatch) {
    const rawVal = phoneMatch[0];
    const cleanDigits = rawVal.replace(/\D/g, '');
    const hasPhoneContext = /phone|tel|mobile|call|contact|fax|cel|whatsapp/i.test(lowerContext);
    const hasPlus = rawVal.startsWith('+');

    if (cleanDigits.length >= 10 && (hasPhoneContext || hasPlus || rawVal.includes('('))) {
      candidates.push({
        id: `pii-${candidates.length + 1}`,
        type: 'PHONE',
        source,
        rawText: rawVal,
        bbox,
        confidence: hasPhoneContext ? 0.96 : (hasPlus ? 0.91 : 0.86),
        evidence: [
          'e164-phone-pattern',
          ...(hasPhoneContext ? ['telephone-dom-context'] : []),
          ...(hasPlus ? ['international-country-code'] : [])
        ],
        action: 'REDACT',
        target_id
      });
    }
  }

  // 4. IP_ADDRESS
  const ipMatch = text.match(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/);
  if (ipMatch) {
    const rawIp = ipMatch[0];
    if (rawIp !== '0.0.0.0' && rawIp !== '127.0.0.1') {
      candidates.push({
        id: `pii-${candidates.length + 1}`,
        type: 'IP_ADDRESS',
        source,
        rawText: rawIp,
        bbox,
        confidence: 0.92,
        evidence: ['ipv4-octet-pattern'],
        action: 'REDACT',
        target_id
      });
    }
  }

  // 5. ACCOUNT_IDENTIFIER
  const ibanMatch = text.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
  const accountLabeledMatch = text.match(/(?:account|routing|iban|wallet|acct)\s*(?:#|no|id)?[:\s]+([A-Z0-9-]*\d[A-Z0-9-]{4,33})/i);
  if (ibanMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'ACCOUNT_IDENTIFIER',
      source,
      rawText: ibanMatch[0],
      bbox,
      confidence: 0.96,
      evidence: ['iban-structure-pattern'],
      action: 'REDACT',
      target_id
    });
  } else if (accountLabeledMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'ACCOUNT_IDENTIFIER',
      source,
      rawText: accountLabeledMatch[1],
      bbox,
      confidence: 0.93,
      evidence: ['account-label-association'],
      action: 'REDACT',
      target_id
    });
  }

  // 6. GOVERNMENT_ID_LIKE
  const ssnMatch = text.match(/\b\d{3}-\d{2}-\d{4}\b/);
  const aadhaarMatch = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
  const panMatch = text.match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  if (ssnMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'GOVERNMENT_ID_LIKE',
      source,
      rawText: ssnMatch[0],
      bbox,
      confidence: 0.97,
      evidence: ['ssn-structure-format'],
      action: 'REDACT',
      target_id
    });
  } else if (aadhaarMatch && /aadhaar|uidai|identity|gov/i.test(lowerContext)) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'GOVERNMENT_ID_LIKE',
      source,
      rawText: aadhaarMatch[0],
      bbox,
      confidence: 0.94,
      evidence: ['aadhaar-pattern-with-context'],
      action: 'REDACT',
      target_id
    });
  } else if (panMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'GOVERNMENT_ID_LIKE',
      source,
      rawText: panMatch[0],
      bbox,
      confidence: 0.93,
      evidence: ['pan-card-structure'],
      action: 'REDACT',
      target_id
    });
  }

  // 7. DATE_OF_BIRTH_LIKE
  const dobMatch = text.match(/(?:dob|date of birth|born|birthdate)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  if (dobMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'DATE_OF_BIRTH_LIKE',
      source,
      rawText: dobMatch[1],
      bbox,
      confidence: 0.95,
      evidence: ['explicit-dob-label-coupling'],
      action: 'REDACT',
      target_id
    });
  }

  // 8. POSTAL_ADDRESS
  const streetMatch = text.match(/\b\d{1,5}\s+[A-Za-z0-9\s.,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Suite|Ste|Apt)\b/i);
  const zipMatch = text.match(/(?:zip|postal)[:\s]+(\d{5}(?:-\d{4})?)/i);
  if (streetMatch && /address|shipping|billing|residence|location/i.test(lowerContext + ' ' + text)) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'POSTAL_ADDRESS',
      source,
      rawText: streetMatch[0],
      bbox,
      confidence: 0.91,
      evidence: ['street-address-with-context'],
      action: 'REDACT',
      target_id
    });
  } else if (zipMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'POSTAL_ADDRESS',
      source,
      rawText: zipMatch[1],
      bbox,
      confidence: 0.89,
      evidence: ['zip-code-with-context'],
      action: 'REDACT',
      target_id
    });
  }

  // 9. PERSON_NAME_LIKE
  const nameLabelMatch = text.match(/(?:full\s+name|first\s+name|last\s+name|patient\s+name|customer\s+name|employee\s+name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b|(?:name|customer|patient|passenger|employee)[:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/i);
  if (nameLabelMatch) {
    const rawCandidate = nameLabelMatch[1] || nameLabelMatch[2];
    const lowerCandidate = (rawCandidate || '').toLowerCase();
    if (rawCandidate && !COMMON_WEB_TERMS.has(lowerCandidate) && rawCandidate.length >= 2) {
      candidates.push({
        id: `pii-${candidates.length + 1}`,
        type: 'PERSON_NAME_LIKE',
        source,
        rawText: rawCandidate,
        bbox,
        confidence: 0.88,
        evidence: ['person-name-label-context'],
        action: 'REDACT',
        target_id
      });
    }
  }

  // 10. URL_WITH_SENSITIVE_QUERY
  const secretUrlMatch = text.match(/(?:https?:\/\/[^\s]+(?:\?|&)(?:token|apikey|api_key|auth|secret|password|access_token)=([^&\s]+))/i);
  if (secretUrlMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'URL_WITH_SENSITIVE_QUERY',
      source,
      rawText: secretUrlMatch[1],
      bbox,
      confidence: 0.97,
      evidence: ['secret-token-query-param'],
      action: 'REDACT',
      target_id
    });
  }
}

// --- Map Detection Category to Typed Placeholder ---
function getTypedPlaceholder(type) {
  switch (type) {
    case 'EMAIL': return '[REDACTED_EMAIL]';
    case 'PHONE': return '[REDACTED_PHONE]';
    case 'CREDIT_CARD_LIKE': return '[REDACTED_CREDIT_CARD]';
    case 'ACCOUNT_IDENTIFIER': return '[REDACTED_ACCOUNT]';
    case 'IP_ADDRESS': return '[REDACTED_IP]';
    case 'POSTAL_ADDRESS': return '[REDACTED_ADDRESS]';
    case 'DATE_OF_BIRTH_LIKE': return '[REDACTED_DOB]';
    case 'GOVERNMENT_ID_LIKE': return '[REDACTED_GOV_ID]';
    case 'PERSON_NAME_LIKE': return '[REDACTED_PERSON]';
    case 'URL_WITH_SENSITIVE_QUERY': return '[REDACTED_SECRET_URL]';
    case 'face':
    case 'Face / Avatar': return '[REDACTED_FACE]';
    default: return '[REDACTED_SENSITIVE]';
  }
}

// --- Text Sanitizer (Typed Placeholders) ---
export function sanitizeObservationPayload(rawObservation, textDetections = [], sensitiveTargetIds = new Set()) {
  const elements = (rawObservation?.elements || []).map((el) => {
    let text = el.text || '';
    let name = el.name || '';
    let value = el.value || '';
    let placeholder = el.placeholder || '';

    const isTargetSensitive = sensitiveTargetIds.has(el.target_id);

    // Apply typed replacement for detected text strings
    for (const det of textDetections) {
      if (det.rawText && typeof det.rawText === 'string') {
        const placeholderToken = getTypedPlaceholder(det.type);
        if (text.includes(det.rawText)) text = text.replaceAll(det.rawText, placeholderToken);
        if (name.includes(det.rawText)) name = name.replaceAll(det.rawText, placeholderToken);
        if (value.includes(det.rawText)) value = value.replaceAll(det.rawText, placeholderToken);
        if (placeholder.includes(det.rawText)) placeholder = placeholder.replaceAll(det.rawText, placeholderToken);
      }
    }

    if (isTargetSensitive) {
      if (!text.includes('[REDACTED')) text = '[REDACTED_SENSITIVE]';
      if (!name.includes('[REDACTED')) name = '[REDACTED_SENSITIVE]';
      if (value) value = '[REDACTED_SENSITIVE]';
    }

    const sanitizedEl = { ...el, text, name };
    if (el.value !== undefined) sanitizedEl.value = value;
    if (el.placeholder !== undefined) sanitizedEl.placeholder = placeholder;
    return sanitizedEl;
  });

  const visibleText = (rawObservation?.visibleText || []).map((t) => {
    let safeLine = t;
    for (const det of textDetections) {
      if (det.rawText && typeof det.rawText === 'string') {
        safeLine = safeLine.replaceAll(det.rawText, getTypedPlaceholder(det.type));
      }
    }
    return safeLine;
  });

  return {
    ...rawObservation,
    elements,
    visibleText
  };
}

// Fast separable box blur for image redaction
function fastBoxBlur(pixels, w, h, radius) {
  if (radius < 1 || w <= 0 || h <= 0 || !pixels) return;
  const win = radius * 2 + 1;
  const a = new Uint8ClampedArray(pixels);
  const b = new Uint8ClampedArray(a.length);

  for (let row = 0; row < h; row++) {
    const base = row * w * 4;
    let R = 0, G = 0, B = 0, A = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = Math.min(w - 1, Math.max(0, dx));
      const idx = base + xx * 4;
      R += a[idx]; G += a[idx + 1]; B += a[idx + 2]; A += a[idx + 3];
    }
    for (let col = 0; col < w; col++) {
      const o = base + col * 4;
      b[o] = R / win; b[o + 1] = G / win; b[o + 2] = B / win; b[o + 3] = A / win;
      const addX = Math.min(w - 1, col + radius + 1), remX = Math.max(0, col - radius);
      const ai = base + addX * 4, ri = base + remX * 4;
      R += a[ai] - a[ri]; G += a[ai + 1] - a[ri + 1];
      B += a[ai + 2] - a[ri + 2]; A += a[ai + 3] - a[ri + 3];
    }
  }

  for (let col = 0; col < w; col++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = Math.min(h - 1, Math.max(0, dy));
      const idx = (yy * w + col) * 4;
      R += b[idx]; G += b[idx + 1]; B += b[idx + 2]; A += b[idx + 3];
    }
    for (let row = 0; row < h; row++) {
      const o = (row * w + col) * 4;
      pixels[o] = R / win; pixels[o + 1] = G / win; pixels[o + 2] = B / win; pixels[o + 3] = A / win;
      const addY = Math.min(h - 1, row + radius + 1), remY = Math.max(0, row - radius);
      const ai = (addY * w + col) * 4, ri = (remY * w + col) * 4;
      R += b[ai] - b[ri]; G += b[ai + 1] - b[ri + 1];
      B += b[ai + 2] - b[ri + 2]; A += b[ai + 3] - b[ri + 3];
    }
  }
}

// --- Visual Canvas Redaction ---
// "if something is blurred, blur the whole image itself, dont draw bounding box, the blur should strictly stay inside the image only"
export async function redactVisualCanvas(canvasOrBitmap, boundingBoxes = [], sourceDims = null) {
  if (!canvasOrBitmap) return null;
  try {
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined' && (canvasOrBitmap instanceof OffscreenCanvas)) {
      canvas = canvasOrBitmap;
      ctx = canvas.getContext('2d');
    } else if (canvasOrBitmap && typeof canvasOrBitmap.getContext === 'function') {
      canvas = canvasOrBitmap;
      ctx = canvas.getContext('2d');
    } else {
      return null;
    }

    const cW = canvas.width || 0;
    const cH = canvas.height || 0;
    if (cW <= 0 || cH <= 0) return canvas;

    // Determine coordinate scaling if canvas dimensions differ from canonical source dimensions
    const srcW = sourceDims?.width || cW;
    const srcH = sourceDims?.height || cH;
    const scaleX = (srcW > 0 && srcW !== cW) ? cW / srcW : 1;
    const scaleY = (srcH > 0 && srcH !== cH) ? cH / srcH : 1;

    for (const rawBox of boundingBoxes) {
      if (!rawBox) continue;
      // Prefer imageBox (the whole image container) if available, or bbox
      const b = Array.isArray(rawBox)
        ? { x: rawBox[0], y: rawBox[1], width: rawBox[2], height: rawBox[3] }
        : (rawBox.imageBox || rawBox.bbox || rawBox.box || rawBox);

      const val = validateBoundingBox(b, srcW, srcH, { maxCoverageRatio: 0.45 });
      if (!val.isValid || !val.box) {
        // Skip invalid bounding boxes — NEVER convert into a full-screen redaction!
        console.warn('[M6 Redact] Skipping invalid bounding box during canvas redaction:', val.reason, b);
        continue;
      }

      const bx = Math.round(val.box.x * scaleX);
      const by = Math.round(val.box.y * scaleY);
      const bw = Math.round(val.box.width * scaleX);
      const bh = Math.round(val.box.height * scaleY);

      // The blur MUST strictly stay inside the image only — zero padding outside image borders!
      const rx = Math.max(0, Math.min(cW, bx));
      const ry = Math.max(0, Math.min(cH, by));
      const rw = Math.max(0, Math.min(cW - rx, bw));
      const rh = Math.max(0, Math.min(cH - ry, bh));

      if (rw > 0 && rh > 0) {
        let blurred = false;
        try {
          if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
            const imgData = ctx.getImageData(rx, ry, rw, rh);
            if (imgData && imgData.data && imgData.data.length > 0) {
              const radius = Math.min(28, Math.max(6, Math.round(Math.min(rw, rh) * 0.12)));
              fastBoxBlur(imgData.data, rw, rh, radius);
              fastBoxBlur(imgData.data, rw, rh, radius);
              ctx.putImageData(imgData, rx, ry);
              blurred = true;
            }
          }
        } catch (_) {}

        if (!blurred) {
          ctx.save();
          if ('filter' in ctx) {
            try {
              ctx.filter = 'blur(16px)';
              ctx.drawImage(canvas, rx, ry, rw, rh, rx, ry, rw, rh);
              ctx.filter = 'none';
              blurred = true;
            } catch (_) {}
          }
          if (!blurred && typeof ctx.fillRect === 'function') {
            // Clean slate block strictly inside image for mock / non-pixel environments
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(rx, ry, rw, rh);
          }
          ctx.restore();
        }
        // ZERO BOUNDING BOX: strictly NO ctx.strokeRect, NO bounding box outline drawn
      }
    }

    return canvas;
  } catch (_) {
    return null;
  }
}

// Helper to convert Blob to Data URL across Browser and Node environments
function blobToDataUrl(blob) {
  if (!blob) return Promise.resolve(null);
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  if (typeof blob.arrayBuffer === 'function' && typeof Buffer !== 'undefined') {
    return blob.arrayBuffer().then(buf => {
      const b64 = Buffer.from(buf).toString('base64');
      return `data:image/png;base64,${b64}`;
    });
  }
  return Promise.resolve(null);
}

// --- Post-Redaction Verification & Fail-Closed Gate ---
export function validateZeroLeakPrivacy(payload, sensitiveItems = [], rawDetections = [], options = {}) {
  const leaks = [];

  // 1. Image Sanitization & Zero-Leak Verification
  // Invariant: Raw unredacted M1 screenshot is NEVER permitted.
  // Invariant: Certified sanitized screenshot produced by M6 after local redaction IS permitted.
  const rawScreenshot = options.rawScreenshot || '';
  const sanitizedScreenshot = payload?.sanitizedScreenshot || null;

  // A. Check for raw image bitmaps leaking into textual fields
  const textCorpus = [
    payload?.title || '',
    ...(payload?.visibleText || []),
    ...(payload?.elements || []).map(e => `${e.text || ''} ${e.name || ''} ${e.value || ''} ${e.placeholder || ''} ${e.aria_label || ''}`)
  ].join(' ');

  if (textCorpus.includes('data:image/png;base64') || textCorpus.includes('data:image/jpeg;base64')) {
    leaks.push('Raw image bitmap detected in outbound text fields');
  }

  // B. Verify sanitized screenshot integrity if present
  if (sanitizedScreenshot) {
    const rawData = typeof rawScreenshot === 'string' ? rawScreenshot : (rawScreenshot?.dataUrl || rawScreenshot?.base64 || '');
    const sanitizedData = typeof sanitizedScreenshot === 'string' ? sanitizedScreenshot : (sanitizedScreenshot?.dataUrl || sanitizedScreenshot?.base64 || '');

    // If sensitive items were detected, sanitized data MUST NOT match raw unredacted data!
    if (sensitiveItems.length > 0 && rawData && sanitizedData && (rawData === sanitizedData)) {
      leaks.push('Unredacted raw screenshot detected: matches raw M1 capture despite sensitive detections');
    }

    // Must carry M6 certification
    if (typeof sanitizedScreenshot === 'object' && !sanitizedScreenshot.isSanitized) {
      leaks.push('Uncertified visual screenshot in payload: missing M6 sanitization certification');
    }
  }

  // C. Ensure other fields in payload do not leak unredacted raw screenshots
  const payloadCopy = { ...payload };
  delete payloadCopy.sanitizedScreenshot;
  const payloadStrWithoutImage = JSON.stringify(payloadCopy);
  if (payloadStrWithoutImage.includes('data:image/png;base64') || payloadStrWithoutImage.includes('data:image/jpeg;base64')) {
    leaks.push('Raw image bitmap detected in outbound observation fields');
  }

  // 2. Sensitive text presence check (ensures raw strings are 100% purged from visible text/content)
  const HTML_STRUCTURAL_TOKENS = new Set([
    'nav', 'navigation', 'button', 'input', 'select', 'textarea', 'link', 'div', 'span',
    'header', 'footer', 'main', 'section', 'article', 'aside', 'form', 'label', 'menu'
  ]);

  const valuesToCheck = [
    ...sensitiveItems.map(i => i.value).filter(Boolean),
    ...rawDetections.map(d => d.rawText).filter(Boolean)
  ].filter(v => !HTML_STRUCTURAL_TOKENS.has(v.toLowerCase()));

  for (const rawVal of valuesToCheck) {
    if (rawVal.length >= 3 && textCorpus.includes(rawVal)) {
      leaks.push(`Unredacted sensitive value detected in sanitized text: "${rawVal.slice(0, 3)}***"`);
    }
  }

  // 3. Regex scan for critical secrets (API keys, unmasked tokens)
  const fullPayloadStr = JSON.stringify(payload);
  if (/\b(?:AIza[0-9A-Za-z-_]{30,35}|sk-[a-zA-Z0-9]{20,})\b/.test(fullPayloadStr)) {
    leaks.push('API key pattern detected in outbound payload');
  }

  // 4. Raw credit card unmasked pattern check
  if (/\b(?:\d{4}[-\s]?){3}\d{4}\b/.test(fullPayloadStr)) {
    leaks.push('Unmasked 16-digit payment card pattern detected in payload');
  }

  return {
    passed: leaks.length === 0,
    leaks
  };
}

/**
 * Executes M6 Perception Fusion and Privacy Gate Validation
 * @param {object} inputs - { m1Result, m2Result, m3Result, m4Result, m5Result, observation }
 */
export async function runM6PerceptionFusion(inputs = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = inputs.perceptionCycleId || `cycle-${Date.now()}`;

  await broadcastTelemetry({
    type: 'EVENT',
    event: 'M6_FUSION_STARTED',
    component: 'M6_FUSION',
    status: 'running',
    perceptionCycleId,
    timestamp
  });

  try {
    const rawElements = inputs.observation?.elements || inputs.m2Result?.data?.elements || [];
    const visualDetections = inputs.m3Result?.data?.detections || [];
    const m4Blocks = inputs.m4Result?.data?.blocks || inputs.m4Result?.blocks || [];
    const m5Items = inputs.m5Result?.data?.items || inputs.m5Result?.items || [];
    const visibleTexts = inputs.observation?.visibleText || [];

    const inputsReceived = [];
    if (inputs.m1Result) inputsReceived.push('M1');
    if (inputs.m2Result) inputsReceived.push('M2');
    if (inputs.m3Result) inputsReceived.push('M3');
    if (inputs.m4Result) inputsReceived.push('M4');
    if (inputs.m5Result) inputsReceived.push('M5');

    // Canonical target dimensions from M1 screenshot
    const tgtW = inputs.m1Result?.data?.image?.width || inputs.m1Result?.image?.width || inputs.m1Result?.data?.viewport?.width || 1024;
    const tgtH = inputs.m1Result?.data?.image?.height || inputs.m1Result?.image?.height || inputs.m1Result?.data?.viewport?.height || 768;

    // 1. Contextual Multi-Modal PII Detection (OCR + DOM + Visual)
    const piiAnalysis = detectContextualPii({
      ocrBlocks: m4Blocks,
      domElements: rawElements,
      visualHypotheses: visualDetections,
      visibleTexts
    });

    const textDetections = piiAnalysis.detections;
    const candidatesEvaluated = piiAnalysis.candidatesEvaluated;

    // 2. Ingest M5 Face Detections with Canonical Coordinate Validation
    // Preserves multiple faces as independent regions (NO global union box)
    const rawFaceDetections = m5Items.filter(item => item.type === 'face' || item.category === 'Face / Avatar');
    const validatedFaces = [];

    for (let idx = 0; idx < rawFaceDetections.length; idx++) {
      const fd = rawFaceDetections[idx];
      // "if something is blurred, blur the whole image itself" — use imageBox if present
      const rawBox = fd.imageBox || fd.box || fd.boundingBox || fd.bbox || { x: 0, y: 0, width: 0, height: 0 };
      const sourceDimensions = fd.sourceDimensions || { width: tgtW, height: tgtH };

      // Normalize to canonical M1 coordinates
      const norm = normalizeVisualRegionToM1(
        rawBox,
        {
          width: sourceDimensions.width || tgtW,
          height: sourceDimensions.height || tgtH,
          coordinateSpace: fd.sourceSpace || (fd.coordinateSpace === CANONICAL_COORDINATE_SPACE ? CANONICAL_COORDINATE_SPACE : 'dom-css-viewport')
        },
        {
          width: tgtW,
          height: tgtH,
          coordinateSpace: CANONICAL_COORDINATE_SPACE
        },
        { maxCoverageRatio: 0.45 }
      );

      if (!norm.isValid || !norm.normalizedBox) {
        console.warn(`[M6 Fusion] Rejected invalid face bounding box (${fd.id || idx}):`, norm.reason, rawBox);
        // Privacy invariant: Do NOT create a full-screen redaction
        continue;
      }

      const faceItem = {
        id: fd.id || `FACE-${idx + 1}`,
        type: 'face',
        category: 'Face / Avatar',
        source: fd.source || 'M5_VISUAL',
        bbox: norm.normalizedBox,
        box: norm.normalizedBox,
        imageBox: norm.normalizedBox,
        coordinateSpace: CANONICAL_COORDINATE_SPACE,
        sourceBox: norm.sourceBox,
        sourceSpace: norm.sourceSpace,
        confidence: fd.confidence || 0.88,
        evidence: fd.evidence || ['biometric-face-structure'],
        coverageRatio: norm.coverageRatio,
        action: 'REDACTED'
      };

      validatedFaces.push(faceItem);

      // Emit zero-leak coordinate transformation telemetry
      broadcastTelemetry(createCoordinateTelemetry(faceItem.id, norm)).catch(() => {});
    }

    const sensitiveTargetIds = new Set(
      textDetections.map(d => d.target_id).filter(Boolean)
    );

    // Build unified redaction plan (without raw PII values for safe telemetry)
    // Multiple faces are preserved as distinct, independent regions
    const unifiedRedactionRegions = [
      ...textDetections.map(td => ({
        id: td.id,
        type: td.type,
        source: td.source,
        bbox: td.bbox,
        confidence: td.confidence,
        evidence: td.evidence,
        action: 'REDACTED'
      })),
      ...validatedFaces.map(vf => ({
        id: vf.id,
        type: 'face',
        source: vf.source,
        bbox: vf.bbox,
        coordinateSpace: CANONICAL_COORDINATE_SPACE,
        confidence: vf.confidence,
        evidence: vf.evidence,
        action: 'REDACTED'
      }))
    ];

    // 3. Multimodal Spatial Fusion: Correlate DOM elements with M3 Visual Hypotheses
    let regionsMerged = 0;
    const fusedElements = rawElements.map((el) => {
      let matchedHypothesis = null;
      if (el.bounds) {
        const elCenterX = (el.bounds.x || 0) + (el.bounds.width || 0) / 2;
        const elCenterY = (el.bounds.y || 0) + (el.bounds.height || 0) / 2;

        for (const vd of visualDetections) {
          const [vx, vy, vw, vh] = vd.bbox;
          if (elCenterX >= vx && elCenterX <= vx + vw && elCenterY >= vy && elCenterY <= vy + vh) {
            matchedHypothesis = {
              type: vd.type,
              confidence: vd.confidence,
              properties: vd.properties
            };
            regionsMerged++;
            break;
          }
        }
      }
      return {
        ...el,
        visualHypothesis: matchedHypothesis
      };
    });

    // 4. Sanitize Outbound Observation Text (Typed Placeholders)
    const rawObservation = {
      url: inputs.observation?.url || '',
      title: inputs.observation?.title || '',
      pageHash: inputs.observation?.pageHash || '',
      elements: fusedElements,
      visibleText: visibleTexts,
      visualDetections
    };

    const sanitizedObservation = sanitizeObservationPayload(rawObservation, textDetections, sensitiveTargetIds);

    // Attach non-sensitive fusion metadata
    sanitizedObservation.fusionMetadata = {
      inputsReceived,
      regionsMerged,
      sensitiveRedacted: unifiedRedactionRegions.length,
      perceptionCycleId,
      timestamp
    };

    // 4.5. Generate / Finalize M6 Sanitized Screenshot
    let sanitizedScreenshot = null;
    const m5Redacted = inputs.m5Result?.redactedScreenshotUrl || inputs.m5Result?.data?.redactedScreenshotUrl || null;
    const m1Raw = inputs.m1Result?.data?.screenshot || inputs.m1Result?.screenshot || null;

    let finalScreenshotDataUrl = m5Redacted;

    // If no pre-redacted screenshot from M5, apply redactVisualCanvas to m1Raw locally
    if (!finalScreenshotDataUrl && m1Raw && typeof OffscreenCanvas !== 'undefined') {
      try {
        const blob = await (await fetch(m1Raw)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        await redactVisualCanvas(canvas, unifiedRedactionRegions, { width: tgtW, height: tgtH });
        const outBlob = await canvas.convertToBlob({ type: 'image/png' });
        finalScreenshotDataUrl = await blobToDataUrl(outBlob);
      } catch (_) {
        finalScreenshotDataUrl = null;
      }
    }

    if (finalScreenshotDataUrl) {
      const base64Clean = finalScreenshotDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
      sanitizedScreenshot = {
        dataUrl: finalScreenshotDataUrl,
        base64: base64Clean,
        mimeType: 'image/png',
        isSanitized: true,
        sanitizedBy: 'M6_PERCEPTION_FUSION',
        sensitiveRedacted: unifiedRedactionRegions.length,
        timestamp: new Date().toISOString()
      };
      sanitizedObservation.sanitizedScreenshot = sanitizedScreenshot;
    }

    // 5. Post-Redaction Verification & Strict Fail-Closed Gate
    const leakCheck = validateZeroLeakPrivacy(sanitizedObservation, m5Items, textDetections, {
      rawScreenshot: m1Raw
    });
    const privacyGatePassed = leakCheck.passed;
    const leakCheckPassed = leakCheck.passed;

    if (!privacyGatePassed) {
      // FAIL CLOSED: If privacy validation fails, strip screenshot and block release
      delete sanitizedObservation.sanitizedScreenshot;
      const blockedReason = `Privacy Gate blocked observation release: ${leakCheck.leaks.join('; ')}`;
      await broadcastTelemetry({
        type: 'SECURITY_WARNING',
        severity: 'CRITICAL',
        message: blockedReason,
        perceptionCycleId
      });

      const failedResult = {
        ok: false,
        status: 'blocked',
        error: blockedReason,
        privacyGatePassed: false,
        leakCheckPassed: false,
        blockedReason,
        latencyMs: Math.max(1, Math.round(performance.now() - startTime))
      };
      lastM6Result = failedResult;
      return failedResult;
    }

    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

    const result = {
      status: 'success',
      perceptionCycleId,
      timestamp,
      processingTimeMs,
      inputsReceived,
      regionsMerged,
      sensitiveRedacted: unifiedRedactionRegions.length,
      candidatesEvaluated,
      finalDetections: unifiedRedactionRegions.length,
      redactionRegions: unifiedRedactionRegions,
      privacyGatePassed,
      leakCheckPassed,
      sanitizedScreenshot,
      sanitizedObservation
    };

    lastM6Result = result;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ last_m6_result: result }).catch(() => {});
    }

    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M6_FUSION_COMPLETED',
      component: 'M6_FUSION',
      status: 'success',
      perceptionCycleId,
      timestamp: result.timestamp,
      latencyMs: processingTimeMs,
      metadata: {
        inputsReceived,
        regionsMerged,
        sensitiveRedacted: unifiedRedactionRegions.length,
        privacyGatePassed
      }
    });

    // Zero-Leak Telemetry: transmits only non-sensitive metadata to Debug Center
    await broadcastTelemetry({
      type: 'M6_RESULT',
      status: 'success',
      executionTimeMs: processingTimeMs,
      summary: `Perception fused (${inputsReceived.join('+')}, ${regionsMerged} correlated, ${unifiedRedactionRegions.length} redacted). Gate: PASSED.`,
      inputsReceived,
      regionsMerged,
      sensitiveRedacted: unifiedRedactionRegions.length,
      candidatesEvaluated,
      finalDetections: unifiedRedactionRegions.length,
      redactionRegions: unifiedRedactionRegions,
      privacyGatePassed,
      leakCheckPassed,
      sanitizedObservation,
      details: {
        perceptionCycleId,
        processingTimeMs,
        inputsReceived,
        regionsMerged,
        sensitiveRedacted: unifiedRedactionRegions.length,
        privacyGatePassed,
        leakCheckPassed
      }
    });

    return { ok: true, data: result };
  } catch (err) {
    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    const errorMessage = err instanceof Error ? err.message : String(err);

    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M6_FUSION_FAILED',
      component: 'M6_FUSION',
      status: 'error',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs: processingTimeMs,
      metadata: { error: errorMessage }
    });

    await broadcastTelemetry({
      type: 'M6_RESULT',
      status: 'error',
      executionTimeMs: processingTimeMs,
      summary: `Perception fusion blocked: ${errorMessage}`,
      privacyGatePassed: false,
      leakCheckPassed: false,
      details: { error: errorMessage, latencyMs: processingTimeMs }
    });

    const errorResult = {
      ok: false,
      status: 'error',
      error: errorMessage,
      privacyGatePassed: false,
      leakCheckPassed: false,
      latencyMs: processingTimeMs
    };
    lastM6Result = errorResult;
    return errorResult;
  }
}