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
            <span class="stat-box-label">Perception Inputs</span>
            <span class="stat-box-value">${(fusion.inputsReceived || []).length} / 5</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Regions Merged</span>
            <span class="stat-box-value cyan">${fusion.regionsMerged || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Sensitive Redacted</span>
            <span class="stat-box-value emerald">${fusion.sensitiveRedacted || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Privacy Gate</span>
            <span class="stat-box-value ${gatePassed ? 'emerald' : 'amber'}">
              ${gatePassed ? 'UNLOCKED' : 'LOCKED'}
            </span>
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div class="empty-state-title">Awaiting Fusion & Sanitization Cycle</div>
            <div class="empty-state-desc">
              When M1–M5 outputs are merged into the final sanitized observation payload, the unified data structure and redaction diff will appear here.
            </div>
          </div>
        ` : `
          <div class="debug-card">
            <div class="card-header-row">
              <div class="card-title">Sanitized Observation Payload Transmitted to Agent</div>
              <span class="badge-pill badge-success">READY FOR GEMINI</span>
            </div>

            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); max-height: 400px; overflow-y: auto;">
              <pre style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); margin: 0; white-space: pre-wrap; word-break: break-all;">
${fusion.sanitizedObservation ? JSON.stringify(fusion.sanitizedObservation, null, 2) : '(Observation structure holding in buffer)'}
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
