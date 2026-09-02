/**
 * RAVEN Debug Center — Vision Panel (M3)
 * Displays detected visual regions, bounding boxes, confidence, categories, and allows
 * switching between Original, Vision regions, and Annotated screenshot views.
 */

import { store } from '../models/store.js';

export function renderVisionView(container) {
  let activeViewMode = 'annotated'; // 'original' | 'regions' | 'annotated'

  function update() {
    const state = store.getState();
    const vision = state.vision;
    const browser = state.browser;
    const regions = vision.regions || [];
    const hasData = regions.length > 0 || !!vision.sourceScreenshotUrl || !!browser.screenshotUrl;

    const screenshotUrl = vision.sourceScreenshotUrl || browser.screenshotUrl;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>👁️</span>
              <span>M3 — Local Vision Perception</span>
            </div>
            <div class="panel-subtitle">
              Inspect visual object detection, bounding boxes, UI category classifications, and confidence metrics.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="nav-container" style="background: var(--bg-surface-elevated); padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <button class="btn-cyber ${activeViewMode === 'original' ? 'btn-cyber-primary' : ''}" data-mode="original">Original</button>
              <button class="btn-cyber ${activeViewMode === 'regions' ? 'btn-cyber-primary' : ''}" data-mode="regions">Vision Regions</button>
              <button class="btn-cyber ${activeViewMode === 'annotated' ? 'btn-cyber-primary' : ''}" data-mode="annotated">Annotated</button>
            </div>
            <span class="badge-pill ${regions.length > 0 ? 'badge-success' : 'badge-waiting'}">
              ${regions.length} REGIONS
            </span>
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">👁️</div>
            <div class="empty-state-title">No Local Vision Perception Data</div>
            <div class="empty-state-desc">
              When RAVEN's M3 Vision milestone processes a screenshot through its local computer-vision model, visual segmentations and bounding boxes will display here.
            </div>
          </div>
        ` : `
          <div class="card-grid-2">
            <!-- Screenshot & Bounding Box Overlay Canvas -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">Visual Canvas Layer: ${activeViewMode.toUpperCase()}</div>
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                  ${screenshotUrl ? '100% viewport scale' : 'No bitmap'}
                </span>
              </div>

              <div class="browser-preview-box" style="position: relative;">
                ${screenshotUrl && activeViewMode !== 'regions' ? `
                  <img src="${screenshotUrl}" alt="Vision Source" class="browser-canvas-img" style="opacity: ${activeViewMode === 'annotated' ? '0.85' : '1.0'};" />
                ` : ''}

                ${activeViewMode === 'regions' && !screenshotUrl ? `
                  <div style="padding: 24px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
                    Rendering bounding box outlines only (no background screenshot).
                  </div>
                ` : ''}

                ${(activeViewMode === 'regions' || activeViewMode === 'annotated') ? `
                  <!-- Visual Bounding Box Elements Overlay -->
                  <div style="position: absolute; inset: 0; pointer-events: none;">
                    ${regions.map((reg, idx) => {
                      const box = reg.box || reg.bounding_box || { x: 10, y: 10, width: 60, height: 30 };
                      return `
                        <div style="
                          position: absolute;
                          left: ${box.x || 0}px;
                          top: ${box.y || 0}px;
                          width: ${box.width || 50}px;
                          height: ${box.height || 25}px;
                          border: 1.5px solid var(--color-cyan);
                          background: rgba(6, 182, 212, 0.12);
                          box-sizing: border-box;
                        ">
                          <span style="
                            position: absolute;
                            top: -16px;
                            left: 0;
                            background: var(--color-cyan);
                            color: #000;
                            font-size: 9px;
                            font-family: var(--font-mono);
                            font-weight: 700;
                            padding: 0 4px;
                            border-radius: 2px;
                            white-space: nowrap;
                          ">
                            ${reg.category || reg.label || `Region #${idx}`} (${Math.round((reg.confidence || 0) * 100)}%)
                          </span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Detected Visual Regions List -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">Detected Regions (${regions.length})</div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px; max-height: 480px; overflow-y: auto;">
                ${regions.length === 0 ? `
                  <div style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No visual regions detected.
                  </div>
                ` : regions.map((reg, idx) => `
                  <div class="ocr-block-item">
                    <div class="ocr-block-header">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="badge-pill" style="color: var(--text-cyan);">#${idx + 1}</span>
                        <span style="font-weight: 600; font-size: 12px;">${reg.category || reg.label || 'Uncategorized Region'}</span>
                      </div>
                      <span class="badge-pill badge-success">
                        ${Math.round((reg.confidence || 0) * 100)}% CONF
                      </span>
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                      Box: ${JSON.stringify(reg.box || reg.bounding_box || '—')}
                    </div>
                    ${reg.description ? `
                      <div style="font-size: 11.5px; color: var(--text-secondary);">
                        ${reg.description}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `}
      </div>
    `;

    container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeViewMode = e.currentTarget.getAttribute('data-mode');
        update();
      });
    });
  }

  store.subscribe(update);
  update();
}
