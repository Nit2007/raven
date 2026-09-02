/**
 * RAVEN Debug Center — Connection & Telemetry Settings Modal
 */

import { store } from '../models/store.js';
import { telemetryReceiver } from '../services/telemetryReceiver.js';
import { CONNECTION_STATUS } from '../models/types.js';

export function renderConnectionModal(container) {
  let isOpen = false;

  function render() {
    if (!isOpen) {
      container.innerHTML = '';
      return;
    }

    const state = store.getState();
    const conn = state.connection;
    const isConnected = conn.status === CONNECTION_STATUS.CONNECTED;
    const isConnecting = conn.status === CONNECTION_STATUS.CONNECTING;

    container.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-card" id="modal-card">
          <div class="modal-header">
            <div class="modal-title">⚙️ Telemetry Ingestion Bridge Settings</div>
            <button class="modal-close-btn" id="modal-close-btn">&times;</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">WebSocket Telemetry URL</label>
              <input
                type="text"
                class="form-input"
                id="ws-endpoint-input"
                value="${conn.endpoint || 'ws://localhost:8765'}"
                ${isConnected || isConnecting ? 'disabled' : ''}
              />
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                Target daemon or background telemetry bridge listening for debug clients.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">BroadcastChannel Bridge</label>
              <input
                type="text"
                class="form-input"
                value="raven-telemetry"
                disabled
              />
              <span style="font-size: 11px; color: var(--text-emerald); font-family: var(--font-mono);">
                ✓ Active: Listening for extension content scripts and tabs in this browser.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">postMessage Listener</label>
              <div style="font-size: 11.5px; color: var(--text-secondary); background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono);">
                window.addEventListener('message', ...) [ACTIVE]
              </div>
            </div>

            <div style="padding: 10px 12px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
              <span style="font-family: var(--font-mono); font-size: 12px;">Link Status:</span>
              <span class="badge-pill ${isConnected ? 'badge-success' : isConnecting ? 'badge-running' : 'badge-disconnected'}">
                ${conn.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cyber" id="modal-ping-btn">
              <span>📡</span>
              <span>Send Probe Ping</span>
            </button>
            <button class="btn-cyber" id="modal-reset-btn" title="Reset all current session data">
              <span>🗑️</span>
              <span>Clear Session</span>
            </button>
            ${isConnected ? `
              <button class="btn-cyber" style="border-color: var(--border-rose); color: var(--text-rose);" id="modal-disconnect-btn">
                Disconnect
              </button>
            ` : `
              <button class="btn-cyber btn-cyber-primary" id="modal-connect-btn" ${isConnecting ? 'disabled' : ''}>
                ${isConnecting ? 'Connecting...' : 'Connect WebSocket'}
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    // Event handlers
    container.querySelector('#modal-close-btn')?.addEventListener('click', closeModal);
    container.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });

    container.querySelector('#modal-connect-btn')?.addEventListener('click', () => {
      const endpoint = container.querySelector('#ws-endpoint-input').value.trim();
      telemetryReceiver.connectWebSocket(endpoint);
      render();
    });

    container.querySelector('#modal-disconnect-btn')?.addEventListener('click', () => {
      telemetryReceiver.disconnectWebSocket();
      render();
    });

    container.querySelector('#modal-ping-btn')?.addEventListener('click', () => {
      telemetryReceiver.sendProbePing();
    });

    container.querySelector('#modal-reset-btn')?.addEventListener('click', () => {
      if (confirm('Clear all stored debug telemetry and reset to empty state?')) {
        store.clearSession();
        closeModal();
      }
    });
  }

  function openModal() {
    isOpen = true;
    render();
  }

  function closeModal() {
    isOpen = false;
    render();
  }

  window.addEventListener('raven:open-connection-modal', openModal);
  window.addEventListener('raven:send-probe-ping', () => {
    telemetryReceiver.sendProbePing();
  });
  store.subscribe(() => {
    if (isOpen) render();
  });
}
