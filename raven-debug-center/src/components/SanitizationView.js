/**
 * RAVEN Debug Center — Fusion & Sanitization Security Panel (M6)
 * The primary security observability panel: displays perception fusion,
 * sensitive redactions, privacy gate verification, and the strict privacy boundary.
 */

import { store } from '../models/store.js';

export function renderSanitizationView(container) {
  function update() {
    const state = store.getState();
    const fusion = state.fusion;
    const privacy = state.privacy;
    const hasData = (fusion.inputsReceived && fusion.inputsReceived.length > 0) || !!fusion.sanitizedObservation;

    const gatePassed = fusion.privacyGatePassed;
    const leakCheckPassed = fusion.leakCheckPassed;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🔒</span>
              <span>M6 — Perception Fusion & Privacy Sanitization Gate</span>
            </div>
            <div class="panel-subtitle">
              Verify the multi-modal fusion process and enforce the zero-leak security boundary between raw browser telemetry and external LLMs.
            </div>
          </div>
          <span class="badge-pill ${gatePassed ? 'badge-success' : 'badge-error'}">
            ${gatePassed ? 'GATE VERIFIED: PASSED' : 'GATE UNVERIFIED / HOLDING'}
          </span>
        </div>

        <!-- The Strict Privacy Boundary Diagram -->
        <div class="debug-card" style="border: 1px solid var(--border-cyan); background: radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.06) 0%, var(--bg-surface-card) 70%);">
          <div class="card-header-row">
            <div class="card-title" style="color: var(--text-cyan);">RAVEN Zero-Leak Boundary Enforcement</div>
            <span class="badge-pill ${leakCheckPassed ? 'badge-success' : 'badge-waiting'}">
              ${leakCheckPassed ? 'LEAK CHECK: CLEAN' : 'LEAK CHECK: PENDING'}
            </span>
          </div>

          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 12px 0; font-family: var(--font-mono); font-size: 12px;">
            <div style="padding: 6px 18px; border-radius: var(--radius-sm); background: rgba(244, 63, 94, 0.15); color: var(--text-rose); border: 1px solid var(--border-rose); font-weight: 700;">
              RAW BROWSER DATA (M1 Viewport, Raw DOM, Unfiltered Cookies)
            </div>
            <span style="color: var(--text-subtle);">↓</span>

            <div style="padding: 6px 18px; border-radius: var(--radius-sm); background: var(--bg-surface-elevated); border: 1px solid var(--border-default); color: var(--text-secondary);">
              RAVEN LOCAL PERCEPTION (M2 DOM Tree + M3 Vision + M4 OCR + M5 PII)
            </div>
            <span style="color: var(--text-subtle);">↓</span>

            <div style="padding: 8px 24px; border-radius: var(--radius-full); background: rgba(16, 185, 129, 0.15); border: 2px solid var(--color-emerald); color: var(--text-emerald); font-weight: 800; letter-spacing: 0.5px;">
              🛡️ PRIVACY FILTER & SANITIZER (M6 Redaction Engine)
            </div>
            <span style="color: var(--text-emerald); font-weight: bold;">↓ [PRIVACY BOUNDARY — ZERO RAW PII PASSES]</span>

            <div style="padding: 6px 18px; border-radius: var(--radius-sm); background: rgba(6, 182, 212, 0.15); color: var(--text-cyan); border: 1px solid var(--border-cyan); font-weight: 600;">
              SANITIZED OBSERVATION (Masked Elements, Anonymized Labels)
            </div>
            <span style="color: var(--text-subtle);">↓</span>

            <div style="padding: 6px 18px; border-radius: var(--radius-sm); background: rgba(139, 92, 246, 0.15); color: var(--text-violet); border: 1px solid var(--color-violet); font-weight: 600;">
              SIMPLE-UI AGENT & GEMINI LLM API
            </div>
          </div>
        </div>

        <!-- Metrics Row -->
        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">PII Candidates</span>
            <span class="stat-box-value cyan">${fusion.candidatesEvaluated || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Final Detections</span>
            <span class="stat-box-value ${fusion.finalDetections > 0 ? 'rose' : ''}">${fusion.finalDetections || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Redacted Regions</span>
            <span class="stat-box-value emerald">${fusion.sensitiveRedacted || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Privacy Gate</span>
            <span class="stat-box-value ${gatePassed ? 'emerald' : 'rose'}">
              ${gatePassed ? 'PASSED (SAFE)' : 'FAIL-CLOSED (BLOCKED)'}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">M6 Latency</span>
            <span class="stat-box-value" style="font-size: 14px; font-family: var(--font-mono);">
              ${fusion.executionTimeMs ? `${fusion.executionTimeMs}ms` : '—'}
            </span>
          </div>
        </div>

        ${fusion.blockedReason ? `
          <div class="debug-card" style="border: 1px solid var(--border-rose); background: rgba(244, 63, 94, 0.08); margin-top: 12px;">
            <div class="card-header-row">
              <div class="card-title" style="color: var(--text-rose);">🚫 Privacy Gate Alert — Fail-Closed Block Active</div>
              <span class="badge-pill badge-error">BLOCKED</span>
            </div>
            <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-rose); margin-top: 8px;">
              ${fusion.blockedReason}
            </div>
          </div>
        ` : ''}

        ${(fusion.redactionRegions && fusion.redactionRegions.length > 0) ? `
          <div class="debug-card" style="margin-top: 14px;">
            <div class="card-header-row">
              <div class="card-title">🛡️ Redaction Regions Plan (Zero Raw Secrets Excluded)</div>
              <span style="font-size: 11px; color: var(--text-emerald); font-family: var(--font-mono); font-weight: 600;">
                Verified Purged From Outbound Observation
              </span>
            </div>
            <div class="dom-table-container">
              <table class="cyber-table">
                <thead>
                  <tr>
                    <th>Region ID</th>
                    <th>Category</th>
                    <th>Confidence</th>
                    <th>Source</th>
                    <th>Coordinates [x,y,w,h]</th>
                    <th>Evidence</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${fusion.redactionRegions.map((reg) => `
                    <tr>
                      <td><span class="badge-pill" style="color: var(--text-cyan);">${reg.id}</span></td>
                      <td>
                        <span class="tag-badge" style="background: rgba(244, 63, 94, 0.12); color: var(--text-rose); border-color: var(--border-rose);">
                          ${reg.type}
                        </span>
                      </td>
                      <td style="font-family: var(--font-mono); font-size: 11px;">
                        ${reg.confidence ? Math.round(reg.confidence * 100) + '%' : '—'}
                      </td>
                      <td style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">${reg.source}</td>
                      <td style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);">
                        ${reg.bbox ? `[${reg.bbox.x}, ${reg.bbox.y}, ${reg.bbox.width}, ${reg.bbox.height}]` : '—'}
                      </td>
                      <td style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                        ${(reg.evidence || []).join(', ')}
                      </td>
                      <td>
                        <span class="badge-pill badge-success" style="font-size: 10px;">${reg.action || 'REDACTED'}</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div class="empty-state-title">Awaiting Fusion & Sanitization Cycle</div>
            <div class="empty-state-desc">
              When M1–M5 outputs are merged into the final sanitized observation payload, the unified data structure and redaction diff will appear here.
            </div>
          </div>
        ` : `
          <div class="debug-card" style="margin-top: 14px;">
            <div class="card-header-row">
              <div class="card-title">Sanitized Observation Payload Transmitted to Agent</div>
              <span class="badge-pill ${gatePassed ? 'badge-success' : 'badge-error'}">
                ${gatePassed ? 'SANITIZED & VERIFIED' : 'HELD IN BUFFER (BLOCKED)'}
              </span>
            </div>

            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); max-height: 400px; overflow-y: auto;">
              <pre style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); margin: 0; white-space: pre-wrap; word-break: break-all;">
${fusion.sanitizedObservation ? JSON.stringify(fusion.sanitizedObservation, null, 2) : '(Observation blocked by privacy gate)'}
              </pre>
            </div>
          </div>
        `}
      </div>
    `;
  }

  store.subscribe(update);
  update();
}
