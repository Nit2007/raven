/**
 * m6-fusion.js — RAVEN Milestone M6: Perception Fusion & Privacy Sanitization Gate
 * 
 * Fuses multi-modal perception streams:
 * - M2 Semantic DOM elements
 * - M3 Geometric Visual Hypotheses (VisualDetections)
 * - M4 OCR Text Blocks
 * - M5 Privacy / PII Redaction Metadata
 * 
 * ENFORCES THE STRICT FAIL-CLOSED PRIVACY GATE:
 * - Genuine validation: Checks that all sensitive tokens detected by M5 are masked.
 * - Raw screenshots are NEVER passed to Gemini or external LLMs.
 * - Never manufactures true: If unredacted PII is found, fails closed.
 */

let lastM6Result = null;

export function getLastM6Result() {
  return lastM6Result;
}

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

/**
 * Validates whether an observation contains unredacted sensitive tokens
 * Returns { passed: boolean, leaks: string[] }
 */
export function validateZeroLeakPrivacy(payload, sensitiveItems = []) {
  const leaks = [];
  const payloadStr = JSON.stringify(payload);

  // 1. Raw screenshot leak check
  if (payloadStr.includes('data:image/png;base64') || payloadStr.includes('data:image/jpeg;base64')) {
    leaks.push('Raw image bitmap detected in outbound payload');
  }

  // 2. Sensitive item presence check
  for (const item of sensitiveItems) {
    if (item.value && payloadStr.includes(item.value)) {
      leaks.push(`Unredacted sensitive value found: ${item.type}`);
    }
  }

  // 3. Regex scan for critical secrets
  if (/\b(?:AIza[0-9A-Za-z-_]{35}|sk-[a-zA-Z0-9]{20,})\b/.test(payloadStr)) {
    leaks.push('API key pattern detected in outbound payload');
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
    const sensitiveItems = inputs.m5Result?.data?.items || [];
    const sensitiveTargetIds = new Set(sensitiveItems.map(s => s.target_id).filter(Boolean));

    const inputsReceived = [];
    if (inputs.m1Result) inputsReceived.push('M1');
    if (inputs.m2Result) inputsReceived.push('M2');
    if (inputs.m3Result) inputsReceived.push('M3');
    if (inputs.m4Result) inputsReceived.push('M4');
    if (inputs.m5Result) inputsReceived.push('M5');

    // 1. Multimodal Spatial Fusion: Correlate DOM elements with M3 Visual Hypotheses
    let regionsMerged = 0;
    const sanitizedElements = rawElements.map((el) => {
      const isSensitive = sensitiveTargetIds.has(el.target_id);
      let text = el.text || '';
      let name = el.name || '';

      // Mask sensitive DOM fields
      if (isSensitive) {
        text = '[REDACTED_SENSITIVE]';
        name = '[REDACTED_SENSITIVE]';
      }

      // Spatially correlate with M3 Visual Hypotheses
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
        text,
        name,
        visualHypothesis: matchedHypothesis
      };
    });

    // 2. Sanitize visible text
    let sanitizedVisibleText = (inputs.observation?.visibleText || []).map(t => {
      let safeText = t;
      for (const item of sensitiveItems) {
        if (item.value) {
          safeText = safeText.replaceAll(item.value, '[REDACTED]');
        }
      }
      return safeText;
    });

    // 3. Construct candidate safe multimodal observation payload
    // STRICT ZERO-LEAK GUARANTEE: Raw screenshot is NEVER included in this payload!
    const candidateObservation = {
      url: inputs.observation?.url || '',
      title: inputs.observation?.title || '',
      pageHash: inputs.observation?.pageHash || '',
      elements: sanitizedElements,
      visibleText: sanitizedVisibleText,
      visualDetections: visualDetections, // M3 structured hypotheses
      fusionMetadata: {
        inputsReceived,
        regionsMerged,
        sensitiveRedacted: sensitiveItems.length,
        perceptionCycleId,
        timestamp
      }
    };

    // 4. Fail-Closed Privacy Gate Verification
    const leakCheck = validateZeroLeakPrivacy(candidateObservation, sensitiveItems);
    const privacyGatePassed = leakCheck.passed;
    const leakCheckPassed = leakCheck.passed;

    if (!privacyGatePassed) {
      // FAIL CLOSED: If privacy validation fails, do not release unsafe observation
      await broadcastTelemetry({
        type: 'SECURITY_WARNING',
        severity: 'CRITICAL',
        message: `Privacy Gate blocked observation release: ${leakCheck.leaks.join('; ')}`,
        perceptionCycleId
      });
      throw new Error(`Privacy Gate breached: ${leakCheck.leaks.join(', ')}`);
    }

    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

    const result = {
      status: 'success',
      perceptionCycleId,
      timestamp,
      processingTimeMs,
      inputsReceived,
      regionsMerged,
      sensitiveRedacted: sensitiveItems.length,
      privacyGatePassed,
      leakCheckPassed,
      sanitizedObservation: candidateObservation
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
        sensitiveRedacted: sensitiveItems.length,
        privacyGatePassed
      }
    });

    await broadcastTelemetry({
      type: 'M6_RESULT',
      status: 'success',
      executionTimeMs: processingTimeMs,
      summary: `Perception fused (${inputsReceived.join('+')}, ${regionsMerged} regions correlated). Gate: PASSED.`,
      inputsReceived,
      regionsMerged,
      sensitiveRedacted: sensitiveItems.length,
      privacyGatePassed,
      leakCheckPassed,
      sanitizedObservation: candidateObservation,
      details: {
        perceptionCycleId,
        processingTimeMs,
        inputsReceived,
        regionsMerged,
        sensitiveRedacted: sensitiveItems.length,
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

    return {
      ok: false,
      status: 'error',
      error: errorMessage,
      privacyGatePassed: false,
      leakCheckPassed: false,
      latencyMs: processingTimeMs
    };
  }
}
