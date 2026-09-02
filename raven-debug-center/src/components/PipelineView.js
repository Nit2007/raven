/**
 * RAVEN Debug Center — Pipeline Status View (M1–M6)
 * Upgraded with a specialized real live status panel for Milestone M1 (Real Viewport / Screenshot Capture),
 * displaying dynamic aspect ratio, image metadata, capture latency, and real screenshot preview.
 */

import { store } from '../models/store.js';
import { MILESTONES, MILESTONE_STATUS } from '../models/types.js';

export function renderPipelineView(container) {
  const expandedCards = new Set();

  function update() {
    const state = store.getState();
    const milestones = Object.keys(MILESTONES).map(key => state.milestones[key]);
    const m1 = state.milestones.M1;
    const m1Details = m1.details || {};
    const screenshotUrl = state.browser.screenshotUrl || m1Details.screenshot;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🔄</span>
              <span>Perception Pipeline Milestones (M1 – M6)</span>
            </div>
            <div class="panel-subtitle">
              Verify execution status, step latencies, output counts, and raw payload telemetry for each perception stage.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-cyber" id="expand-all-milestones-btn">Expand All Details</button>
            <button class="btn-cyber" id="collapse-all-milestones-btn">Collapse All</button>
          </div>
        </div>

        <div class="pipeline-grid">
          ${milestones.map(m => {
            const isExpanded = expandedCards.has(m.id);
            let statusBadgeClass = 'badge-waiting';
            if (m.status === MILESTONE_STATUS.SUCCESS) statusBadgeClass = 'badge-success';
            else if (m.status === MILESTONE_STATUS.RUNNING) statusBadgeClass = 'badge-running';
            else if (m.status === MILESTONE_STATUS.ERROR) statusBadgeClass = 'badge-error';

            // Milestone M1 Dedicated Live Status Panel
            if (m.id === 'M1') {
              const det = m.details || {};
              const vp = det.viewport;
              const img = det.image;

              return `
                <div class="milestone-card status-${m.status}" id="card-M1" style="grid-column: 1 / -1; background: radial-gradient(circle at 100% 0%, rgba(6, 182, 212, 0.05) 0%, var(--bg-surface-card) 60%);">
                  <div class="milestone-header">
                    <div class="milestone-title-group">
                      <span class="milestone-code">M1</span>
                      <span class="milestone-name">M1 — Screenshot / Viewport Capture</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="btn-cyber btn-cyber-primary" id="m1-trigger-btn" style="padding: 4px 10px; font-size: 11.5px;" title="Trigger real browser viewport capture">
                        <span>📷</span>
                        <span>Capture Now</span>
                      </button>
                      <span class="badge-pill ${statusBadgeClass}">${m.status.toUpperCase()}</span>
                    </div>
                  </div>

                  <!-- Real M1 Status Field Grid -->
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 6px;">
                    <div class="stat-box">
                      <span class="stat-box-label">Status</span>
                      <span class="stat-box-value ${m.status === 'success' ? 'emerald' : m.status === 'error' ? 'rose' : m.status === 'running' ? 'cyan' : 'amber'}" style="font-size: 13px;">
                        ${m.status.toUpperCase()}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Capture ID</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);">
                        ${det.captureId || '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Perception Cycle</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);">
                        ${det.perceptionCycleId || '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Viewport (CSS)</span>
                      <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--text-cyan);">
                        ${vp ? `${vp.width} × ${vp.height}` : '— × —'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Aspect Ratio</span>
                      <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--text-cyan);">
                        ${vp?.aspectRatio !== undefined ? vp.aspectRatio : '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Ratio Representation</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--text-secondary);">
                        ${vp?.ratio || '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Device Pixel Ratio</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);">
                        ${det.devicePixelRatio ? `${det.devicePixelRatio}x` : '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Image Format</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);">
                        ${img?.format ? img.format.toUpperCase() : '—'}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Encoded Size</span>
                      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);">
                        ${img?.sizeFormatted || (img?.sizeBytes ? `${img.sizeBytes} B` : '—')}
                      </span>
                    </div>

                    <div class="stat-box">
                      <span class="stat-box-label">Capture Latency</span>
                      <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--text-violet);">
                        ${m.executionTimeMs ? `${m.executionTimeMs} ms` : '—'}
                      </span>
                    </div>

                    <div class="stat-box" style="grid-column: span 2;">
                      <span class="stat-box-label">Timestamp</span>
                      <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">
                        ${det.timestamp ? new Date(det.timestamp).toLocaleString() : (m.lastUpdated ? new Date(m.lastUpdated).toLocaleString() : '—')}
                      </span>
                    </div>
                  </div>

                  <!-- Error Banner if Capture Failed -->
                  ${m.status === 'error' ? `
                    <div style="margin-top: 8px; padding: 10px 14px; background: rgba(244, 63, 94, 0.15); border: 1px solid var(--border-rose); border-radius: var(--radius-md); color: var(--text-rose); font-family: var(--font-mono); font-size: 12px;">
                      <strong>M1 Capture Error:</strong> ${det.error || m.summary}
                    </div>
                  ` : ''}

                  <!-- Live Screenshot Preview Section -->
                  <div style="margin-top: 12px;">
                    <div class="stat-box-label" style="margin-bottom: 6px;">Screenshot Preview</div>
                    <div class="browser-preview-box" style="min-height: 220px; max-height: 340px;">
                      ${screenshotUrl ? `
                        <img src="${screenshotUrl}" alt="Real M1 Viewport Capture" class="browser-canvas-img" style="max-height: 320px; width: auto; max-width: 100%; border-radius: var(--radius-sm);" />
                      ` : `
                        <div class="empty-state" style="border: none; background: transparent; padding: 24px;">
                          <div class="empty-state-icon">📷</div>
                          <div class="empty-state-title">Waiting for browser capture</div>
                          <div class="empty-state-desc">
                            Trigger M1 in the Simple-UI extension to capture the real visible viewport. No simulated or placeholder images are used.
                          </div>
                        </div>
                      `}
                    </div>
                  </div>

                  <!-- Expandable Raw JSON Metadata Drawer -->
                  ${isExpanded ? `
                    <div class="milestone-details-drawer" style="margin-top: 10px;">
                      <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-cyan);">M1 Complete Payload JSON:</div>
                      <pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(det, null, 2)}</pre>
                    </div>
                  ` : ''}

                  <div class="milestone-footer" style="margin-top: 12px;">
                    <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                      ${m.summary || 'Awaiting viewport capture.'}
                    </span>
                    <button class="milestone-toggle-btn" data-toggle="M1">
                      ${isExpanded ? 'Hide Details ▲' : 'Inspect Details ▼'}
                    </button>
                  </div>
                </div>
              `;
            }

            // Other Milestones (M2–M6) standard cards
            return `
              <div class="milestone-card status-${m.status}" id="card-${m.id}">
                <div class="milestone-header">
                  <div class="milestone-title-group">
                    <span class="milestone-code">${m.id}</span>
                    <span class="milestone-name">${m.name}</span>
                  </div>
                  <span class="badge-pill ${statusBadgeClass}">${m.status.toUpperCase()}</span>
                </div>

                <div class="milestone-metrics">
                  <div class="metric-item">
                    <span class="metric-label">Execution Time</span>
                    <span class="metric-value">${m.executionTimeMs ? `${m.executionTimeMs} ms` : '0 ms'}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Last Updated</span>
                    <span class="metric-value">
                      ${m.lastUpdated ? new Date(m.lastUpdated).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>

                <div class="milestone-summary">
                  ${m.summary || 'Awaiting milestone execution.'}
                </div>

                ${isExpanded ? `
                  <div class="milestone-details-drawer">
                    <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-cyan);">Raw Payload Details:</div>
                    <pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${m.details ? JSON.stringify(m.details, null, 2) : '(No additional metadata provided for this cycle)'}</pre>
                  </div>
                ` : ''}

                <div class="milestone-footer">
                  <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                    ${MILESTONES[m.id]?.shortName || m.id}
                  </span>
                  <button class="milestone-toggle-btn" data-toggle="${m.id}">
                    ${isExpanded ? 'Hide Details ▲' : 'Inspect Details ▼'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Bind drawer click events
    milestones.forEach(m => {
      const btn = container.querySelector(`[data-toggle="${m.id}"]`);
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedCards.has(m.id)) {
          expandedCards.delete(m.id);
        } else {
          expandedCards.add(m.id);
        }
        update();
      });
    });

    container.querySelector('#expand-all-milestones-btn')?.addEventListener('click', () => {
      milestones.forEach(m => expandedCards.add(m.id));
      update();
    });

    container.querySelector('#collapse-all-milestones-btn')?.addEventListener('click', () => {
      expandedCards.clear();
      update();
    });

    container.querySelector('#m1-trigger-btn')?.addEventListener('click', () => {
      window.postMessage({ type: 'RAVEN_TRIGGER_M1' }, '*');
    });
  }

  store.subscribe(update);
  update();
}
