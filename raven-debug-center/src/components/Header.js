/**
 * RAVEN Debug Center — Header Component
 */

import { store } from '../models/store.js';
import { CONNECTION_STATUS } from '../models/types.js';
import { exportDebugTrace } from '../services/exportService.js';

export function renderHeader(container) {
  function update() {
    const state = store.getState();
    const conn = state.connection;
    const telemetry = state.telemetry;

    const isConnected = conn.status === CONNECTION_STATUS.CONNECTED;
    const isConnecting = conn.status === CONNECTION_STATUS.CONNECTING;

    let connBadgeClass = 'badge-disconnected';
    let connDotClass = 'disconnected';
    let connText = 'System Disconnected';

    if (isConnected) {
      connBadgeClass = 'badge-success';
      connDotClass = 'connected';
      connText = 'System Connected';
    } else if (isConnecting) {
      connBadgeClass = 'badge-running';
      connDotClass = 'waiting';
      connText = 'Connecting...';
    }

    const currentUrlDisplay = telemetry.currentUrl || 'No active page';
    const nowTime = new Date().toLocaleTimeString();

    container.innerHTML = `
      <div class="app-header-el">
        <div class="header-left">
          <div class="brand-badge">
            <div class="brand-logo-icon">R</div>
            <div>
              <div class="brand-title">RAVEN Debug Center</div>
              <div class="brand-subtitle">Autonomous Browser Agent Observability</div>
            </div>
          </div>
        </div>

        <div class="header-center">
          <div class="telemetry-chip ${connBadgeClass}">
            <span class="dot-indicator ${connDotClass}"></span>
            <span>${connText}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">ITERATION</span>
            <span class="telemetry-value">#${telemetry.iteration}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">URL</span>
            <span class="telemetry-value telemetry-url" title="${telemetry.currentUrl || ''}">${currentUrlDisplay}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">CLOCK</span>
            <span class="telemetry-value" id="header-clock">${nowTime}</span>
          </div>
        </div>

        <div class="header-right">
          <button class="btn-cyber" id="header-export-btn" title="Export session trace as JSON">
            <span>💾</span>
            <span>Export Trace</span>
          </button>
          <button class="btn-cyber btn-cyber-primary" id="header-settings-btn" title="Configure connection">
            <span>⚙️</span>
            <span>Connection</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('header-export-btn')?.addEventListener('click', () => {
      exportDebugTrace();
    });

    document.getElementById('header-settings-btn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('raven:open-connection-modal'));
    });
  }

  // Update clock every second
  setInterval(() => {
    const clockEl = document.getElementById('header-clock');
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }, 1000);

  store.subscribe(update);
  update();
}
