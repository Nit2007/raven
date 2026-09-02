/**
 * RAVEN Debug Center — Live Browser State View
 * Shows actual browser state: URL, page title, iteration, last action, state change timestamp, and screenshot.
 * Displays "Waiting for browser connection" when no active connection exists.
 */

import { store } from '../models/store.js';

export function renderLiveBrowserView(container) {
  function update() {
    const state = store.getState();
    const browser = state.browser;
    const hasConnection = !!browser.url;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🌐</span>
              <span>Live Browser Target & Viewport</span>
            </div>
            <div class="panel-subtitle">
              Real-time synchronization with the browser tab under observation.
            </div>
          </div>
          <span class="badge-pill ${hasConnection ? 'badge-success' : 'badge-disconnected'}">
            ${hasConnection ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        <div class="card-grid-2">
          <!-- Metadata Table Card -->
          <div class="debug-card">
            <div class="card-title">Browser Session Metadata</div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div class="stat-box">
                <span class="stat-box-label">Current URL</span>
                <span style="font-family: var(--font-mono); font-size: 13px; color: var(--text-cyan); word-break: break-all;">
                  ${browser.url || '<span style="color: var(--text-muted);">Waiting for browser connection</span>'}
                </span>
              </div>

              <div class="stat-box">
                <span class="stat-box-label">Page Title</span>
                <span style="font-size: 13px; font-weight: 500; color: var(--text-primary);">
                  ${browser.title || '<span style="color: var(--text-muted); font-size: 12px; font-weight: normal;">(No page title detected)</span>'}
                </span>
              </div>

              <div class="stat-group-row">
                <div class="stat-box">
                  <span class="stat-box-label">Browser State</span>
                  <span class="stat-box-value" style="font-size: 14px;">${browser.state || 'Disconnected'}</span>
                </div>
                <div class="stat-box">
                  <span class="stat-box-label">Current Iteration</span>
                  <span class="stat-box-value cyan">#${browser.iteration || 0}</span>
                </div>
              </div>

              <div class="stat-box">
                <span class="stat-box-label">Last Executed Action</span>
                <span style="font-family: var(--font-mono); font-size: 12.5px; color: var(--text-secondary);">
                  ${browser.lastAction ? JSON.stringify(browser.lastAction) : '<span style="color: var(--text-muted);">None executed yet</span>'}
                </span>
              </div>

              <div class="stat-box">
                <span class="stat-box-label">Last State Change</span>
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">
                  ${browser.lastStateChange ? new Date(browser.lastStateChange).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </div>

          <!-- Screenshot Viewport Card -->
          <div class="debug-card">
            <div class="card-header-row">
              <div class="card-title">Viewport Capture (M1 Output)</div>
              ${browser.screenshotUrl ? '<span class="badge-pill badge-success">RAW BITMAP</span>' : ''}
            </div>

            <div class="browser-preview-box">
              ${browser.screenshotUrl ? `
                <img src="${browser.screenshotUrl}" alt="Live browser viewport screenshot" class="browser-canvas-img" />
              ` : `
                <div class="empty-state" style="border: none; background: transparent;">
                  <div class="empty-state-icon">🖥️</div>
                  <div class="empty-state-title">Waiting for browser connection</div>
                  <div class="empty-state-desc">
                    When RAVEN's M1 screenshot milestone captures the active tab, the live viewport image will render here.
                  </div>
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  store.subscribe(update);
  update();
}
