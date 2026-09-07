/**
 * RAVEN Debug Center — Fusion & Sanitization Security Panel (M6)
 * The primary security observability panel: displays perception fusion,
 * sensitive redactions, privacy gate verification, and the strict privacy boundary.
 */

import { store } from '../models/store.js';

export function renderSanitizationView(container) {
  let showDebugOverlay = false;

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
              <div style="display: flex; align-items: center; gap: 8px;">
                <button id="toggleRedactionDebugBtn" class="btn-cyber ${showDebugOverlay ? 'btn-cyber-primary' : ''}" style="font-size: 10.5px; padding: 3px 8px;">
                  ${showDebugOverlay ? '🔍 Debug Overlay: ON' : '🔍 Debug Overlay: OFF'}
                </button>
                <span style="font-size: 11px; color: var(--text-emerald); font-family: var(--font-mono); font-weight: 600;">
                  Verified Purged From Outbound Observation
                </span>
              </div>
            </div>

            ${showDebugOverlay ? `
              <!-- Visual Redaction Debug Mode (Section 11) -->
              <div style="background: rgba(6, 182, 212, 0.04); border: 1px dashed var(--border-cyan); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span style="font-size: 12px; font-weight: 700; color: var(--text-cyan);">
                    Spatial Coordinate Debug Overlay (M5 RAW vs M6 NORM vs FINAL)
                  </span>
                  <div style="display: flex; gap: 12px; font-size: 11px; font-family: var(--font-mono);">
                    <span style="color: #f59e0b;">■ M5 RAW</span>
                    <span style="color: #06b6d4;">■ M6 NORMALIZED</span>
                    <span style="color: #10b981;">■ FINAL REDACTION</span>
                  </div>
                </div>

                ${(privacy.screenshotUrl || state.browser?.screenshotUrl) ? `
                  <div style="position: relative; overflow: hidden; border-radius: var(--radius-sm); background: #090d16; max-height: 480px;">
                    <img src="${privacy.screenshotUrl || state.browser?.screenshotUrl}" style="display: block; width: 100%; height: auto; opacity: 0.9;" alt="Screenshot Preview" />
                    <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
                         viewBox="0 0 ${state.milestones?.M1?.details?.image?.width || 1280} ${state.milestones?.M1?.details?.image?.height || 800}"
                         preserveAspectRatio="none">
                      ${fusion.redactionRegions.filter(r => r.type === 'face').map((reg) => {
                        const m6Box = reg.bbox || { x: 0, y: 0, width: 0, height: 0 };
                        const m5Box = reg.sourceBox || m6Box;
                        return `
                          <!-- M5 Raw Box (Amber Dashed) -->
                          <rect x="${m5Box.x}" y="${m5Box.y}" width="${m5Box.width}" height="${m5Box.height}"
                                fill="rgba(245, 158, 11, 0.12)" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" />
                          <text x="${m5Box.x + 4}" y="${Math.max(12, m5Box.y - 4)}" fill="#f59e0b" font-size="10" font-family="monospace" font-weight="700">
                            M5 RAW [${m5Box.x},${m5Box.y},${m5Box.width},${m5Box.height}]
                          </text>

                          <!-- M6 Normalized Box (Cyan Solid) -->
                          <rect x="${m6Box.x}" y="${m6Box.y}" width="${m6Box.width}" height="${m6Box.height}"
                                fill="rgba(6, 182, 212, 0.12)" stroke="#06b6d4" stroke-width="2" />
                          <text x="${m6Box.x + 4}" y="${m6Box.y + m6Box.height + 12}" fill="#06b6d4" font-size="10" font-family="monospace" font-weight="700">
                            M6 NORM [${m6Box.x},${m6Box.y},${m6Box.width},${m6Box.height}]
                          </text>

                          <!-- FINAL Redaction Box (Emerald Padded) -->
                          <rect x="${Math.max(0, m6Box.x - 4)}" y="${Math.max(0, m6Box.y - 4)}" width="${m6Box.width + 8}" height="${m6Box.height + 8}"
                                fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" stroke-width="1.5" />
                        `;
                      }).join('')}
                    </svg>
                  </div>
                ` : `
                  <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                    Screenshot preview not available for overlay rendering.
                  </div>
                `}

                <!-- Coordinate Comparison Table -->
                <div style="margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px;">
                  ${fusion.redactionRegions.filter(r => r.type === 'face').map((reg) => {
                    const m6Box = reg.bbox || { x: 0, y: 0, width: 0, height: 0 };
                    const m5Box = reg.sourceBox || m6Box;
                    return `
                      <div style="background: var(--bg-surface-elevated); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 11px;">
                        <div style="color: var(--text-cyan); font-weight: 700; margin-bottom: 4px;">Region: ${reg.id}</div>
                        <div style="color: #f59e0b;">M5 RAW: x=${m5Box.x} y=${m5Box.y} w=${m5Box.width} h=${m5Box.height}</div>
                        <div style="color: #06b6d4;">M6 NORM: x=${m6Box.x} y=${m6Box.y} w=${m6Box.width} h=${m6Box.height}</div>
                        <div style="color: #10b981;">FINAL: x=${m6Box.x} y=${m6Box.y} w=${m6Box.width} h=${m6Box.height}</div>
                        <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">Space: ${m6Box.coordinateSpace || 'm1-screenshot-pixels'}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

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

    const toggleBtn = container.querySelector('#toggleRedactionDebugBtn');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        showDebugOverlay = !showDebugOverlay;
        update();
      };
    }
  }

  store.subscribe(update);
  update();
}
