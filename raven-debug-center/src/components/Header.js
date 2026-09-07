/**
 * RAVEN Debug Center — Header Component
 * Displays system connection, iteration, active URL, pipeline latency, and privacy status.
 */

import { store } from '../models/store.js';
import { CONNECTION_STATUS, PRIVACY_GATE_STATUS } from '../models/types.js';
import { exportDebugTrace } from '../services/exportService.js';

export function renderHeader(container) {
  function update() {
    const state = store.getState();
    const conn = state.connection;
    const telemetry = state.telemetry;
    const milestones = state.milestones;
    const fusion = state.fusion;
    const privacy = state.privacy;

    const isConnected = conn.status === CONNECTION_STATUS.CONNECTED;
    const isConnecting = conn.status === CONNECTION_STATUS.CONNECTING;

    let connBadgeClass = 'badge-disconnected';
    let connDotClass = 'disconnected';
    let connText = 'SYSTEM DISCONNECTED';

    if (isConnected) {
      connBadgeClass = 'badge-success';
      connDotClass = 'connected';
      connText = 'SYSTEM CONNECTED';
    } else if (isConnecting) {
      connBadgeClass = 'badge-running';
      connDotClass = 'waiting';
      connText = 'CONNECTING...';
    }

    const totalPipelineLatency =
      (milestones.M1.executionTimeMs || 0) +
      (milestones.M2.executionTimeMs || 0) +
      (milestones.M3.executionTimeMs || 0) +
      (milestones.M4.executionTimeMs || 0) +
      (milestones.M5.executionTimeMs || 0) +
      (milestones.M6.executionTimeMs || 0);

    const isBlocked = !!fusion.blockedReason || privacy.gateStatus === PRIVACY_GATE_STATUS.BREACH_DETECTED;
    const isPassed = fusion.privacyGatePassed || privacy.gateStatus === PRIVACY_GATE_STATUS.PASSED;

    let privacyBadgeClass = 'badge-waiting';
    let privacyText = 'PRIVACY: STANDBY';
    if (isBlocked) {
      privacyBadgeClass = 'badge-error';
      privacyText = 'PRIVACY: BLOCKED';
    } else if (isPassed) {
      privacyBadgeClass = 'badge-success';
      privacyText = 'PRIVACY: PROTECTED';
    }

    const currentUrlDisplay = telemetry.currentUrl || state.browser.url || 'No active page';
    const nowTime = new Date().toLocaleTimeString();

    container.innerHTML = `
      <div class="app-header-el">
        <div class="header-left">
          <div class="brand-badge">
            <div class="brand-logo-icon" style="background: linear-gradient(135deg, #8b5cf6, #06b6d4);">R</div>
            <div>
              <div class="brand-title">RAVEN</div>
              <div class="brand-subtitle">Privacy-First Autonomous Browser Agent</div>
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
            <span class="telemetry-value">#${telemetry.iteration || state.browser.iteration || 0}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">ACTIVE TAB</span>
            <span class="telemetry-value telemetry-url" title="${currentUrlDisplay}">${currentUrlDisplay}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">PIPELINE</span>
            <span class="telemetry-value" style="color: var(--text-emerald); font-weight: 700;">
              ${totalPipelineLatency > 0 ? totalPipelineLatency + ' ms' : '--'}
            </span>
          </div>

          <div class="telemetry-chip ${privacyBadgeClass}">
            <span style="font-weight: 700;">${privacyText}</span>
          </div>

          <div class="telemetry-chip">
            <span class="telemetry-label">CLOCK</span>
            <span class="telemetry-value" id="header-clock">${nowTime}</span>
          </div>
        </div>

        <div class="header-right">
          <button class="btn-cyber" id="header-export-btn" title="Export session trace as JSON">
            <span>📥</span>
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
