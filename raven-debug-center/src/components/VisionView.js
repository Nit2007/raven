/**
 * RAVEN Debug Center — Vision Panel (M3)
 * Displays detected visual hypotheses, bounding boxes, confidence, auditable geometric properties,
 * and renders a privacy-safe overlay (using the M5-redacted screenshot when available).
 */

import { store } from '../models/store.js';

export function renderVisionView(container) {
  let activeViewMode = 'annotated'; // 'original' | 'regions' | 'annotated'
  let selectedCategoryFilter = 'ALL';
  let hoveredRegionId = null;

  function update() {
    const state = store.getState();
    const vision = state.vision || {};
    const browser = state.browser || {};
    const privacy = state.privacy || {};
    const milestoneM3 = state.milestones?.M3 || {};

    const regions = vision.regions || [];
    // User refinement #5: Prefer the M5-redacted screenshot so developer UI does not expose secrets
    const screenshotUrl = privacy.screenshotUrl || vision.sourceScreenshotUrl || browser.screenshotUrl;
    const hasData = regions.length > 0 || !!screenshotUrl;

    const screenshotWidth = vision.screenshotWidth || (screenshotUrl ? 'Dynamic' : '—');
    const screenshotHeight = vision.screenshotHeight || '';
    const dimsLabel = vision.screenshotWidth && vision.screenshotHeight
      ? `${vision.screenshotWidth} × ${vision.screenshotHeight} px`
      : (screenshotUrl ? 'Native Viewport' : '—');

    const detectorName = vision.detector || milestoneM3.details?.detector || 'morphological-cv-v1';
    const latencyMs = vision.processingTimeMs || milestoneM3.executionTimeMs || 0;

    // Filter regions by selected category
    const filteredRegions = selectedCategoryFilter === 'ALL'
      ? regions
      : regions.filter(r => (r.type || r.category || '').toUpperCase().includes(selectedCategoryFilter));

    // Hypothesis colors for distinct visual clarity
    const getTypeColor = (type) => {
      const t = (type || '').toLowerCase();
      if (t.includes('button')) return { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)', label: '#0891b2' };
      if (t.includes('input')) return { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.16)', label: '#2563eb' };
      if (t.includes('text')) return { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', label: '#d97706' };
      if (t.includes('image')) return { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.16)', label: '#9333ea' };
      if (t.includes('container')) return { border: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: '#059669' };
      return { border: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)', label: '#64748b' };
    };

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>👁️</span>
              <span>M3 — Local Vision Perception (Morphological CV)</span>
            </div>
            <div class="panel-subtitle">
              Inspect visual geometric hypotheses, spatial bounding boxes, auditable properties, and privacy-safe overlays.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="nav-container" style="background: var(--bg-surface-elevated); padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <button class="btn-cyber ${activeViewMode === 'original' ? 'btn-cyber-primary' : ''}" data-mode="original">Original</button>
              <button class="btn-cyber ${activeViewMode === 'regions' ? 'btn-cyber-primary' : ''}" data-mode="regions">Boxes Only</button>
              <button class="btn-cyber ${activeViewMode === 'annotated' ? 'btn-cyber-primary' : ''}" data-mode="annotated">Annotated</button>
            </div>
            <span class="badge-pill ${regions.length > 0 ? 'badge-success' : 'badge-waiting'}">
              ${regions.length} DETECTIONS
            </span>
          </div>
        </div>

        <!-- M3 Telemetry Metrics Header -->
        <div class="stat-group-row" style="margin-bottom: 12px;">
          <div class="stat-box">
            <span class="stat-box-label">Screenshot Dimensions</span>
            <span class="stat-box-value cyan" style="font-size: 14px;">${dimsLabel}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Detections</span>
            <span class="stat-box-value emerald">${regions.length}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Processing Time</span>
            <span class="stat-box-value violet">${latencyMs} ms</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Detector</span>
            <span class="stat-box-value" style="font-size: 13px; font-family: var(--font-mono);">${detectorName}</span>
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
          <!-- Category Filter Bar -->
          <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;">
            ${['ALL', 'BUTTON', 'INPUT', 'TEXT', 'CONTAINER', 'IMAGE'].map(cat => `
              <button class="btn-cyber ${selectedCategoryFilter === cat ? 'btn-cyber-primary' : ''}" data-cat="${cat}" style="font-size: 11px; padding: 4px 10px;">
                ${cat}
              </button>
            `).join('')}
          </div>

          <div class="card-grid-2">
            <!-- Screenshot & Bounding Box Overlay Canvas -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">
                  Visual Canvas Layer: ${activeViewMode.toUpperCase()}
                  ${privacy.screenshotUrl ? '<span style="color: var(--color-emerald); font-size: 10px; margin-left: 6px;">[PROTECTED / REDACTED]</span>' : ''}
                </div>
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                  ${filteredRegions.length} shown
                </span>
              </div>

              <div class="browser-preview-box" style="position: relative; overflow: hidden; border-radius: var(--radius-sm); background: #090d16;">
                ${screenshotUrl && activeViewMode !== 'regions' ? `
                  <img src="${screenshotUrl}" alt="Vision Source" class="browser-canvas-img" style="display: block; width: 100%; height: auto; opacity: ${activeViewMode === 'annotated' ? '0.88' : '1.0'};" />
                ` : ''}

                ${activeViewMode === 'regions' && !screenshotUrl ? `
                  <div style="padding: 36px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
                    Rendering bounding box outlines only (no background screenshot).
                  </div>
                ` : ''}

                ${(activeViewMode === 'regions' || activeViewMode === 'annotated') ? `
                  <!-- Visual Bounding Box Elements Overlay (SVG Canvas) -->
                  <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
                       viewBox="0 0 ${vision.screenshotWidth || 1280} ${vision.screenshotHeight || 800}"
                       preserveAspectRatio="none">
                    ${filteredRegions.map((reg) => {
                      const box = Array.isArray(reg.bbox)
                        ? { x: reg.bbox[0], y: reg.bbox[1], width: reg.bbox[2], height: reg.bbox[3] }
                        : (reg.box || { x: 0, y: 0, width: 0, height: 0 });
                      const colors = getTypeColor(reg.type || reg.category);
                      const isHovered = hoveredRegionId === reg.id;

                      return `
                        <g id="svg-${reg.id}">
                          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"
                                fill="${colors.bg}"
                                stroke="${colors.border}"
                                stroke-width="${isHovered ? '3' : '1.5'}"
                                stroke-dasharray="${(reg.type || '').includes('container') ? '4 2' : 'none'}" />
                          <rect x="${box.x}" y="${Math.max(0, box.y - 14)}" width="${Math.min(box.width, 160)}" height="14"
                                fill="${colors.label}" rx="2" />
                          <text x="${box.x + 4}" y="${Math.max(10, box.y - 3)}"
                                fill="#ffffff" font-size="9" font-family="monospace" font-weight="700">
                            ${reg.type || reg.category || 'region'} (${Math.round((reg.confidence || 0) * 100)}%)
                          </text>
                        </g>
                      `;
                    }).join('')}
                  </svg>
                ` : ''}
              </div>
            </div>

            <!-- Detected Visual Hypotheses List & Auditable Properties -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">Visual Hypotheses (${filteredRegions.length})</div>
                <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                  Auditable Metrics
                </span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px; max-height: 520px; overflow-y: auto;">
                ${filteredRegions.length === 0 ? `
                  <div style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No visual regions match filter.
                  </div>
                ` : filteredRegions.map((reg, idx) => {
                  const colors = getTypeColor(reg.type || reg.category);
                  const props = reg.properties || {};
                  const box = Array.isArray(reg.bbox) ? reg.bbox : [reg.box?.x, reg.box?.y, reg.box?.width, reg.box?.height];

                  return `
                    <div class="ocr-block-item" data-region-id="${reg.id}" style="border-left: 3px solid ${colors.border};">
                      <div class="ocr-block-header">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span class="badge-pill" style="color: ${colors.border};">#${idx + 1}</span>
                          <span style="font-weight: 700; font-size: 12px; font-family: var(--font-mono); color: ${colors.border};">
                            ${reg.type || reg.category || 'region'}
                          </span>
                        </div>
                        <span class="badge-pill badge-success">
                          ${Math.round((reg.confidence || 0) * 100)}% CONF
                        </span>
                      </div>

                      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                        BBox: [${box.join(', ')}] | Center: [${(reg.center || []).join(', ')}] | Area: ${reg.area || box[2] * box[3]} px²
                      </div>

                      <!-- Auditable Measurable Properties (No Black Box) -->
                      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 6px; font-family: var(--font-mono); font-size: 10px; background: rgba(0,0,0,0.25); padding: 6px; border-radius: var(--radius-sm);">
                        <div><span style="color: var(--text-muted);">Aspect Ratio:</span> <b>${props.aspectRatio || (box[3] ? (box[2]/box[3]).toFixed(2) : '—')}</b></div>
                        <div><span style="color: var(--text-muted);">Edge Density:</span> <b>${props.edgeDensity !== undefined ? props.edgeDensity : '—'}</b></div>
                        <div><span style="color: var(--text-muted);">Rectangularity:</span> <b>${props.rectangularity !== undefined ? props.rectangularity : '—'}</b></div>
                        <div><span style="color: var(--text-muted);">Color Variance:</span> <b>${props.colorVariance !== undefined ? props.colorVariance : '—'}</b></div>
                        <div><span style="color: var(--text-muted);">Relative Width:</span> <b>${props.relativeWidth !== undefined ? (props.relativeWidth * 100).toFixed(1) + '%' : '—'}</b></div>
                        <div><span style="color: var(--text-muted);">Rel Position:</span> <b>${props.relativePosition ? `${props.relativePosition.xPercent}%, ${props.relativePosition.yPercent}%` : '—'}</b></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `}
      </div>
    `;

    // Bind view mode buttons
    container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeViewMode = e.currentTarget.getAttribute('data-mode');
        update();
      });
    });

    // Bind category filter buttons
    container.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectedCategoryFilter = e.currentTarget.getAttribute('data-cat');
        update();
      });
    });

    // Bind item hover events
    container.querySelectorAll('[data-region-id]').forEach(item => {
      item.addEventListener('mouseenter', (e) => {
        hoveredRegionId = e.currentTarget.getAttribute('data-region-id');
        const svgEl = container.querySelector(`#svg-${hoveredRegionId}`);
        if (svgEl) {
          const rect = svgEl.querySelector('rect');
          if (rect) rect.setAttribute('stroke-width', '3.5');
        }
      });
      item.addEventListener('mouseleave', () => {
        hoveredRegionId = null;
        const svgEl = container.querySelector(`#svg-${hoveredRegionId}`);
        if (svgEl) {
          const rect = svgEl.querySelector('rect');
          if (rect) rect.setAttribute('stroke-width', '1.5');
        }
      });
    });
  }

  store.subscribe(update);
  update();
}
