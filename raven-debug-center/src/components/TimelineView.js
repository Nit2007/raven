/**
 * RAVEN Debug Center — Event Timeline View
 * Chronological event trail tracking lifecycle transitions across M1–M6,
 * Privacy Gate, Simple-UI, and Browser mutations.
 */

import { store } from '../models/store.js';

export function renderTimelineView(container) {
  let filterComponent = 'ALL';
  let searchTerm = '';
  const expandedEvents = new Set();

  function update() {
    const state = store.getState();
    const events = state.timeline || [];

    // Filter events
    const filteredEvents = events.filter(evt => {
      const matchComp = filterComponent === 'ALL' || (evt.component && evt.component.toUpperCase() === filterComponent.toUpperCase());
      const matchSearch = !searchTerm ||
        (evt.event && evt.event.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (evt.component && evt.component.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchComp && matchSearch;
    });

    const componentsList = ['ALL', 'M1_SCREENSHOT', 'M2_DOM', 'M3_VISION', 'M4_OCR', 'M5_PII', 'M6_FUSION', 'PRIVACY_GATE', 'SIMPLE_UI_GEMINI', 'BROWSER_ACTION', 'TELEMETRY_BRIDGE'];

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>⏱️</span>
              <span>Chronological Event Timeline & Audit Log</span>
            </div>
            <div class="panel-subtitle">
              Inspect step transitions, micro-latencies, error traces, and payload receipts recorded in real execution order.
            </div>
          </div>
          <span class="badge-pill">${events.length} TOTAL EVENTS</span>
        </div>

        <div class="filter-bar-row" style="background: var(--bg-surface-card); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-default);">
          <input
            type="text"
            class="search-input-cyber"
            id="timeline-search-input"
            placeholder="Filter event name or metadata..."
            value="${searchTerm}"
          />

          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">Component:</label>
            <select id="timeline-comp-select" class="form-input" style="padding: 4px 8px; font-size: 11.5px;">
              ${componentsList.map(c => `<option value="${c}" ${filterComponent === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>

        ${events.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">⏱️</div>
            <div class="empty-state-title">Event Log Empty</div>
            <div class="empty-state-desc">
              When RAVEN starts executing steps, chronological lifecycle events (such as M1_CAPTURE_STARTED, M6_FUSION_COMPLETED, GEMINI_DECISION_RECEIVED) will stream in with exact millisecond timings.
            </div>
          </div>
        ` : `
          <div class="timeline-list">
            ${filteredEvents.length === 0 ? `
              <div style="padding: 24px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
                No events matching selected filters.
              </div>
            ` : filteredEvents.map(evt => {
              const isExpanded = expandedEvents.has(evt.id);
              const compKey = (evt.component || 'system').toLowerCase();
              let compClass = 'm1';
              if (compKey.includes('m2') || compKey.includes('dom')) compClass = 'm2';
              else if (compKey.includes('m3') || compKey.includes('vision')) compClass = 'm3';
              else if (compKey.includes('m4') || compKey.includes('ocr')) compClass = 'm4';
              else if (compKey.includes('m5') || compKey.includes('pii')) compClass = 'm5';
              else if (compKey.includes('m6') || compKey.includes('fusion')) compClass = 'm6';
              else if (compKey.includes('privacy')) compClass = 'privacy-gate';
              else if (compKey.includes('gemini') || compKey.includes('agent')) compClass = 'agent';
              else if (compKey.includes('browser') || compKey.includes('action')) compClass = 'browser';

              return `
                <div class="timeline-item ${evt.status || 'info'}" id="${evt.id}">
                  <div class="timeline-marker">
                    ${evt.status === 'success' ? '✓' : evt.status === 'error' ? '✕' : '•'}
                  </div>

                  <div class="timeline-content-card">
                    <div class="timeline-header-line">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="component-chip ${compClass}">${evt.component || 'SYSTEM'}</span>
                        <span class="timeline-event-name">${evt.event}</span>
                      </div>
                      <div class="timeline-meta-chips">
                        ${evt.latencyMs !== null && evt.latencyMs !== undefined ? `
                          <span class="latency-badge">⚡ ${evt.latencyMs}ms</span>
                        ` : ''}
                        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                          ${new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    ${evt.metadata ? `
                      <button class="timeline-details-toggle" data-toggle="${evt.id}">
                        ${isExpanded ? 'Hide Payload ▲' : 'View Payload ▼'}
                      </button>

                      ${isExpanded ? `
                        <div class="json-metadata-box">
                          <pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(evt.metadata, null, 2)}</pre>
                        </div>
                      ` : ''}
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Bind event interactions
    container.querySelector('#timeline-search-input')?.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      update();
    });

    container.querySelector('#timeline-comp-select')?.addEventListener('change', (e) => {
      filterComponent = e.target.value;
      update();
    });

    container.querySelectorAll('.timeline-details-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-toggle');
        if (expandedEvents.has(id)) expandedEvents.delete(id);
        else expandedEvents.add(id);
        update();
      });
    });
  }

  store.subscribe(update);
  update();
}
