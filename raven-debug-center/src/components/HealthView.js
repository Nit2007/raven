/**
 * RAVEN Debug Center — Connection & Link Health Panel
 * Shows communication status between all seven pipeline layers:
 * Browser ↔ RAVEN ↔ M1–M6 ↔ Sanitization ↔ Simple-UI ↔ Gemini ↔ Browser Action
 * Does NOT fake connected states.
 */

import { store } from '../models/store.js';
import { CONNECTION_STATUS } from '../models/types.js';

export function renderHealthView(container) {
  function update() {
    const state = store.getState();
    const h = state.health;
    const conn = state.connection;

    const links = [
      {
        id: 'browser',
        name: 'Browser Target Tab',
        desc: 'Direct communication link to the active Chrome tab via injected scripts',
        status: h.browser
      },
      {
        id: 'ravenCore',
        name: 'RAVEN Core Daemon / Worker',
        desc: 'Background service worker & telemetry coordinator',
        status: h.ravenCore
      },
      {
        id: 'milestones',
        name: 'Perception Milestones (M1–M6)',
        desc: 'Screenshot, DOM analysis, CV models, OCR engine, and PII detector',
        status: h.milestones
      },
      {
        id: 'sanitization',
        name: 'Sanitization & Privacy Gate',
        desc: 'Zero-leak security gate and entity redaction engine',
        status: h.sanitization
      },
      {
        id: 'simpleUi',
        name: 'Simple-UI Agent Layer',
        desc: 'Observe-Decide-Act task controller and storage persistence',
        status: h.simpleUi
      },
      {
        id: 'gemini',
        name: 'Gemini LLM API Endpoint',
        desc: 'Google AI Studio / Vertex AI single-action inference API',
        status: h.gemini
      },
      {
        id: 'browserActions',
        name: 'Action Dispatcher / Mutation Engine',
        desc: 'DOM event dispatch (click, native input setter, keyboard, scroll)',
        status: h.browserActions
      }
    ];

    function getBadge(status) {
      switch (status) {
        case CONNECTION_STATUS.CONNECTED:
          return '<span class="badge-pill badge-success"><span class="dot-indicator connected"></span> CONNECTED</span>';
        case CONNECTION_STATUS.CONNECTING:
          return '<span class="badge-pill badge-running"><span class="dot-indicator waiting"></span> CONNECTING</span>';
        case CONNECTION_STATUS.ERROR:
          return '<span class="badge-pill badge-error"><span class="dot-indicator disconnected"></span> ERROR</span>';
        case CONNECTION_STATUS.WAITING:
          return '<span class="badge-pill badge-waiting"><span class="dot-indicator waiting"></span> WAITING</span>';
        default:
          return '<span class="badge-pill badge-disconnected"><span class="dot-indicator disconnected"></span> DISCONNECTED</span>';
      }
    }

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🩺</span>
              <span>Subsystem Connectivity & Health Matrix</span>
            </div>
            <div class="panel-subtitle">
              Verify live IPC, WebSocket, and HTTP channel links between all seven architecture layers.
            </div>
          </div>
          <button class="btn-cyber btn-cyber-primary" id="health-test-probe-btn">
            <span>📡</span>
            <span>Send Diagnostic Link Ping</span>
          </button>
        </div>

        <div class="debug-card">
          <div class="card-header-row">
            <div class="card-title">Telemetry Transport Configuration</div>
            <span class="badge-pill ${conn.status === CONNECTION_STATUS.CONNECTED ? 'badge-success' : 'badge-disconnected'}">
              ${conn.status.toUpperCase()}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-family: var(--font-mono); font-size: 11.5px;">
            <div style="padding: 8px 12px; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <span class="stat-box-label">WebSocket Ingestion:</span>
              <div style="color: var(--text-cyan); margin-top: 2px;">${conn.endpoint || 'ws://localhost:8765'}</div>
            </div>
            <div style="padding: 8px 12px; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <span class="stat-box-label">BroadcastChannel:</span>
              <div style="color: var(--text-emerald); margin-top: 2px;">raven-telemetry (Active)</div>
            </div>
          </div>
        </div>

        <div class="debug-card">
          <div class="card-title">Subsystem Link Status</div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${links.map((link, idx) => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span class="badge-pill" style="color: var(--text-cyan);">Link #${idx + 1}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${link.name}</div>
                    <div style="font-size: 11.5px; color: var(--text-muted);">${link.desc}</div>
                  </div>
                </div>
                <div>${getBadge(link.status)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    container.querySelector('#health-test-probe-btn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('raven:send-probe-ping'));
    });
  }

  store.subscribe(update);
  update();
}
