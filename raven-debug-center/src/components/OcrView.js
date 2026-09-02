/**
 * RAVEN Debug Center — OCR Panel (M4)
 * Displays extracted on-screen text blocks, character bounding boxes, confidence ratings,
 * and text search capabilities.
 */

import { store } from '../models/store.js';

export function renderOcrView(container) {
  let searchTerm = '';

  function update() {
    const state = store.getState();
    const ocr = state.ocr;
    const blocks = ocr.blocks || [];
    const hasData = blocks.length > 0;

    const filteredBlocks = blocks.filter(b => {
      if (!searchTerm) return true;
      return (b.text && b.text.toLowerCase().includes(searchTerm.toLowerCase()));
    });

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🔤</span>
              <span>M4 — Optical Character Recognition (OCR)</span>
            </div>
            <div class="panel-subtitle">
              Inspect on-screen text recognized via local OCR models, line segmentations, confidence values, and bounding coordinates.
            </div>
          </div>
          <span class="badge-pill ${hasData ? 'badge-success' : 'badge-waiting'}">
            ${hasData ? `${blocks.length} TEXT BLOCKS` : 'WAITING FOR M4'}
          </span>
        </div>

        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">Extracted Blocks</span>
            <span class="stat-box-value">${blocks.length}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Total Words</span>
            <span class="stat-box-value cyan">${ocr.totalWords || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Average Confidence</span>
            <span class="stat-box-value emerald">
              ${ocr.averageConfidence ? Math.round(ocr.averageConfidence * 100) + '%' : '0%'}
            </span>
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🔤</div>
            <div class="empty-state-title">No OCR Data Available</div>
            <div class="empty-state-desc">
              When RAVEN's M4 OCR milestone processes the viewport image, extracted text lines and their pixel coordinates will be indexed here.
            </div>
          </div>
        ` : `
          <div class="debug-card">
            <div class="filter-bar-row">
              <input
                type="text"
                class="search-input-cyber"
                id="ocr-search-input"
                placeholder="Search extracted text..."
                value="${searchTerm}"
              />
              <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">
                Showing ${filteredBlocks.length} of ${blocks.length} blocks
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 520px; overflow-y: auto;">
              ${filteredBlocks.length === 0 ? `
                <div style="text-align: center; padding: 24px; color: var(--text-muted); font-family: var(--font-mono);">
                  No text blocks matching "${searchTerm}"
                </div>
              ` : filteredBlocks.map((block, idx) => `
                <div class="ocr-block-item">
                  <div class="ocr-block-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="badge-pill">#${idx + 1}</span>
                      <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                        Bounding Box: ${JSON.stringify(block.box || block.bbox || '—')}
                      </span>
                    </div>
                    <span class="badge-pill ${block.confidence > 0.8 ? 'badge-success' : 'badge-waiting'}">
                      ${Math.round((block.confidence || 0) * 100)}% CONF
                    </span>
                  </div>

                  <div class="ocr-text-content">
                    ${block.text || '<span style="color: var(--text-muted); font-style: italic;">[Empty text]</span>'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `}
      </div>
    `;

    container.querySelector('#ocr-search-input')?.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      update();
    });
  }

  store.subscribe(update);
  update();
}
