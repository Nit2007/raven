/**
 * RAVEN Debug Center — Privacy / PII Panel (M5)
 * Displays detected faces, sensitive regions, PII, and entity redaction lifecycle:
 * Detected → Redacted → Sanitized.
 * NEVER exposes raw sensitive values unmasked in the dashboard.
 */

import { store } from '../models/store.js';

export function renderPrivacyView(container) {
  function update() {
    const state = store.getState();
    const privacy = state.privacy;
    const items = privacy.items || [];
    const hasData = items.length > 0 || privacy.facesDetected > 0 || privacy.piiDetected > 0;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🛡️</span>
              <span>M5 — Face & PII / Sensitive Content Detection</span>
            </div>
            <div class="panel-subtitle">
              Verify sensitive entity classification and lifecycle tracking: Detected → Redacted → Sanitized.
            </div>
          </div>
          <span class="badge-pill ${hasData ? 'badge-success' : 'badge-waiting'}">
            ${hasData ? `${items.length} ENTITIES TRACKED` : 'WAITING FOR M5'}
          </span>
        </div>

        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">Faces Detected</span>
            <span class="stat-box-value ${privacy.facesDetected > 0 ? 'rose' : ''}">
              ${privacy.facesDetected || 0}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">PII Entities</span>
            <span class="stat-box-value ${privacy.piiDetected > 0 ? 'amber' : ''}">
              ${privacy.piiDetected || 0}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Sensitive Regions</span>
            <span class="stat-box-value ${privacy.sensitiveRegions > 0 ? 'rose' : ''}">
              ${privacy.sensitiveRegions || 0}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Gate Verification</span>
            <span class="stat-box-value emerald">
              ${privacy.gateStatus.toUpperCase()}
            </span>
          </div>
        </div>

        ${items.some(i => i.thumbnailDataUrl) ? `
          <div class="debug-card" style="margin-top: 14px;">
            <div class="card-header-row">
              <div class="card-title">🫥 Redacted Faces — Local Blur Applied</div>
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                Pixels blurred client-side, before transmission
              </span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px;">
              ${items.filter(i => i.thumbnailDataUrl).map(i => `
                <div style="text-align: center; width: 96px;">
                  <img src="${i.thumbnailDataUrl}"
                       style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-rose, #f43f5e); display: block; margin: 0 auto;"
                       alt="Blurred face detection" />
                  <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 6px; font-family: var(--font-mono);">${i.id}</div>
                  <div style="font-size: 10px; color: var(--text-rose, #f43f5e);">${Math.round((i.confidence || 0) * 100)}% conf.</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🛡️</div>
            <div class="empty-state-title">No Sensitive Content Telemetry</div>
            <div class="empty-state-desc">
              When RAVEN's M5 Face and PII detection milestone identifies personal data, payment info, passwords, or human faces on screen, entries will appear with masking verification.
            </div>
          </div>
        ` : `
          <div class="debug-card">
            <div class="card-header-row">
              <div class="card-title">Sensitive Items Audit Registry</div>
              <span style="font-size: 11px; color: var(--text-rose); font-family: var(--font-mono); font-weight: 600;">
                🔒 Zero Unmasked Secrets Policy Enforced
              </span>
            </div>

            <div class="dom-table-container">
              <table class="cyber-table">
                <thead>
                  <tr>
                    <th>Entity ID</th>
                    <th>Category</th>
                    <th>Masked Value Preview</th>
                    <th>Confidence</th>
                    <th>Coordinates</th>
                    <th>Lifecycle Stage</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item, idx) => {
                    const stage = item.stage || 'detected'; // detected | redacted | sanitized
                    return `
                      <tr>
                        <td>
                          <span class="badge-pill" style="color: var(--text-cyan);">
                            ${item.id || `SENS-${idx + 1}`}
                          </span>
                        </td>
                        <td>
                          <span class="tag-badge" style="background: rgba(244, 63, 94, 0.12); color: var(--text-rose); border-color: var(--border-rose);">
                            ${item.category || 'PII / Sensitive'}
                          </span>
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 11.5px;">
                          <!-- Never expose raw secrets: ensure masked representation -->
                          ${item.thumbnailDataUrl ? `
                            <img src="${item.thumbnailDataUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px; border: 1px solid var(--border-rose, #f43f5e);" alt="Blurred face" />
                            <span style="color: var(--text-muted); font-style: italic;">blurred (local)</span>
                          ` : item.maskedPreview ? `<code>${item.maskedPreview}</code>` : `<span style="color: var(--text-muted); font-style: italic;">[REDACTED VALUE]</span>`}
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 11px;">
                          ${item.confidence ? Math.round(item.confidence * 100) + '%' : '—'}
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);">
                          ${item.box ? JSON.stringify(item.box) : '—'}
                        </td>
                        <td>
                          <div class="pii-status-flow">
                            <span class="pii-stage ${stage === 'detected' ? 'active-detected' : ''}">Detected</span>
                            <span>→</span>
                            <span class="pii-stage ${stage === 'redacted' ? 'active-redacted' : ''}">Redacted</span>
                            <span>→</span>
                            <span class="pii-stage ${stage === 'sanitized' ? 'active-sanitized' : ''}">Sanitized</span>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;
  }

  store.subscribe(update);
  update();
}