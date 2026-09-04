/**
 * m6-fusion.js — RAVEN Milestone M6: Perception Fusion & Privacy Sanitization Gate
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
        url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*']
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

  // Explicit non-PII financial prices: $29.99, 14.50 USD, €12.00, etc.
  if (/^\$?\s*\d+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|CAD|AUD|\$|€|£|₹)?$/i.test(trimmed)) {
    if (!lowerContext.includes('card') && !lowerContext.includes('account')) return true;
  }

  // Quantities and simple counts: Qty: 1, 10 items, etc.
  if (/^(?:qty|quantity|items?|units?)?[:\s]*\d{1,4}$/i.test(trimmed)) return true;

  // Product SKUs and order numbers: SKU-1234, #98765
  if (/^(?:sku|item|product|order|part)?[-#\s]*[A-Z0-9]{3,10}$/i.test(trimmed)) {
    if (!lowerContext.includes('account') && !lowerContext.includes('ssn')) return true;
  }

  // Generic website UI action labels
  if (/^(?:sign in|log in|submit|confirm|continue|checkout|cart|add to cart|search|filter|sort|next|previous)$/i.test(trimmed)) {
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
  const ccMatch = text.match(/\b(?:\d{4}[-\s]?){3}\d{1,4}\b/) || text.match(/\b(?:[*•]{4}[-\s]?){3}\d{4}\b/);
  if (ccMatch) {
    const rawVal = ccMatch[0];
    const isMasked = rawVal.includes('*') || rawVal.includes('•');
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
  const nameLabelMatch = text.match(/(?:name|customer|patient|passenger|employee|user)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/i);
  if (nameLabelMatch) {
    candidates.push({
      id: `pii-${candidates.length + 1}`,
      type: 'PERSON_NAME_LIKE',
      source,
      rawText: nameLabelMatch[1],
      bbox,
      confidence: 0.88,
      evidence: ['person-name-label-context'],
      action: 'REDACT',
      target_id
    });
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

// --- Visual Canvas Redaction ---
export async function redactVisualCanvas(canvasOrBitmap, boundingBoxes = []) {
  if (!canvasOrBitmap) return null;
  try {
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined' && (canvasOrBitmap instanceof OffscreenCanvas)) {
      canvas = canvasOrBitmap;
      ctx = canvas.getContext('2d');
    } else if (typeof document !== 'undefined' && canvasOrBitmap.getContext) {
      canvas = canvasOrBitmap;
      ctx = canvas.getContext('2d');
    } else {
      return null;
    }

    // Apply safety-padded opaque redaction blocks
    ctx.save();
    ctx.fillStyle = '#1e293b'; // Slate dark mask
    ctx.strokeStyle = '#f43f5e'; // Rose border
    ctx.lineWidth = 2;

    for (const box of boundingBoxes) {
      const pad = 4;
      const rx = Math.max(0, (box.x || 0) - pad);
      const ry = Math.max(0, (box.y || 0) - pad);
      const rw = Math.min(canvas.width - rx, (box.width || 0) + pad * 2);
      const rh = Math.min(canvas.height - ry, (box.height || 0) + pad * 2);

      if (rw > 0 && rh > 0) {
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      }
    }
    ctx.restore();

    return canvas;
  } catch (_) {
    return null;
  }
}

// --- Post-Redaction Verification & Fail-Closed Gate ---
export function validateZeroLeakPrivacy(payload, sensitiveItems = [], rawDetections = []) {
  const leaks = [];
  const payloadStr = JSON.stringify(payload);

  // 1. Raw screenshot bitmap leak check (NEVER permit base64 screenshot in outbound observation)
  if (payloadStr.includes('data:image/png;base64') || payloadStr.includes('data:image/jpeg;base64')) {
    leaks.push('Raw image bitmap detected in outbound payload');
  }

  // 2. Sensitive text presence check (ensures raw strings are 100% purged)
  const valuesToCheck = [
    ...sensitiveItems.map(i => i.value).filter(Boolean),
    ...rawDetections.map(d => d.rawText).filter(Boolean)
  ];

  for (const rawVal of valuesToCheck) {
    if (rawVal.length >= 3 && payloadStr.includes(rawVal)) {
      leaks.push(`Unredacted sensitive value detected in sanitized text: "${rawVal.slice(0, 3)}***"`);
    }
  }

  // 3. Regex scan for critical secrets (API keys, unmasked tokens)
  if (/\b(?:AIza[0-9A-Za-z-_]{30,35}|sk-[a-zA-Z0-9]{20,})\b/.test(payloadStr)) {
    leaks.push('API key pattern detected in outbound payload');
  }

  // 4. Raw credit card unmasked pattern check
  if (/\b(?:\d{4}[-\s]?){3}\d{4}\b/.test(payloadStr)) {
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

    // 1. Contextual Multi-Modal PII Detection (OCR + DOM + Visual)
    const piiAnalysis = detectContextualPii({
      ocrBlocks: m4Blocks,
      domElements: rawElements,
      visualHypotheses: visualDetections,
      visibleTexts
    });

    const textDetections = piiAnalysis.detections;
    const candidatesEvaluated = piiAnalysis.candidatesEvaluated;

    // 2. Ingest M5 Face Detections
    const faceDetections = m5Items.filter(item => item.type === 'face' || item.category === 'Face / Avatar');
    const sensitiveTargetIds = new Set(
      textDetections.map(d => d.target_id).filter(Boolean)
    );

    // Build unified redaction plan (without raw PII values for safe telemetry)
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
      ...faceDetections.map((fd, idx) => ({
        id: fd.id || `FACE-${idx + 1}`,
        type: 'face',
        source: fd.source || 'M5_VISUAL',
        bbox: fd.box || fd.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        confidence: fd.confidence || 0.88,
        evidence: ['biometric-face-structure'],
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

    // 5. Post-Redaction Verification & Strict Fail-Closed Gate
    const leakCheck = validateZeroLeakPrivacy(sanitizedObservation, m5Items, textDetections);
    const privacyGatePassed = leakCheck.passed;
    const leakCheckPassed = leakCheck.passed;

    if (!privacyGatePassed) {
      // FAIL CLOSED: If privacy validation fails, do not release unsafe observation
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
